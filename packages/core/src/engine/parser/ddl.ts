import type { SerialTypeName } from "../../schema/normalize.js";
import type {
	AlterAction,
	ColumnDef,
	LikeClause,
	TableConstraint,
	TableRef,
} from "../ast.js";
import type { OpTok, StrTok, Tok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseExpr, ParseExprList } from "./expr.js";
import type { ParseSelectStmt, RefOf } from "./select.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Ident,
	Nx,
	Nx2,
	Nx3,
	Ok,
	ParenIdentList,
	QualName,
	SkipToCloseParen,
	SkipWord,
	SkipWords,
	SyntaxErrorAt,
} from "./util.js";

/**
 * DDL / utility statement parser (index-based, see util.ts).
 *
 * `ParseDdl<T, I>` receives the whole token tuple and the index of the first word
 * (CREATE / ALTER / DROP / ...) and returns `Ok<DdlStmt, next>` or an `SqlError`. The
 * caller checks that `next` is the end of input or a `;`.
 *
 * Statements with a schema effect are parsed structurally, including their trailing
 * clauses, so unsupported syntax is an error rather than silently ignored:
 *   CREATE TABLE (column defs, table constraints, LIKE, INHERITS, PARTITION OF / BY, OF type,
 *   storage options, `AS select | AS EXECUTE [WITH [NO] DATA]`), ALTER TABLE / VIEW / MATERIALIZED VIEW,
 *   DROP TABLE / VIEW, CREATE [OR REPLACE] [MATERIALIZED | RECURSIVE] VIEW, CREATE TYPE ... AS ENUM,
 *   ALTER TYPE, DROP TYPE, CREATE SCHEMA (with its elements), ALTER / DROP SCHEMA.
 *
 * Everything else (indexes, functions, triggers, sequences, grants, transaction control,
 * SET, COMMENT, composite types, domains, ...) is a `NoopStmt`: tokens are skipped up to
 * the next top-level `;` (or end of input), so the statement has no schema effect.
 * Function bodies written as `BEGIN ATOMIC ... END` are skipped as a unit.
 */
export type ParseDdl<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "create"
			? ParseCreate<T, Nx<I>, false>
			: W extends "alter"
				? ParseAlter<T, Nx<I>>
				: W extends "drop"
					? ParseDrop<T, Nx<I>>
					: Noop<T, I, W>
		: SyntaxErrorAt<T, I>; // type-mutate: equivalent – ParseStatement calls it only on a DDL keyword

type Noop<T extends Toks, I extends number, What extends string> = Ok<
	{ t: "noop"; what: What },
	SkipToStmtEnd<T, I>
>;

// ───────────────────────────── skipping ─────────────────────────────

/**
 * Advance to the first depth-0 operator in `Stop` (not consumed), or to the end of
 * input. Parentheses are balanced so `,` / `;` inside them are not terminators.
 */
export type SkipUntil<
	T extends Toks,
	I extends number,
	Stop extends string,
	D extends readonly unknown[] = [],
> =
	T[I] extends OpTok<infer O>
		? D extends readonly [unknown, ...infer D2]
			? O extends "("
				? SkipUntil<T, Nx<I>, Stop, [...D, 0]>
				: O extends ")"
					? SkipUntil<T, Nx<I>, Stop, D2>
					: SkipUntil<T, Nx<I>, Stop, D>
			: O extends Stop
				? I
				: O extends "("
					? SkipUntil<T, Nx<I>, Stop, [0]>
					: SkipUntil<T, Nx<I>, Stop, D>
		: T[I] extends Tok
			? SkipUntil<T, Nx<I>, Stop, D>
			: I;

/** Index of the next top-level `;`, or the end of input. */
export type SkipToStmtEnd<T extends Toks, I extends number> = SkipUntil<
	T,
	I,
	";"
>;
/** Index of the `,` / `)` ending a CREATE TABLE element. */
type SkipToElementEnd<T extends Toks, I extends number> = SkipUntil<
	T,
	I,
	"," | ")"
>;
/** Index of the `,` / `;` ending an ALTER TABLE action. */
type SkipToActionEnd<T extends Toks, I extends number> = SkipUntil<
	T,
	I,
	"," | ";"
>;

/**
 * Skip a routine definition (CREATE FUNCTION / PROCEDURE) to its terminating `;`. A
 * SQL-standard body `BEGIN ATOMIC stmt; ... END` contains `;`, so it is skipped up to
 * its `END` (CASE ... END pairs inside are counted), which ends the routine; without its `END`, a
 * syntax error at the end.
 */
type SkipRoutine<T extends Toks, I extends number> =
	T[I] extends OpTok<";">
		? I
		: T[I] extends WordTok<"begin">
			? T[Nx<I>] extends WordTok<"atomic">
				? SkipAtomic<T, Nx2<I>, []> // the body comes last
				: SkipRoutine<T, Nx<I>>
			: T[I] extends OpTok<"(">
				? SkipToCloseParen<T, Nx<I>> extends infer J
					? J extends number
						? SkipRoutine<T, J>
						: J
					: never
				: T[I] extends Tok
					? SkipRoutine<T, Nx<I>>
					: I;
type SkipAtomic<
	T extends Toks,
	I extends number,
	D extends readonly unknown[],
> =
	T[I] extends WordTok<"case">
		? SkipAtomic<T, Nx<I>, [...D, 0]>
		: T[I] extends WordTok<"end">
			? D extends readonly [unknown, ...infer D2]
				? SkipAtomic<T, Nx<I>, D2>
				: Nx<I>
			: T[I] extends Tok
				? SkipAtomic<T, Nx<I>, D>
				: SyntaxErrorAt<T, I>;

/** `Ok<Node, index of the routine's ;>`, or SkipRoutine's error. */
type RoutineEnd<T extends Toks, I extends number, Node> =
	SkipRoutine<T, I> extends infer J
		? J extends number
			? Ok<Node, J>
			: J
		: never;

/** Skip `( ... )` if token `I` is `(`. */
type SkipParenOpt<T extends Toks, I extends number> =
	T[I] extends OpTok<"("> ? SkipToCloseParen<T, Nx<I>> : I;

/** `[IF EXISTS]` → `[flag, next]`. */
type IfExists<T extends Toks, I extends number> =
	EatWords<T, I, ["if", "exists"]> extends never
		? [false, I]
		: [true, EatWords<T, I, ["if", "exists"]>];
/** `[IF NOT EXISTS]` → `[flag, next]`. */
type IfNotExists<T extends Toks, I extends number> =
	EatWords<T, I, ["if", "not", "exists"]> extends never
		? [false, I]
		: [true, EatWords<T, I, ["if", "not", "exists"]>];

/** `name [, name ...]` → `Ok<TableRef[], next>`. */
type ParseNameList<
	T extends Toks,
	I extends number,
	Acc extends readonly TableRef[],
> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? EatOp<T, J, ","> extends never
			? Ok<[...Acc, RefOf<Parts>], J>
			: ParseNameList<T, EatOp<T, J, ",">, [...Acc, RefOf<Parts>]>
		: Expected<"name", T, I>;

/** `[CASCADE | RESTRICT]` → `[cascade, next]`. */
type Cascade<T extends Toks, I extends number> =
	T[I] extends WordTok<"cascade">
		? [true, Nx<I>]
		: T[I] extends WordTok<"restrict">
			? [false, Nx<I>]
			: [false, I];

// ───────────────────────────── CREATE ─────────────────────────────

type NoopCreateObject =
	| "index"
	| "unique"
	| "trigger"
	| "constraint"
	| "extension"
	| "sequence"
	| "policy"
	| "rule"
	| "domain"
	| "aggregate"
	| "operator"
	| "role"
	| "user"
	| "group"
	| "database"
	| "collation"
	| "cast"
	| "event"
	| "publication"
	| "subscription"
	| "server"
	| "statistics"
	| "text"
	| "foreign"
	| "language"
	| "conversion"
	| "tablespace"
	| "access"
	| "transform"
	| "default"
	| "trusted"
	| "procedural";

/** After `CREATE`. Modifiers (`OR REPLACE`, `TEMP`, `UNLOGGED`, ...) are skipped. */
type ParseCreate<T extends Toks, I extends number, OrReplace extends boolean> =
	T[I] extends WordTok<infer W>
		? W extends "or"
			? EatWord<T, Nx<I>, "replace"> extends never
				? Expected<"REPLACE", T, Nx<I>>
				: ParseCreate<T, Nx2<I>, true>
			: W extends "temp" | "temporary" | "unlogged" | "global" | "local"
				? ParseCreate<T, Nx<I>, OrReplace>
				: W extends "table"
					? ParseCreateTable<T, Nx<I>>
					: W extends "view"
						? ParseCreateView<T, Nx<I>, OrReplace, false, false>
						: W extends "materialized"
							? EatWord<T, Nx<I>, "view"> extends never
								? Expected<"VIEW", T, Nx<I>>
								: OrReplace extends true
									? SyntaxErrorAt<T, I>
									: IfNotExists<T, Nx2<I>> extends [
												infer Ine extends boolean,
												infer I1 extends number,
											]
										? ParseCreateView<T, I1, false, true, Ine>
										: never
							: W extends "recursive"
								? EatWord<T, Nx<I>, "view"> extends never
									? Expected<"VIEW", T, Nx<I>>
									: ParseRecursiveView<T, Nx2<I>, OrReplace>
								: W extends "type"
									? ParseCreateType<T, Nx<I>>
									: W extends "schema"
										? ParseCreateSchema<T, Nx<I>>
										: W extends "function"
											? ParseCreateFunction<T, Nx<I>>
											: W extends "procedure"
												? RoutineEnd<
														T,
														Nx<I>,
														{ t: "noop"; what: `create ${W}` }
													>
												: W extends NoopCreateObject
													? Noop<T, I, `create ${W}`>
													: Expected<
															"TABLE, VIEW, TYPE, SCHEMA, INDEX, FUNCTION, ... after CREATE",
															T,
															I
														>
		: Expected<"object type after CREATE", T, I>;

// ─── CREATE FUNCTION ───

/**
 * After `FUNCTION`: `name (args) [RETURNS [SETOF] type | RETURNS TABLE (…)] …`. Only the name
 * and the result type are kept (arguments are not checked); the options and the body are skipped.
 */
type ParseCreateFunction<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? SkipToCloseParen<T, Nx<J>> extends infer J1
				? J1 extends number
					? FnReturns<T, J1> extends infer R
						? R extends [infer Ret, infer Srf, infer K extends number]
							? RoutineEnd<
									T,
									K,
									{
										t: "create_function";
										name: RefOf<Parts>;
										ret: Ret;
										srf: Srf;
									}
								>
							: R
						: never
					: J1
				: never
			: Expected<'"("', T, J>
		: Expected<"function name", T, I>;
/** `[ret, setReturning, next]`; without RETURNS (OUT parameters) the result is unknown. */
type FnReturns<T extends Toks, I extends number> =
	T[I] extends WordTok<"returns">
		? T[Nx<I>] extends WordTok<"table">
			? FnTableReturn<T, Nx2<I>>
			: T[Nx<I>] extends WordTok<"setof">
				? FnRetType<T, Nx2<I>, true>
				: FnRetType<T, Nx<I>, false>
		: ["unknown", false, I];
type FnRetType<T extends Toks, I extends number, Srf extends boolean> =
	QualName<T, I> extends [infer Parts, infer J extends number]
		? T[J] extends OpTok<"%">
			? T[Nx<J>] extends WordTok<"type">
				? [
						`${Parts extends readonly [...unknown[], infer Last extends string] ? Last : never}%type`, // type-mutate: equivalent never-false – QualName returns a nonempty tuple of names
						Srf,
						Nx2<J>,
					]
				: SyntaxErrorAt<T, Nx<J>>
			: FnPlainRetType<T, I, Srf>
		: FnPlainRetType<T, I, Srf>;
type FnPlainRetType<T extends Toks, I extends number, Srf extends boolean> =
	ParseTypeName<T, I> extends infer R
		? R extends Ok<infer Ty, infer J>
			? [Ty, Srf, J]
			: R
		: never;

/** One TABLE output column returns its type; multiple columns return record. */
type FnTableReturn<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? Ident<T, Nx<I>> extends [string, infer J extends number]
			? FnRetType<T, J, true> extends infer R
				? R extends [infer Ty, true, infer K extends number]
					? T[K] extends OpTok<")">
						? [Ty, true, Nx<K>]
						: ["record", true, I]
					: R
				: never
			: Expected<"column name", T, Nx<I>>
		: Expected<'"("', T, I>;

// ─── CREATE TABLE ───

/** After `TABLE`. */
type ParseCreateTable<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer I1 extends number]
		? QualName<T, I1> extends [
				infer Parts extends readonly string[],
				infer J extends number,
			]
			? T[J] extends OpTok<"(">
				? IsCtasColList<T, Nx<J>> extends true
					? ParseCtasCols<T, J, Ine, RefOf<Parts>>
					: ParseTableBody<T, Nx<J>, RefOf<Parts>["name"]> extends infer R
						? R extends Ok<[infer Cols, infer Cons, infer Like], infer J2>
							? ParseTableTail<T, J2> extends infer X
								? X extends [infer Inh, infer J3 extends number]
									? Ok<
											{
												t: "create_table";
												ifNotExists: Ine;
												table: RefOf<Parts>;
												columns: Cols;
												constraints: Cons;
												like: Like;
												inherits: Inh;
												of: null;
											},
											J3
										>
									: X
								: never
							: R
						: never
				: T[J] extends WordTok<"of">
					? ParseTypedTable<T, Nx<J>, Ine, RefOf<Parts>>
					: EatWords<T, J, ["partition", "of"]> extends never
						? ParseCtasAfterCols<T, J, Ine, RefOf<Parts>, null>
						: ParsePartitionOf<
								T,
								EatWords<T, J, ["partition", "of"]>,
								Ine,
								RefOf<Parts>
							>
			: Expected<"table name", T, I1>
		: never;

/**
 * After `OF`: `type [( { column WITH OPTIONS constraints | table_constraint } [, ...] )] [table options]`.
 * The columns come from the composite type, which is not tracked: only the type is kept.
 */
type ParseTypedTable<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Ref extends TableRef,
> =
	QualName<T, I> extends [
		infer TP extends readonly string[],
		infer J extends number,
	]
		? (
				T[J] extends OpTok<"(">
					? ParseTypedElements<T, Nx<J>, Ref["name"]>
					: J
			) extends infer J2
			? J2 extends number
				? PartitionTail<T, J2> extends infer J3
					? J3 extends number
						? Ok<
								{
									t: "create_table";
									ifNotExists: Ine;
									table: Ref;
									columns: [];
									constraints: [];
									like: [];
									inherits: [];
									of: RefOf<TP>;
								},
								J3
							>
						: J3
					: never
				: J2
			: never
		: Expected<"type name", T, I>;

/** Elements of a typed table, after `(` → index after `)`, or an error. */
type ParseTypedElements<T extends Toks, I extends number, TN extends string> = (
	IsConstraintStart<T, I> extends true
		? ParseTableConstraint<T, I>
		: Ident<T, I> extends [infer Name extends string, infer J extends number]
			? ParseColConstraints<
					T,
					SkipWords<T, J, ["with", "options"]>,
					TN,
					Name,
					"unknown",
					false,
					false, // type-mutate: equivalent bool-flip – the element's column is dropped (a typed table's columns are unknown), and only its hasDefault reads the flag
					false,
					false
				>
			: Expected<"column name or table constraint", T, I>
) extends infer R
	? R extends Ok<unknown, infer J>
		? T[J] extends OpTok<",">
			? ParseTypedElements<T, Nx<J>, TN>
			: T[J] extends OpTok<")">
				? Nx<J>
				: Expected<'"," or ")"', T, J>
		: R
	: never;

/** `( a, b ) AS` — a bare identifier followed by `,` or `)` cannot start a column definition. */
type IsCtasColList<T extends Toks, I extends number> =
	Ident<T, I> extends [string, infer J extends number]
		? T[J] extends OpTok<"," | ")"> // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
			? true
			: false
		: false;

type ParseCtasCols<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Ref extends TableRef,
> =
	ParenIdentList<T, I> extends infer R
		? R extends Ok<infer Names extends readonly string[], infer J>
			? ParseCtasAfterCols<T, J, Ine, Ref, Names>
			: R
		: never;

/** `[USING m] [WITH (...)] [ON COMMIT ...] [TABLESPACE ts] AS query [WITH [NO] DATA]` */
type ParseCtasAfterCols<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Ref extends TableRef,
	Names extends readonly string[] | null,
> =
	SkipStorage<T, I, false> extends infer I1
		? I1 extends number
			? EatWord<T, I1, "as"> extends never
				? Expected<'"(", AS, OF or PARTITION OF', T, I1>
				: T[EatWord<T, I1, "as">] extends WordTok<"execute">
					? ParseCtasExecute<T, Nx<EatWord<T, I1, "as">>, Ine, Ref, Names>
					: ParseSelectStmt<T, EatWord<T, I1, "as">> extends infer R
						? R extends Ok<infer Q, infer J>
							? Ok<
									{
										t: "create_table_as";
										ifNotExists: Ine;
										table: Ref;
										cols: Names;
										q: Q;
									},
									SkipWithData<T, J>
								>
							: R
						: never
			: I1
		: never;

/** After `AS EXECUTE`: `name [(args)] [WITH [NO] DATA]`. */
type ParseCtasExecute<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Ref extends TableRef,
	Names extends readonly string[] | null,
> =
	Ident<T, I> extends [infer N, infer J extends number]
		? (
				T[J] extends OpTok<"(">
					? ParseExprList<T, Nx<J>, []>
					: Ok<[], J>
			) extends infer R
			? R extends Ok<unknown, infer J2>
				? (
						T[J] extends OpTok<"(">
							? EatOp<T, J2, ")"> extends never
								? Expected<'")"', T, J2>
								: EatOp<T, J2, ")">
							: J2
					) extends infer J3
					? J3 extends number
						? Ok<
								{
									t: "create_table_as";
									ifNotExists: Ine;
									table: Ref;
									cols: Names;
									q: { t: "execute"; name: N };
								},
								SkipWithData<T, J3>
							>
						: J3
					: never
				: R
			: never
		: Expected<"prepared statement name", T, I>;

/** `[WITH [NO] DATA]` */
type SkipWithData<T extends Toks, I extends number> =
	EatWords<T, I, ["with", "data"]> extends never
		? SkipWords<T, I, ["with", "no", "data"]>
		: EatWords<T, I, ["with", "data"]>;

/** After `PARTITION OF`: `parent [(column options)] { FOR VALUES spec | DEFAULT } [table options]`. Column options are skipped. */
type ParsePartitionOf<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Ref extends TableRef,
> =
	QualName<T, I> extends [
		infer PP extends readonly string[],
		infer J extends number,
	]
		? SkipParenOpt<T, J> extends infer J1
			? J1 extends number
				? SkipPartitionBound<T, J1> extends infer J2
					? J2 extends number
						? PartitionTail<T, J2> extends infer J3
							? J3 extends number
								? Ok<
										{
											t: "create_table";
											ifNotExists: Ine;
											table: Ref;
											columns: [];
											constraints: [];
											like: [];
											inherits: [RefOf<PP>];
											of: null;
										},
										J3
									>
								: J3
							: never
						: J2
					: never
				: J1
			: never
		: Expected<"parent table name", T, I>;

/** `FOR VALUES IN (...) | FROM (...) TO (...) | WITH (...)` or `DEFAULT` → next index or error. */
type SkipPartitionBound<T extends Toks, I extends number> =
	T[I] extends WordTok<"default">
		? Nx<I>
		: EatWords<T, I, ["for", "values"]> extends never
			? Expected<"FOR VALUES or DEFAULT", T, I>
			: EatWords<T, I, ["for", "values"]> extends infer J extends number
				? T[J] extends WordTok<"in" | "with">
					? T[Nx<J>] extends OpTok<"(">
						? T[Nx2<J>] extends OpTok<")">
							? SyntaxErrorAt<T, Nx2<J>>
							: SkipToCloseParen<T, Nx2<J>>
						: Expected<'"("', T, Nx<J>>
					: T[J] extends WordTok<"from">
						? T[Nx<J>] extends OpTok<"(">
							? SkipToCloseParen<T, Nx2<J>> extends infer K
								? K extends number
									? EatWord<T, K, "to"> extends never
										? Expected<"TO", T, K>
										: T[EatWord<T, K, "to">] extends OpTok<"(">
											? SkipToCloseParen<T, Nx<EatWord<T, K, "to">>>
											: Expected<'"("', T, EatWord<T, K, "to">>
									: K
								: never
							: Expected<'"("', T, Nx<J>>
						: Expected<"IN, FROM or WITH", T, J>
				: never;

/** After the column list: `[INHERITS (parents)]`, then PartitionTail → `[inherits, next]` or an error. */
type ParseTableTail<T extends Toks, I extends number> =
	T[I] extends WordTok<"inherits">
		? EatOp<T, Nx<I>, "("> extends never
			? Expected<'"("', T, Nx<I>>
			: ParseNameList<T, Nx2<I>, []> extends infer R
				? R extends Ok<infer Ps, infer J>
					? EatOp<T, J, ")"> extends never
						? Expected<'")"', T, J>
						: WithInherits<Ps, PartitionTail<T, Nx<J>>>
					: R
				: never
		: WithInherits<[], PartitionTail<T, I>>;
type WithInherits<Ps, J> = J extends number ? [Ps, J] : J;

/** `[PARTITION BY strategy (...)]`, then the storage clauses → the index after them, or an error. */
type PartitionTail<T extends Toks, I extends number> =
	EatWords<T, I, ["partition", "by"]> extends never
		? SkipStorage<T, I, false>
		: EatWords<T, I, ["partition", "by"]> extends infer J extends number
			? // any word: an unknown strategy is a semantic error in Postgres ("unrecognized partitioning strategy")
				Ident<T, J> extends [string, infer J1 extends number]
				? T[J1] extends OpTok<"(">
					? SkipToCloseParen<T, Nx<J1>> extends infer J2
						? J2 extends number
							? SkipStorage<T, J2, false>
							: J2
						: never
					: Expected<'"("', T, J1>
				: Expected<"RANGE, LIST or HASH", T, J>
			: never;

/**
 * Storage clauses, in Postgres's order: a table's `[USING method] [WITH (options) | WITHOUT OIDS]
 * [ON COMMIT ...] [TABLESPACE name]`, a materialized view's (`Mat`) `[USING method]
 * [WITH (options)] [TABLESPACE name]` → the index after them, or an error.
 */
type SkipStorage<T extends Toks, I extends number, Mat extends boolean> =
	SkipReloptions<
		T,
		T[I] extends WordTok<"using"> ? Nx2<I> : I,
		Mat
	> extends infer J
		? J extends number
			? Mat extends true
				? SkipTablespace<T, J>
				: SkipOnCommit<T, J> extends infer K
					? K extends number
						? SkipTablespace<T, K>
						: K
					: never
			: J
		: never;
/** `[WITH (options)]`, or for a table `[WITHOUT OIDS]` (`WITH` takes only a parenthesized list). */
type SkipReloptions<T extends Toks, I extends number, Mat extends boolean> =
	T[I] extends WordTok<"with">
		? T[Nx<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>>
			: SyntaxErrorAt<T, Nx<I>>
		: Mat extends true
			? I
			: SkipWords<T, I, ["without", "oids"]>;
/** `[ON COMMIT {DROP | DELETE ROWS | PRESERVE ROWS}]` */
type SkipOnCommit<T extends Toks, I extends number> =
	EatWords<T, I, ["on", "commit"]> extends never
		? I
		: OnCommitAction<T, EatWords<T, I, ["on", "commit"]>>;
type OnCommitAction<T extends Toks, I extends number> =
	T[I] extends WordTok<"drop">
		? Nx<I>
		: T[I] extends WordTok<"delete" | "preserve">
			? EatWord<T, Nx<I>, "rows"> extends never
				? Expected<"ROWS", T, Nx<I>>
				: Nx2<I>
			: Expected<"DROP, DELETE ROWS or PRESERVE ROWS", T, I>;
type SkipTablespace<T extends Toks, I extends number> =
	T[I] extends WordTok<"tablespace"> ? Nx2<I> : I;

/** After `(`: an empty list or the elements. */
type ParseTableBody<T extends Toks, I extends number, TN extends string> =
	T[I] extends OpTok<")">
		? Ok<[[], [], []], Nx<I>>
		: ParseTableElements<T, I, TN, [], [], []>;

/** Elements between the parentheses: column definitions, table constraints, LIKE clauses (no trailing comma). */
type ParseTableElements<
	T extends Toks,
	I extends number,
	TN extends string,
	Cols extends readonly ColumnDef[],
	Cons extends readonly TableConstraint[],
	Like extends readonly LikeClause[],
> =
	IsConstraintStart<T, I> extends true
		? ParseTableConstraint<T, I> extends infer R
			? R extends Ok<infer C extends TableConstraint, infer J>
				? ElementNext<T, J, TN, Cols, [...Cons, C], Like>
				: R
			: never
		: T[I] extends WordTok<"like">
			? ParseLike<T, Nx<I>> extends infer R
				? R extends Ok<infer L extends LikeClause, infer J>
					? ElementNext<T, J, TN, Cols, Cons, [...Like, L]>
					: R
				: never
			: ParseColumnDef<T, I, TN> extends infer R
				? R extends Ok<infer C extends ColumnDef, infer J>
					? ElementNext<T, J, TN, [...Cols, C], Cons, Like>
					: R
				: never;

type ConstraintStart =
	| "constraint"
	| "primary"
	| "unique"
	| "check"
	| "foreign"
	| "not";
type IsConstraintStart<T extends Toks, I extends number> =
	T[I] extends WordTok<ConstraintStart> // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
		? true
		: T[I] extends WordTok<"exclude">
			? T[Nx<I>] extends WordTok<"using"> | OpTok<"("> // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
				? true
				: false
			: false;

type ElementNext<
	T extends Toks,
	I extends number,
	TN extends string,
	Cols extends readonly ColumnDef[],
	Cons extends readonly TableConstraint[],
	Like extends readonly LikeClause[],
> =
	T[I] extends OpTok<",">
		? ParseTableElements<T, Nx<I>, TN, Cols, Cons, Like>
		: T[I] extends OpTok<")">
			? Ok<[Cols, Cons, Like], Nx<I>>
			: Expected<'"," or ")"', T, I>;

/** `[CONSTRAINT name] PRIMARY KEY (cols) ... | UNIQUE ... | CHECK ... | FOREIGN KEY ... | EXCLUDE ...` */
type ParseTableConstraint<T extends Toks, I extends number> =
	T[I] extends WordTok<"constraint">
		? Ident<T, Nx<I>> extends [string, infer J extends number]
			? ParseTableConstraintBody<T, J>
			: Expected<"constraint name", T, Nx<I>>
		: ParseTableConstraintBody<T, I>;

type ParseTableConstraintBody<T extends Toks, I extends number> =
	EatWords<T, I, ["primary", "key"]> extends never
		? T[I] extends WordTok<"not">
			? ParseNotNullConstraint<T, Nx<I>>
			: T[I] extends WordTok<"unique" | "check" | "foreign" | "exclude">
				? Ok<{ t: "other" }, SkipToElementEnd<T, Nx<I>>>
				: Expected<"table constraint", T, I>
		: T[EatWords<T, I, ["primary", "key"]>] extends OpTok<"(">
			? KeyColumns<
					T,
					Nx<EatWords<T, I, ["primary", "key"]>>,
					[]
				> extends infer R
				? R extends Ok<infer Cols, infer J>
					? Ok<{ t: "pk"; cols: Cols }, SkipToElementEnd<T, J>>
					: R
				: never
			: Expected<'"("', T, EatWords<T, I, ["primary", "key"]>>;

/** Key columns after `(`: `a, b [WITHOUT OVERLAPS] )` (WITHOUT OVERLAPS on the last one) → `Ok<names, next>`. */
type KeyColumns<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? T[J] extends OpTok<",">
			? KeyColumns<T, Nx<J>, [...Acc, N]>
			: (
						EatWords<T, J, ["without", "overlaps"]> extends never
							? J
							: EatWords<T, J, ["without", "overlaps"]>
					) extends infer K extends number
				? EatOp<T, K, ")"> extends never
					? Expected<'"," or ")"', T, K>
					: Ok<[...Acc, N], EatOp<T, K, ")">>
				: never
		: Expected<"column name", T, I>;

/**
 * After `NOT` (table constraint): `NULL col [NO INHERIT | NOT VALID | ...]` → `Ok<constraint, next>`.
 * A NOT VALID constraint does not make the column NOT NULL: existing rows may hold nulls.
 */
type ParseNotNullConstraint<T extends Toks, I extends number> =
	EatWord<T, I, "null"> extends never
		? Expected<"NULL", T, I>
		: Ident<T, EatWord<T, I, "null">> extends [infer C, infer J extends number]
			? ConstraintAttrs<T, J, false, J> extends infer A
				? A extends [infer NotValid, infer J2 extends number]
					? Ok<
							NotValid extends true
								? { t: "other" }
								: { t: "not_null"; col: C },
							J2
						>
					: A
				: never
			: Expected<"column name", T, EatWord<T, I, "null">>;

/**
 * A NOT NULL constraint's attributes: `NO INHERIT`, `NOT VALID` and the defaults `NOT DEFERRABLE`,
 * `INITIALLY IMMEDIATE` → `[notValid, next]`. `DEFERRABLE`, `INITIALLY DEFERRED` and `[NOT] ENFORCED`
 * are an error at the first attribute (`At`), as in Postgres (which names the first by DEFERRABLE,
 * NOT ENFORCED, ENFORCED; TypeSQL names the first written).
 */
type ConstraintAttrs<
	T extends Toks,
	I extends number,
	NotValid extends boolean,
	At extends number,
> =
	T[I] extends WordTok<infer W>
		? W extends "deferrable"
			? NotMarked<"DEFERRABLE", At>
			: W extends "enforced"
				? NotMarked<"ENFORCED", At>
				: W extends "initially"
					? T[Nx<I>] extends WordTok<"immediate">
						? ConstraintAttrs<T, Nx2<I>, NotValid, At>
						: T[Nx<I>] extends WordTok<"deferred">
							? NotMarked<"DEFERRABLE", At>
							: [NotValid, I]
					: W extends "no"
						? T[Nx<I>] extends WordTok<"inherit">
							? ConstraintAttrs<T, Nx2<I>, NotValid, At>
							: [NotValid, I]
						: W extends "not"
							? T[Nx<I>] extends WordTok<"deferrable">
								? ConstraintAttrs<T, Nx2<I>, NotValid, At>
								: T[Nx<I>] extends WordTok<"enforced">
									? NotMarked<"NOT ENFORCED", At>
									: T[Nx<I>] extends WordTok<"valid">
										? ConstraintAttrs<T, Nx2<I>, true, At>
										: [NotValid, I]
							: [NotValid, I]
		: [NotValid, I];
type NotMarked<What extends string, At extends number> = Fail<
	`NOT NULL constraints cannot be marked ${What}`,
	At
>;

/** After `LIKE`: `source [INCLUDING | EXCLUDING option ...]`. */
type ParseLike<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParseLikeOptions<T, J, never, false> extends infer O
			? O extends [infer Def, infer J2 extends number, infer Copies]
				? Ok<
						{
							ref: RefOf<Parts>;
							defaults: Copies;
							options: Def;
						},
						J2
					>
				: O
			: never
		: Expected<"table name after LIKE", T, I>;
type DefaultLikeOption = "defaults" | "identity" | "generated";
type ParseLikeOptions<
	T extends Toks,
	I extends number,
	Def extends DefaultLikeOption,
	Copies extends boolean,
> =
	T[I] extends WordTok<"including">
		? T[Nx<I>] extends WordTok<infer O>
			? ParseLikeOptions<
					T,
					Nx2<I>,
					O extends "all"
						? DefaultLikeOption
						: Def | Extract<O, DefaultLikeOption>,
					O extends DefaultLikeOption | "all" ? true : Copies
				>
			: Expected<"LIKE option", T, Nx<I>>
		: T[I] extends WordTok<"excluding">
			? T[Nx<I>] extends WordTok<infer O>
				? ParseLikeOptions<
						T,
						Nx2<I>,
						O extends "all" ? never : Exclude<Def, O>,
						O extends DefaultLikeOption | "all" ? false : Copies
					>
				: Expected<"LIKE option", T, Nx<I>>
			: [Def, I, Copies];

// ─── column definitions ───

/**
 * `name type [column_constraint ...]` → `Ok<ColumnDef, next>`. `TN` is the table name
 * (for the NULL / NOT NULL conflict message). Serial spellings are detected on the raw
 * word token before the type is normalized.
 */
export type ParseColumnDef<
	T extends Toks,
	I extends number,
	TN extends string,
> =
	Ident<T, I> extends [infer Name extends string, infer J extends number]
		? ParseTypeName<T, J> extends infer R
			? R extends Ok<infer Ty extends string, infer J2>
				? ParseColConstraints<
						T,
						SkipColumnStorage<T, J2>,
						TN,
						Name,
						Ty,
						IsSerial<T, J>,
						IsSerial<T, J>,
						false,
						false
					>
				: R
			: never
		: Expected<"column name", T, I>;

/** `[STORAGE mode] [COMPRESSION method]`, right after the type. */
type SkipColumnStorage<T extends Toks, I extends number> =
	T[I] extends WordTok<"storage">
		? SkipCompression<T, Nx2<I>>
		: SkipCompression<T, I>;
type SkipCompression<T extends Toks, I extends number> =
	T[I] extends WordTok<"compression"> ? Nx2<I> : I;

type IsSerial<T extends Toks, I extends number> =
	T[I] extends WordTok<SerialTypeName> ? true : false;

type NullConflict<
	Name extends string,
	TN extends string,
	I extends number,
> = Fail<
	`conflicting NULL/NOT NULL declarations for column "${Name}" of table "${TN}"`,
	I
>;

/**
 * Column constraints loop. `NN` = NOT NULL (also serial / identity), `HD` = has a
 * default / identity / generation expression, `PK` = PRIMARY KEY, `Nul` = explicit NULL.
 */
type ParseColConstraints<
	T extends Toks,
	I extends number,
	TN extends string,
	Name extends string,
	Ty extends string,
	NN extends boolean,
	HD extends boolean,
	PK extends boolean,
	Nul extends boolean,
> =
	T[I] extends WordTok<infer W>
		? W extends "constraint"
			? Ident<T, Nx<I>> extends [string, infer J extends number]
				? ParseColConstraints<T, J, TN, Name, Ty, NN, HD, PK, Nul>
				: Expected<"constraint name", T, Nx<I>>
			: W extends "not"
				? T[Nx<I>] extends WordTok<"null">
					? Nul extends true
						? NullConflict<Name, TN, I>
						: ParseColConstraints<
								T,
								SkipWords<T, Nx2<I>, ["no", "inherit"]>,
								TN,
								Name,
								Ty,
								true,
								HD,
								PK,
								Nul
							>
					: T[Nx<I>] extends WordTok<"deferrable" | "enforced">
						? ParseColConstraints<T, Nx2<I>, TN, Name, Ty, NN, HD, PK, Nul>
						: Expected<"NULL", T, Nx<I>>
				: W extends "null"
					? true extends NN | PK
						? NullConflict<Name, TN, I>
						: ParseColConstraints<T, Nx<I>, TN, Name, Ty, NN, HD, PK, true>
					: W extends "default"
						? ParseBExpr<T, Nx<I>> extends infer R
							? R extends Ok<unknown, infer J>
								? ParseColConstraints<T, J, TN, Name, Ty, NN, true, PK, Nul>
								: R
							: never
						: W extends "primary"
							? EatWord<T, Nx<I>, "key"> extends never
								? Expected<"KEY", T, Nx<I>>
								: Nul extends true
									? NullConflict<Name, TN, I>
									: SkipIndexParams<T, Nx2<I>> extends infer J
										? J extends number
											? ParseColConstraints<
													T,
													J,
													TN,
													Name,
													Ty,
													NN,
													HD,
													true,
													Nul
												>
											: J
										: never
							: W extends "unique"
								? SkipIndexParams<
										T,
										SkipNullsDistinct<T, Nx<I>>
									> extends infer J
									? J extends number
										? ParseColConstraints<T, J, TN, Name, Ty, NN, HD, PK, Nul>
										: J
									: never
								: W extends "check"
									? T[Nx<I>] extends OpTok<"(">
										? SkipToCloseParen<T, Nx2<I>> extends infer J
											? J extends number
												? ParseColConstraints<
														T,
														SkipWords<T, J, ["no", "inherit"]>,
														TN,
														Name,
														Ty,
														NN,
														HD,
														PK,
														Nul
													>
												: J
											: never
										: Expected<'"("', T, Nx<I>>
									: W extends "references"
										? QualName<T, Nx<I>> extends [
												unknown,
												infer J extends number,
											]
											? SkipParenOpt<T, J> extends infer J1
												? J1 extends number
													? SkipRefActions<T, J1> extends infer J2
														? J2 extends number
															? ParseColConstraints<
																	T,
																	J2,
																	TN,
																	Name,
																	Ty,
																	NN,
																	HD,
																	PK,
																	Nul
																>
															: J2
														: never
													: J1
												: never
											: Expected<"referenced table", T, Nx<I>>
										: W extends "generated"
											? ParseGenerated<T, Nx<I>> extends infer G
												? G extends [true, infer J extends number]
													? Nul extends true
														? NullConflict<Name, TN, I>
														: ParseColConstraints<
																T,
																J,
																TN,
																Name,
																Ty,
																true,
																true,
																PK,
																Nul
															>
													: G extends [false, infer J extends number]
														? ParseColConstraints<
																T,
																J,
																TN,
																Name,
																Ty,
																NN,
																true,
																PK,
																Nul
															>
														: G
												: never
											: W extends "deferrable" | "enforced"
												? ParseColConstraints<
														T,
														Nx<I>,
														TN,
														Name,
														Ty,
														NN,
														HD,
														PK,
														Nul
													>
												: W extends "initially"
													? ParseColConstraints<
															T,
															Nx2<I>,
															TN,
															Name,
															Ty,
															NN,
															HD,
															PK,
															Nul
														>
													: W extends "collate"
														? QualName<T, Nx<I>> extends [
																unknown,
																infer J extends number,
															]
															? ParseColConstraints<
																	T,
																	J,
																	TN,
																	Name,
																	Ty,
																	NN,
																	HD,
																	PK,
																	Nul
																>
															: Expected<"collation name", T, Nx<I>>
														: Expected<"column constraint", T, I>
		: Ok<
				{
					name: Name;
					type: Ty;
					notNull: PK extends true ? true : NN;
					hasDefault: HD;
					primaryKey: PK;
				},
				I
			>;

/**
 * A column DEFAULT is a `b_expr` in Postgres's grammar: operators and comparisons, but no
 * AND / OR / NOT / IN / LIKE / BETWEEN / IS NULL at the top level (`DEFAULT 1 IN (1, 2)` is a
 * syntax error; parenthesize). Comparisons and IS [NOT] DISTINCT FROM do not chain.
 */
type ParseBExpr<T extends Toks, I extends number> =
	ParseExpr<T, I, 7> extends infer R
		? R extends Ok<unknown, infer J>
			? T[J] extends OpTok<"=" | "<" | ">" | "<=" | ">=" | "<>" | "!=">
				? ParseExpr<T, Nx<J>, 7>
				: T[J] extends WordTok<"is">
					? EatWords<T, Nx<J>, ["distinct", "from"]> extends never
						? EatWords<T, Nx<J>, ["not", "distinct", "from"]> extends never
							? R
							: ParseExpr<T, EatWords<T, Nx<J>, ["not", "distinct", "from"]>, 7>
						: ParseExpr<T, EatWords<T, Nx<J>, ["distinct", "from"]>, 7>
					: R
			: R
		: never;

/** `[WITH (...)] [USING INDEX TABLESPACE name]` after a column's PRIMARY KEY / UNIQUE (INCLUDE is for table constraints). */
type SkipIndexParams<T extends Toks, I extends number> =
	T[I] extends WordTok<"with">
		? T[Nx<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>> extends infer J
				? J extends number
					? SkipIndexTablespace<T, J>
					: J
				: never
			: SkipIndexTablespace<T, I>
		: SkipIndexTablespace<T, I>;
type SkipIndexTablespace<T extends Toks, I extends number> =
	EatWords<T, I, ["using", "index", "tablespace"]> extends never
		? I
		: Nx<EatWords<T, I, ["using", "index", "tablespace"]>>;

/** `[NULLS [NOT] DISTINCT]` */
type SkipNullsDistinct<T extends Toks, I extends number> =
	EatWords<T, I, ["nulls", "distinct"]> extends never
		? EatWords<T, I, ["nulls", "not", "distinct"]> extends never
			? I
			: EatWords<T, I, ["nulls", "not", "distinct"]>
		: EatWords<T, I, ["nulls", "distinct"]>;

/** `[MATCH kind] [ON DELETE action] [ON UPDATE action] ...` after REFERENCES t [(cols)]. */
type SkipRefActions<T extends Toks, I extends number> =
	T[I] extends WordTok<"match">
		? SkipRefActions<T, Nx2<I>>
		: T[I] extends WordTok<"on">
			? T[Nx<I>] extends WordTok<"delete" | "update">
				? T[Nx2<I>] extends WordTok<"no">
					? SkipRefActions<T, Nx2<Nx2<I>>>
					: T[Nx2<I>] extends WordTok<"set">
						? SkipParenOpt<T, Nx2<Nx2<I>>> extends infer J
							? J extends number
								? SkipRefActions<T, J>
								: J
							: never
						: SkipRefActions<T, Nx3<I>>
				: I
			: I;

/**
 * After `GENERATED`: `ALWAYS AS IDENTITY [(opts)]` | `BY DEFAULT AS IDENTITY [(opts)]` |
 * `ALWAYS AS (expr) [STORED | VIRTUAL]` → `[isIdentity, next]`, or an error.
 */
type ParseGenerated<T extends Toks, I extends number> =
	EatWords<T, I, ["always", "as", "identity"]> extends never
		? EatWords<T, I, ["by", "default", "as", "identity"]> extends never
			? // `BY DEFAULT AS (expr)` parses; Postgres then requires GENERATED ALWAYS
				(
					EatWords<T, I, ["always", "as"]> extends never
						? EatWords<T, I, ["by", "default", "as"]>
						: EatWords<T, I, ["always", "as"]>
				) extends infer J extends number
				? [J] extends [never]
					? Expected<"ALWAYS or BY DEFAULT", T, I>
					: T[J] extends OpTok<"(">
						? SkipToCloseParen<T, Nx<J>> extends infer K
							? K extends number
								? [false, SkipWord<T, K, "stored" | "virtual">]
								: K
							: never
						: Expected<'"(" or IDENTITY', T, J>
				: never
			: IdentityNext<
					SkipParenOpt<T, EatWords<T, I, ["by", "default", "as", "identity"]>>
				>
		: IdentityNext<
				SkipParenOpt<T, EatWords<T, I, ["always", "as", "identity"]>>
			>;
/** `[true, next]` after an identity column's options, or their error. */
type IdentityNext<J> = J extends number ? [true, J] : J;

// ─── CREATE VIEW ───

/**
 * After `VIEW`: `name [(cols)] [WITH (...)] AS select [WITH [CASCADED | LOCAL] CHECK OPTION]`;
 * materialized: `name [(cols)] [USING m] [WITH (...)] [TABLESPACE ts] AS select [WITH [NO] DATA]`.
 */
type ParseCreateView<
	T extends Toks,
	I extends number,
	OrReplace extends boolean,
	Mat extends boolean,
	Ine extends boolean,
> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? ParenIdentList<T, J> extends infer R
				? R extends Ok<infer Names extends readonly string[], infer J2>
					? SkipViewStorage<T, J2, Mat> extends infer J3
						? J3 extends number
							? ParseViewAs<T, J3, OrReplace, Mat, Ine, RefOf<Parts>, Names>
							: J3
						: never
					: R
				: never
			: SkipViewStorage<T, J, Mat> extends infer J2
				? J2 extends number
					? ParseViewAs<T, J2, OrReplace, Mat, Ine, RefOf<Parts>, null>
					: J2
				: never
		: Expected<"view name", T, I>;

/** A plain view takes only `WITH (options)`; USING and TABLESPACE are for materialized views. */
type SkipViewStorage<
	T extends Toks,
	I extends number,
	Mat extends boolean,
> = Mat extends true
	? SkipStorage<T, I, true>
	: T[I] extends WordTok<"with">
		? T[Nx<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>>
			: SyntaxErrorAt<T, Nx<I>>
		: I;

type ParseViewAs<
	T extends Toks,
	I extends number,
	OrReplace extends boolean,
	Mat extends boolean,
	Ine extends boolean,
	Ref extends TableRef,
	Names extends readonly string[] | null,
> =
	EatWord<T, I, "as"> extends never
		? Expected<"AS", T, I>
		: ParseSelectStmt<T, EatWord<T, I, "as">> extends infer R
			? R extends Ok<infer Q, infer J>
				? Ok<
						{
							t: "create_view";
							orReplace: OrReplace;
							materialized: Mat;
							ifNotExists: Ine;
							view: Ref;
							cols: Names;
							q: Q;
						},
						Mat extends true ? SkipWithData<T, J> : SkipCheckOption<T, J>
					>
				: R
			: never;

/**
 * After `RECURSIVE VIEW`: `name (cols) [WITH (...)] AS query [WITH CHECK OPTION]`. Postgres rewrites it to
 * `CREATE VIEW name AS WITH RECURSIVE name (cols) AS (query) SELECT cols FROM name`; so does this.
 */
type ParseRecursiveView<
	T extends Toks,
	I extends number,
	OrReplace extends boolean,
> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParenIdentList<T, J> extends infer R
			? R extends Ok<infer Names extends readonly string[], infer J2>
				? SkipViewStorage<T, J2, false> extends infer J3
					? J3 extends number
						? EatWord<T, J3, "as"> extends never
							? Expected<"AS", T, J3>
							: ParseSelectStmt<T, EatWord<T, J3, "as">> extends infer Q
								? Q extends Ok<infer S, infer J4>
									? SkipCheckOption<T, J4> extends J4
										? Ok<
												{
													t: "create_view";
													orReplace: OrReplace;
													materialized: false;
													ifNotExists: false;
													view: RefOf<Parts>;
													cols: Names;
													q: RecursiveViewQuery<RefOf<Parts>["name"], Names, S>;
												},
												J4
											>
										: Fail<
												"WITH CHECK OPTION not supported on recursive views",
												J4
											>
									: Q
								: never
						: J3
					: never
				: R
			: never
		: Expected<"view name", T, I>;

type RecursiveViewQuery<
	N extends string,
	Names extends readonly string[],
	S,
> = {
	t: "select";
	with: {
		recursive: true;
		ctes: [{ name: N; cols: Names; q: S; search: null; cycle: null }];
	};
	body: {
		t: "simple";
		distinct: false;
		targets: {
			[K in keyof Names]: {
				e: { t: "col"; tbl: null; name: Names[K] };
				alias: null;
			};
		};
		from: [
			{
				t: "table";
				ref: { schema: null; name: N };
				alias: null;
				colAliases: null;
			},
		];
		where: null;
		groupBy: null;
		groupingSets: false; // type-mutate: equivalent bool-flip – read only with a GROUP BY, which the query has not
		having: null;
		windows: [];
	};
	orderBy: [];
	limit: null;
	offset: null;
};

/** `[WITH [CASCADED | LOCAL] CHECK OPTION]` */
type SkipCheckOption<T extends Toks, I extends number> =
	T[I] extends WordTok<"with">
		? CheckOptionEnd<
				EatWords<
					T,
					SkipWord<T, Nx<I>, "cascaded" | "local">,
					["check", "option"]
				>,
				I
			>
		: I;
/** The index after `CHECK OPTION` (`J`), or the index of `WITH` (`I`) without one. */
type CheckOptionEnd<J extends number, I extends number> = [J] extends [never]
	? I
	: J;

// ─── CREATE TYPE / SCHEMA ───

/** After `TYPE`: only `name AS ENUM (...)` has a schema effect; composite, range, base and shell types are noops. */
type ParseCreateType<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? EatWords<T, J, ["as", "enum"]> extends never
			? NoDanglingDot<T, J, Noop<T, J, "create type">>
			: T[EatWords<T, J, ["as", "enum"]>] extends OpTok<"(">
				? ParseEnumValues<T, Nx<EatWords<T, J, ["as", "enum"]>>> extends infer R
					? R extends Ok<infer Vs, infer J2>
						? Ok<{ t: "create_enum"; name: RefOf<Parts>; values: Vs }, J2>
						: R
					: never
				: Expected<'"("', T, EatWords<T, J, ["as", "enum"]>>
		: Expected<"type name", T, I>;

/** After `(`: `)`, or labels `'a', 'b' )` → `Ok<labels, next>` or an error. */
type ParseEnumValues<T extends Toks, I extends number> =
	T[I] extends OpTok<")"> ? Ok<[], Nx<I>> : EnumLabels<T, I, []>;
type EnumLabels<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	T[I] extends StrTok<infer V>
		? T[Nx<I>] extends OpTok<",">
			? EnumLabels<T, Nx2<I>, [...Acc, V]>
			: T[Nx<I>] extends OpTok<")">
				? Ok<[...Acc, V], Nx2<I>>
				: Expected<'"," or ")"', T, Nx<I>>
		: Expected<"enum label", T, I>;

/**
 * After `SCHEMA`: `[IF NOT EXISTS] name [AUTHORIZATION role] [element ...]` | `[IF NOT EXISTS] AUTHORIZATION role [element ...]`.
 * Without a name the schema is named after the role (unknown for CURRENT_ROLE / CURRENT_USER / SESSION_USER).
 */
type ParseCreateSchema<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer I1 extends number]
		? T[I1] extends WordTok<"authorization">
			? AnyLabel<T, Nx<I1>> extends [
					infer Role extends string,
					infer J extends number,
				]
				? SchemaElements<
						T,
						J,
						Ine,
						Role,
						T[Nx<I1>] extends WordTok<
							"current_role" | "current_user" | "session_user"
						>
							? false
							: true,
						[],
						[]
					>
				: Expected<"role name", T, Nx<I1>>
			: Ident<T, I1> extends [infer Name extends string, infer J extends number]
				? T[J] extends WordTok<"authorization">
					? AnyLabel<T, Nx<J>> extends [string, infer J2 extends number]
						? SchemaElements<T, J2, Ine, Name, true, [], []>
						: Expected<"role name", T, Nx<J>>
					: SchemaElements<T, J, Ine, Name, true, [], []>
				: Expected<"schema name", T, I1>
		: never;

/**
 * Schema elements: CREATE TABLE / VIEW / INDEX / SEQUENCE / TRIGGER and GRANT, without `;` between them.
 * Tables and views are kept (`Tbls`, `Views`: Postgres creates the tables first), named in schema `S`;
 * the others have no schema effect and are skipped. `Known`: `S` is known (not CURRENT_ROLE).
 */
type SchemaElements<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	S extends string,
	Known extends boolean,
	Tbls extends readonly unknown[],
	Views extends readonly unknown[],
> =
	T[I] extends WordTok<"create" | "grant">
		? Ine extends true
			? Fail<"CREATE SCHEMA IF NOT EXISTS cannot include schema elements", I>
			: T[I] extends WordTok<"grant">
				? SchemaElements<
						T,
						SkipElement<T, Nx<I>, I>,
						Ine,
						S,
						Known,
						Tbls,
						Views
					>
				: SchemaElement<T, Nx<I>, S, Known, false, false> extends infer R
					? R extends Ok<infer E, infer J>
						? E extends { readonly t: "create_table" }
							? SchemaElements<T, J, Ine, S, Known, [...Tbls, E], Views>
							: E extends { readonly t: "create_view" }
								? SchemaElements<T, J, Ine, S, Known, Tbls, [...Views, E]>
								: SchemaElements<T, J, Ine, S, Known, Tbls, Views>
						: R
					: never
		: Ok<
				{
					t: "create_schema";
					ifNotExists: Ine;
					name: S;
					elements: [...Tbls, ...Views];
				},
				I
			>;

/** One element after `CREATE` → `Ok<create_table | create_view | null, next>` or error. */
type SchemaElement<
	T extends Toks,
	I extends number,
	S extends string,
	Known extends boolean,
	OrR extends boolean,
	Temp extends boolean,
> =
	T[I] extends WordTok<infer W>
		? W extends "or"
			? EatWord<T, Nx<I>, "replace"> extends never
				? Expected<"REPLACE", T, Nx<I>>
				: SchemaElement<T, Nx2<I>, S, Known, true, Temp>
			: W extends "temp" | "temporary" | "local" | "global" | "unlogged"
				? SchemaElement<
						T,
						Nx<I>,
						S,
						Known,
						OrR,
						W extends "unlogged" ? Temp : true
					>
				: W extends "table" | "view" | "recursive"
					? Temp extends true
						? Fail<
								"cannot create temporary relation in non-temporary schema",
								I
							>
						: (
									W extends "table"
										? ParseCreateTable<T, Nx<I>>
										: W extends "view"
											? ParseCreateView<T, Nx<I>, OrR, false, false>
											: EatWord<T, Nx<I>, "view"> extends never
												? Expected<"VIEW", T, Nx<I>>
												: ParseRecursiveView<T, Nx2<I>, OrR>
								) extends infer R
							? R extends Ok<infer E, infer J>
								? E extends { readonly t: "create_table_as" }
									? SyntaxErrorAt<T, I>
									: E extends {
												readonly t: "create_table";
												readonly table: infer Ref extends TableRef;
											}
										? InSchema<
												T,
												J,
												S,
												Known,
												Ref,
												Requalify<E, S>,
												IfNotExists<T, Nx<I>>[1]
											>
										: E extends {
													readonly t: "create_view";
													readonly view: infer Ref extends TableRef;
												}
											? InSchema<
													T,
													J,
													S,
													Known,
													Ref,
													Requalify<E, S>,
													W extends "view" ? Nx<I> : Nx2<I>
												>
											: R // type-mutate: equivalent never-false – the three parsers make only these nodes
								: R
							: never
					: W extends "sequence"
						? QualName<T, IfNotExists<T, Nx<I>>[1]> extends [
								infer P extends readonly string[],
								infer J extends number,
							]
							? NoDanglingDot<
									T,
									J,
									InSchema<
										T,
										SkipElement<T, Nx<I>, I>,
										S,
										Known,
										RefOf<P>,
										null,
										IfNotExists<T, Nx<I>>[1]
									>
								>
							: Expected<"sequence name", T, Nx<I>>
						: W extends "index" | "unique" | "trigger" | "constraint"
							? SkipElement<T, Nx<I>, I> extends infer J extends number
								? ElementOn<T, Nx<I>, J> extends infer K
									? K extends number
										? QualName<T, SkipWord<T, K, "only">> extends [
												infer P extends readonly string[],
												infer K2 extends number,
											]
											? NoDanglingDot<
													T,
													K2,
													InSchema<
														T,
														J,
														S,
														Known,
														RefOf<P>,
														null,
														SkipWord<T, K, "only">
													>
												>
											: SyntaxErrorAt<T, SkipWord<T, K, "only">>
										: K
									: never
								: never
							: Expected<"TABLE, VIEW, INDEX, SEQUENCE or TRIGGER", T, I>
		: Expected<"TABLE, VIEW, INDEX, SEQUENCE or TRIGGER", T, I>;

/** The element's relation, created in schema `S`. */
type Requalify<E, S extends string> = E extends {
	readonly t: "create_table";
	readonly ifNotExists: infer A;
	readonly table: { readonly name: infer N };
	readonly columns: infer B;
	readonly constraints: infer C;
	readonly like: infer D;
	readonly inherits: infer F;
	readonly of: infer G;
}
	? {
			t: "create_table";
			ifNotExists: A;
			table: { schema: S; name: N };
			columns: B;
			constraints: C;
			like: D;
			inherits: F;
			of: G;
		}
	: E extends {
				readonly t: "create_view";
				readonly orReplace: infer A;
				readonly materialized: infer B;
				readonly ifNotExists: infer C;
				readonly view: { readonly name: infer N };
				readonly cols: infer D;
				readonly q: infer Q;
			}
		? {
				t: "create_view";
				orReplace: A;
				materialized: B;
				ifNotExists: C;
				view: { schema: S; name: N };
				cols: D;
				q: Q;
			}
		: E; // type-mutate: equivalent never-false – SchemaElement requalifies tables and views only

/** `Then`, or a syntax error at the token after a `.` that QualName stopped before: a dangling dot (`a.b.`), as in Postgres, or a fourth part. */
type NoDanglingDot<T extends Toks, J extends number, Then> =
	T[J] extends OpTok<"."> ? SyntaxErrorAt<T, Nx<J>> : Then;

/** An element may name its own schema only: `Ok<E, J>`, or Postgres's error at the name (token `At`). */
type InSchema<
	T extends Toks,
	J extends number,
	S extends string,
	Known extends boolean,
	Ref extends TableRef,
	E,
	At extends number,
> = Ref["schema"] extends string
	? Known extends true
		? Ref["schema"] extends S
			? Ok<E, J>
			: Fail<
					`CREATE specifies a schema (${Ref["schema"]}) different from the one being created (${S})`,
					At
				>
		: Ok<E, J>
	: Ok<E, J>;

/** Index after the first `ON` between `I` and `End` (the relation of an index or trigger), or a syntax error where it is missing. */
type ElementOn<
	T extends Toks,
	I extends number,
	End extends number,
> = I extends End
	? SyntaxErrorAt<T, I>
	: T[I] extends WordTok<"on">
		? Nx<I>
		: T[I] extends OpTok<"(">
			? SyntaxErrorAt<T, I>
			: ElementOn<T, Nx<I>, End>;

/**
 * Skip a schema element without a schema effect: up to the next `CREATE` that starts an element, or
 * the end of the statement. Right after `GRANT` or `,` (token `P`, the one before `I`), `CREATE` is a
 * privilege (`GRANT CREATE ON ...`, `GRANT USAGE, CREATE ON ...`). A `GRANT` element is skipped as
 * part of the one before it, all the same.
 */
type SkipElement<T extends Toks, I extends number, P extends number> =
	T[I] extends OpTok<";">
		? I
		: T[I] extends WordTok<"create">
			? T[P] extends WordTok<"grant"> | OpTok<",">
				? SkipElement<T, Nx<I>, I>
				: I
			: T[I] extends Tok
				? SkipElement<T, Nx<I>, I>
				: I;

// ───────────────────────────── ALTER ─────────────────────────────

type NoopAlterObject =
	| "sequence"
	| "index"
	| "function"
	| "procedure"
	| "routine"
	| "trigger"
	| "extension"
	| "policy"
	| "rule"
	| "domain"
	| "aggregate"
	| "operator"
	| "role"
	| "user"
	| "group"
	| "database"
	| "collation"
	| "event"
	| "publication"
	| "subscription"
	| "server"
	| "statistics"
	| "text"
	| "foreign"
	| "language"
	| "conversion"
	| "tablespace"
	| "default"
	| "system"
	| "large";

type ParseAlter<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "table" | "view"
			? ParseAlterTable<T, Nx<I>>
			: W extends "materialized"
				? EatWord<T, Nx<I>, "view"> extends never
					? Expected<"VIEW", T, Nx<I>>
					: ParseAlterTable<T, Nx2<I>>
				: W extends "type"
					? ParseAlterType<T, Nx<I>>
					: W extends "schema"
						? ParseAlterSchema<T, Nx<I>>
						: W extends NoopAlterObject
							? Noop<T, I, `alter ${W}`>
							: Expected<"TABLE, VIEW, TYPE, SCHEMA, ... after ALTER", T, I>
		: Expected<"object type after ALTER", T, I>;

/** `ALTER SCHEMA name RENAME TO new` (other forms are noops). */
type ParseAlterSchema<T extends Toks, I extends number> =
	Ident<T, I> extends [infer From, infer J extends number]
		? EatWords<T, J, ["rename", "to"]> extends never
			? Noop<T, J, "alter schema">
			: Ident<T, EatWords<T, J, ["rename", "to"]>> extends [
						infer To,
						infer J2 extends number,
					]
				? Ok<{ t: "rename_schema"; from: From; to: To }, J2>
				: Expected<"new schema name", T, EatWords<T, J, ["rename", "to"]>>
		: Expected<"schema name", T, I>;

/**
 * After `TABLE` / `VIEW`: `[IF EXISTS] [ONLY] name [*] action [, action ...]`.
 * `RENAME ...` and `SET SCHEMA` form a statement of their own (as in Postgres's grammar).
 */
type ParseAlterTable<T extends Toks, I extends number> =
	// ALL IN TABLESPACE ts [OWNED BY roles] SET TABLESPACE ts2 [NOWAIT]: moves storage only
	T[I] extends WordTok<"all">
		? EatWords<T, Nx<I>, ["in", "tablespace"]> extends never
			? Expected<"IN TABLESPACE", T, Nx<I>>
			: Noop<T, I, "alter table all in tablespace">
		: IfExists<T, I> extends [
					infer Ife extends boolean,
					infer I1 extends number,
				]
			? QualName<T, SkipWord<T, I1, "only">> extends [
					infer Parts extends readonly string[],
					infer J extends number,
				]
				? (
						EatOp<T, J, "*"> extends never
							? J
							: EatOp<T, J, "*">
					) extends infer J1 extends number
					? IsStandalone<T, J1> extends true
						? (
								T[J1] extends WordTok<"rename">
									? ParseAlterRename<T, Nx<J1>>
									: ParseSetSchema<T, Nx2<J1>>
							) extends infer R
							? R extends Ok<infer A, infer J2>
								? Ok<
										{
											t: "alter_table";
											ifExists: Ife;
											table: RefOf<Parts>;
											actions: [A];
										},
										J2
									>
								: R
							: never
						: ParseAlterActions<T, J1, RefOf<Parts>, Ife, []>
					: never
				: Expected<"table name", T, SkipWord<T, I1, "only">>
			: never;

type IsStandalone<T extends Toks, I extends number> =
	T[I] extends WordTok<"rename"> // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
		? true
		: T[I] extends WordTok<"set">
			? T[Nx<I>] extends WordTok<"schema"> // type-mutate: equivalent never-true – read with `extends true`, where never counts as true
				? true
				: false
			: false;

type ParseSetSchema<T extends Toks, I extends number> =
	Ident<T, I> extends [infer S, infer J extends number]
		? Ok<{ t: "set_schema"; schema: S }, J>
		: Expected<"schema name", T, I>;

type ParseAlterActions<
	T extends Toks,
	I extends number,
	Ref extends TableRef,
	Ife extends boolean,
	Acc extends readonly AlterAction[],
> =
	IsStandalone<T, I> extends true
		? SyntaxErrorAt<T, I>
		: ParseAlterAction<T, I, Ref["name"]> extends infer R
			? R extends Ok<infer A extends AlterAction, infer J>
				? T[J] extends OpTok<",">
					? ParseAlterActions<T, Nx<J>, Ref, Ife, [...Acc, A]>
					: Ok<
							{
								t: "alter_table";
								ifExists: Ife;
								table: Ref;
								actions: [...Acc, A];
							},
							J
						>
				: R
			: never;

type NoopAction<T extends Toks, I extends number> = Ok<
	{ t: "noop" },
	SkipToActionEnd<T, I>
>;

type ParseAlterAction<T extends Toks, I extends number, TN extends string> =
	T[I] extends WordTok<infer W>
		? W extends "add"
			? ParseAlterAdd<T, Nx<I>, TN>
			: W extends "drop"
				? ParseAlterDrop<T, Nx<I>>
				: W extends "alter"
					? ParseAlterColumn<T, Nx<I>>
					: W extends "set"
						? T[Nx<I>] extends WordTok<"with">
							? SyntaxErrorAt<T, Nx<I>>
							: NoopAction<T, I> // SET WITH OIDS is gone
						: W extends
									| "owner"
									| "enable"
									| "disable"
									| "validate"
									| "cluster"
									| "inherit"
									| "no"
									| "of"
									| "not"
									| "replica"
									| "attach"
									| "detach"
									| "force"
									| "reset"
									| "options"
							? NoopAction<T, I>
							: Expected<"ALTER TABLE action", T, I>
		: Expected<"ALTER TABLE action", T, I>;

/** After `ADD`: a table constraint or `[COLUMN] [IF NOT EXISTS] column_def`. */
type ParseAlterAdd<T extends Toks, I extends number, TN extends string> =
	T[I] extends WordTok<"constraint">
		? Ident<T, Nx<I>> extends [string, infer J extends number]
			? ParseAddConstraintBody<T, J>
			: Expected<"constraint name", T, Nx<I>>
		: T[I] extends WordTok<"primary" | "not">
			? ParseAddConstraintBody<T, I>
			: T[I] extends WordTok<"unique" | "check" | "foreign" | "exclude">
				? NoopAction<T, I>
				: IfNotExists<T, SkipWord<T, I, "column">> extends [
							infer Ine,
							infer I1 extends number,
						]
					? ParseColumnDef<T, I1, TN> extends infer R
						? R extends Ok<infer C, infer J>
							? Ok<{ t: "add_column"; ifNotExists: Ine; col: C }, J>
							: R
						: never
					: never;

type ParseAddConstraintBody<T extends Toks, I extends number> =
	T[I] extends WordTok<"not">
		? ParseNotNullConstraint<T, Nx<I>> extends infer R
			? R extends Ok<infer C, infer J>
				? Ok<
						C extends { readonly col: infer N }
							? { t: "set_not_null"; name: N }
							: { t: "noop" },
						J
					>
				: R
			: never
		: T[I] extends WordTok<"primary">
			? EatWord<T, Nx<I>, "key"> extends never
				? Expected<"KEY", T, Nx<I>>
				: T[Nx2<I>] extends OpTok<"(">
					? KeyColumns<T, Nx3<I>, []> extends infer R
						? R extends Ok<infer Cols, infer J>
							? Ok<{ t: "add_pk"; cols: Cols }, SkipToActionEnd<T, J>>
							: R
						: never
					: NoopAction<T, I> // PRIMARY KEY USING INDEX name
			: NoopAction<T, I>; // UNIQUE, CHECK, FOREIGN KEY, EXCLUDE

/** After `DROP`: `CONSTRAINT ...` (noop) | `[COLUMN] [IF EXISTS] name [CASCADE | RESTRICT]`. */
type ParseAlterDrop<T extends Toks, I extends number> =
	T[I] extends WordTok<"constraint">
		? NoopAction<T, I>
		: IfExists<T, SkipWord<T, I, "column">> extends [
					infer Ife,
					infer I1 extends number,
				]
			? Ident<T, I1> extends [infer Name, infer J extends number]
				? Ok<{ t: "drop_column"; ifExists: Ife; name: Name }, Cascade<T, J>[1]>
				: Expected<"column name", T, I1>
			: never;

/** After `RENAME`: `TO new` | `CONSTRAINT a TO b` (noop) | `[COLUMN] a TO b`. */
type ParseAlterRename<T extends Toks, I extends number> =
	T[I] extends WordTok<"to">
		? Ident<T, Nx<I>> extends [infer To, infer J extends number]
			? Ok<{ t: "rename_table"; to: To }, J>
			: Expected<"new name", T, Nx<I>>
		: T[I] extends WordTok<"constraint">
			? Ident<T, Nx<I>> extends [string, infer J extends number]
				? EatWord<T, J, "to"> extends never
					? Expected<"TO", T, J>
					: Ident<T, EatWord<T, J, "to">> extends [
								string,
								infer J2 extends number,
							]
						? Ok<{ t: "noop" }, J2>
						: Expected<"new constraint name", T, EatWord<T, J, "to">>
				: Expected<"constraint name", T, Nx<I>>
			: Ident<T, SkipWord<T, I, "column">> extends [
						infer From,
						infer J extends number,
					]
				? EatWord<T, J, "to"> extends never
					? Expected<"TO", T, J>
					: Ident<T, EatWord<T, J, "to">> extends [
								infer To,
								infer J2 extends number,
							]
						? Ok<{ t: "rename_column"; from: From; to: To }, J2>
						: Expected<"new column name", T, EatWord<T, J, "to">>
				: Expected<"column name", T, SkipWord<T, I, "column">>;

/** After `ALTER`: `CONSTRAINT ...` (noop) | `[COLUMN] name { TYPE | SET ... | DROP ... | ADD GENERATED ... | RESTART | RESET }`. */
type ParseAlterColumn<T extends Toks, I extends number> =
	T[I] extends WordTok<"constraint">
		? NoopAction<T, I>
		: Ident<T, SkipWord<T, I, "column">> extends [
					infer C extends string,
					infer J extends number,
				]
			? T[J] extends WordTok<infer W>
				? W extends "type"
					? ParseAlterColType<T, Nx<J>, C>
					: W extends "set"
						? T[Nx<J>] extends WordTok<"data">
							? EatWord<T, Nx2<J>, "type"> extends never
								? Expected<"TYPE", T, Nx2<J>>
								: ParseAlterColType<T, Nx3<J>, C>
							: T[Nx<J>] extends WordTok<"not">
								? EatWord<T, Nx2<J>, "null"> extends never
									? Expected<"NULL", T, Nx2<J>>
									: Ok<{ t: "set_not_null"; name: C }, Nx3<J>>
								: T[Nx<J>] extends WordTok<"default">
									? ParseExpr<T, Nx2<J>, 0> extends infer R
										? R extends Ok<unknown, infer J2>
											? Ok<{ t: "set_default"; name: C }, J2>
											: R
										: never
									: NoopAction<T, J> // SET STATISTICS / STORAGE / COMPRESSION / GENERATED / EXPRESSION / ( options )
						: W extends "drop"
							? T[Nx<J>] extends WordTok<"not">
								? EatWord<T, Nx2<J>, "null"> extends never
									? Expected<"NULL", T, Nx2<J>>
									: Ok<{ t: "drop_not_null"; name: C }, Nx3<J>>
								: T[Nx<J>] extends WordTok<"default">
									? Ok<{ t: "drop_default"; name: C }, Nx2<J>>
									: T[Nx<J>] extends WordTok<"identity" | "expression">
										? Ok<
												{ t: "drop_default"; name: C },
												SkipWords<T, Nx2<J>, ["if", "exists"]>
											>
										: Expected<
												"NOT NULL, DEFAULT, IDENTITY or EXPRESSION",
												T,
												Nx<J>
											>
							: W extends "add"
								? EatWord<T, Nx<J>, "generated"> extends never
									? Expected<"GENERATED", T, Nx<J>>
									: ParseGenerated<T, Nx2<J>> extends infer G
										? G extends [true, infer J2 extends number]
											? Ok<{ t: "add_identity"; name: C }, J2>
											: G extends [false, infer J2 extends number]
												? Expected<"IDENTITY", T, J2>
												: G
										: never
								: W extends "restart" | "reset"
									? NoopAction<T, J>
									: Expected<"ALTER COLUMN action", T, J>
				: Expected<"ALTER COLUMN action", T, J>
			: Expected<"column name", T, SkipWord<T, I, "column">>;

/** After `TYPE`: `typename [COLLATE c] [USING expr]`. */
type ParseAlterColType<T extends Toks, I extends number, C extends string> =
	ParseTypeName<T, I> extends infer R
		? R extends Ok<infer Ty, infer J>
			? SkipCollate<T, J> extends infer J2 extends number
				? EatWord<T, J2, "using"> extends never
					? Ok<{ t: "alter_type"; name: C; type: Ty }, J2>
					: ParseExpr<T, EatWord<T, J2, "using">, 0> extends infer E
						? E extends Ok<unknown, infer J3>
							? Ok<{ t: "alter_type"; name: C; type: Ty }, J3>
							: E
						: never
				: never
			: R
		: never;
type SkipCollate<T extends Toks, I extends number> =
	T[I] extends WordTok<"collate">
		? QualName<T, Nx<I>> extends [unknown, infer J]
			? J
			: Nx<I>
		: I;

/** After `ALTER TYPE`: `name ADD VALUE ... | RENAME VALUE ... | RENAME TO ... | other (noop)`. */
type ParseAlterType<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends WordTok<"add">
			? EatWord<T, Nx<J>, "value"> extends never
				? Ok<
						{ t: "alter_enum"; name: RefOf<Parts>; action: { t: "noop" } },
						SkipToStmtEnd<T, J>
					> // ADD ATTRIBUTE
				: IfNotExists<T, Nx2<J>> extends [infer Ine, infer I1 extends number]
					? T[I1] extends StrTok<infer V>
						? Ok<
								{
									t: "alter_enum";
									name: RefOf<Parts>;
									action: { t: "add_value"; value: V; ifNotExists: Ine };
								},
								SkipBeforeAfter<T, Nx<I1>>
							>
						: Expected<"enum label", T, I1>
					: never
			: T[J] extends WordTok<"rename">
				? T[Nx<J>] extends WordTok<"value">
					? T[Nx2<J>] extends StrTok<infer From>
						? EatWord<T, Nx3<J>, "to"> extends never
							? Expected<"TO", T, Nx3<J>>
							: T[EatWord<T, Nx3<J>, "to">] extends StrTok<infer To>
								? Ok<
										{
											t: "alter_enum";
											name: RefOf<Parts>;
											action: { t: "rename_value"; from: From; to: To };
										},
										Nx<EatWord<T, Nx3<J>, "to">>
									>
								: Expected<"enum label", T, EatWord<T, Nx3<J>, "to">>
						: Expected<"enum label", T, Nx2<J>>
					: T[Nx<J>] extends WordTok<"to">
						? Ident<T, Nx2<J>> extends [infer To, infer J2 extends number]
							? Ok<
									{
										t: "alter_enum";
										name: RefOf<Parts>;
										action: { t: "rename"; to: To };
									},
									J2
								>
							: Expected<"new type name", T, Nx2<J>>
						: Ok<
								{ t: "alter_enum"; name: RefOf<Parts>; action: { t: "noop" } },
								SkipToStmtEnd<T, J>
							> // RENAME ATTRIBUTE
				: T[J] extends WordTok<"owner" | "set" | "drop" | "alter">
					? Ok<
							{ t: "alter_enum"; name: RefOf<Parts>; action: { t: "noop" } },
							SkipToStmtEnd<T, J>
						>
					: Expected<"ALTER TYPE action", T, J>
		: Expected<"type name", T, I>;
type SkipBeforeAfter<T extends Toks, I extends number> =
	T[I] extends WordTok<"before" | "after">
		? T[Nx<I>] extends StrTok
			? Nx2<I>
			: I
		: I;

// ───────────────────────────── DROP ─────────────────────────────

type NoopDropObject =
	| "index"
	| "function"
	| "procedure"
	| "routine"
	| "trigger"
	| "extension"
	| "sequence"
	| "policy"
	| "rule"
	| "domain"
	| "aggregate"
	| "operator"
	| "role"
	| "user"
	| "group"
	| "database"
	| "collation"
	| "cast"
	| "event"
	| "publication"
	| "subscription"
	| "server"
	| "statistics"
	| "text"
	| "foreign"
	| "language"
	| "conversion"
	| "tablespace"
	| "access"
	| "transform"
	| "owned";

type ParseDrop<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "table"
			? ParseDropList<T, Nx<I>, "drop_table">
			: W extends "view"
				? ParseDropList<T, Nx<I>, "drop_view">
				: W extends "materialized"
					? EatWord<T, Nx<I>, "view"> extends never
						? Expected<"VIEW", T, Nx<I>>
						: ParseDropList<T, Nx2<I>, "drop_matview">
					: W extends "type"
						? ParseDropList<T, Nx<I>, "drop_type">
						: W extends "schema"
							? ParseDropList<T, Nx<I>, "drop_schema">
							: W extends NoopDropObject
								? Noop<T, I, `drop ${W}`>
								: Expected<
										"TABLE, VIEW, TYPE, SCHEMA, INDEX, ... after DROP",
										T,
										I
									>
		: Expected<"object type after DROP", T, I>;

/** `[IF EXISTS] name [, ...] [CASCADE | RESTRICT]` */
type ParseDropList<T extends Toks, I extends number, K extends string> =
	IfExists<T, I> extends [infer Ife extends boolean, infer I1 extends number]
		? ParseNameList<T, I1, []> extends infer R
			? R extends Ok<infer Names extends readonly TableRef[], infer J>
				? Cascade<T, J> extends [
						infer C extends boolean,
						infer J2 extends number,
					]
					? Ok<DropNode<K, Ife, Names, C>, J2>
					: never
				: R
			: never
		: never;

type DropNode<
	K extends string,
	Ife extends boolean,
	Names extends readonly TableRef[],
	C extends boolean,
> = K extends "drop_table"
	? { t: "drop_table"; ifExists: Ife; tables: Names }
	: K extends "drop_view"
		? { t: "drop_view"; ifExists: Ife; materialized: false; views: Names }
		: K extends "drop_matview"
			? { t: "drop_view"; ifExists: Ife; materialized: true; views: Names }
			: K extends "drop_type"
				? { t: "drop_type"; ifExists: Ife; names: Names; cascade: C }
				: {
						t: "drop_schema";
						ifExists: Ife;
						names: {
							[P in keyof Names]: Names[P] extends { readonly name: infer N }
								? N
								: never;
						};
						cascade: C;
					};
