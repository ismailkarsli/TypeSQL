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
	ColIdIdent,
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
		: SyntaxErrorAt<T, I>;

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
		? D extends readonly []
			? O extends Stop
				? I
				: O extends "("
					? SkipUntil<T, Nx<I>, Stop, [0]>
					: SkipUntil<T, Nx<I>, Stop, D>
			: O extends "("
				? SkipUntil<T, Nx<I>, Stop, [...D, 0]>
				: O extends ")"
					? SkipUntil<
							T,
							Nx<I>,
							Stop,
							D extends readonly [unknown, ...infer D2] ? D2 : []
						>
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
 * its `END` (CASE ... END pairs inside are counted).
 */
type SkipRoutine<T extends Toks, I extends number> =
	T[I] extends OpTok<";">
		? I
		: T[I] extends WordTok<"begin">
			? T[Nx<I>] extends WordTok<"atomic">
				? SkipAtomic<T, Nx2<I>, []> extends infer J extends number
					? SkipRoutine<T, J>
					: never
				: SkipRoutine<T, Nx<I>>
			: T[I] extends OpTok<"(">
				? SkipToCloseParen<T, Nx<I>> extends infer J extends number
					? SkipRoutine<T, J>
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
				: I;

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
												? SkipRoutine<T, Nx<I>> extends infer J extends number
													? Ok<{ t: "noop"; what: `create ${W}` }, J>
													: never
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
			? FnReturns<T, SkipToCloseParen<T, Nx<J>>> extends infer R
				? R extends [
						infer Ret extends string,
						infer Srf extends boolean,
						infer K extends number,
					]
					? Ok<
							{ t: "create_function"; name: RefOf<Parts>; ret: Ret; srf: Srf },
							SkipRoutine<T, K>
						>
					: R
				: never
			: Expected<'"("', T, J>
		: Expected<"function name", T, I>;
/** `[ret, setReturning, next]`; without RETURNS (OUT parameters) the result is unknown. */
type FnReturns<T extends Toks, I extends number> =
	T[I] extends WordTok<"returns">
		? T[Nx<I>] extends WordTok<"table">
			? ["record", true, Nx<I>]
			: T[Nx<I>] extends WordTok<"setof">
				? FnRetType<T, Nx2<I>, true>
				: FnRetType<T, Nx<I>, false>
		: ["unknown", false, I];
type FnRetType<T extends Toks, I extends number, Srf extends boolean> =
	ParseTypeName<T, I> extends infer R
		? R extends Ok<infer Ty extends string, infer J extends number>
			? [Ty, Srf, J]
			: R
		: never;

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
						? R extends Ok<
								[infer Cols, infer Cons, infer Like],
								infer J2 extends number
							>
							? ParseTableTail<T, J2, []> extends infer X
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
				? ParseTableTail<T, J2, []> extends infer X
					? X extends [readonly [], infer J3 extends number]
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
						: X extends [unknown, number]
							? SyntaxErrorAt<T, J2> // INHERITS
							: X
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
					false,
					false,
					false
				>
			: Expected<"column name or table constraint", T, I>
) extends infer R
	? R extends Ok<unknown, infer J extends number>
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
		? T[J] extends OpTok<"," | ")">
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
		? R extends Ok<
				infer Names extends readonly string[],
				infer J extends number
			>
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
	SkipStorage<T, I> extends infer I1 extends number
		? EatWord<T, I1, "as"> extends never
			? Expected<'"(", AS, OF or PARTITION OF', T, I1>
			: T[EatWord<T, I1, "as">] extends WordTok<"execute">
				? ParseCtasExecute<T, Nx<EatWord<T, I1, "as">>, Ine, Ref, Names>
				: ParseSelectStmt<T, EatWord<T, I1, "as">> extends infer R
					? R extends Ok<infer Q, infer J extends number>
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
		: never;

/** After `AS EXECUTE`: `name [(args)] [WITH [NO] DATA]`. */
type ParseCtasExecute<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Ref extends TableRef,
	Names extends readonly string[] | null,
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? (
				T[J] extends OpTok<"(">
					? ParseExprList<T, Nx<J>, []>
					: Ok<[], J>
			) extends infer R
			? R extends Ok<unknown, infer J2 extends number>
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
		? SkipPartitionBound<T, SkipParenOpt<T, J>> extends infer J2
			? J2 extends number
				? ParseTableTail<T, J2, []> extends infer X
					? X extends [readonly TableRef[], infer J3 extends number]
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
						: X
					: never
				: J2
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
							? SkipToCloseParen<T, Nx2<J>> extends infer K extends number
								? EatWord<T, K, "to"> extends never
									? Expected<"TO", T, K>
									: T[EatWord<T, K, "to">] extends OpTok<"(">
										? SkipToCloseParen<T, Nx<EatWord<T, K, "to">>>
										: Expected<'"("', T, EatWord<T, K, "to">>
								: never
							: Expected<'"("', T, Nx<J>>
						: Expected<"IN, FROM or WITH", T, J>
				: never;

/**
 * Clauses after the column list: `INHERITS (parents)`, `PARTITION BY ...`, `USING method`,
 * `WITH (...)`, `WITHOUT OIDS`, `ON COMMIT ...`, `TABLESPACE name` → `[inherits, next]` or error.
 */
type ParseTableTail<
	T extends Toks,
	I extends number,
	Inh extends readonly TableRef[],
> =
	T[I] extends WordTok<"inherits">
		? EatOp<T, Nx<I>, "("> extends never
			? Expected<'"("', T, Nx<I>>
			: ParseNameList<T, Nx2<I>, []> extends infer R
				? R extends Ok<
						infer Ps extends readonly TableRef[],
						infer J extends number
					>
					? EatOp<T, J, ")"> extends never
						? Expected<'")"', T, J>
						: ParseTableTail<T, Nx<J>, [...Inh, ...Ps]>
					: R
				: never
		: EatWords<T, I, ["partition", "by"]> extends never
			? SkipStorage<T, I> extends infer J extends number
				? J extends I
					? [Inh, I]
					: ParseTableTail<T, J, Inh>
				: never
			: EatWords<T, I, ["partition", "by"]> extends infer J extends number
				? // any word: an unknown strategy is a semantic error in Postgres ("unrecognized partitioning strategy")
					ColIdIdent<T, J> extends [string, infer J1 extends number]
					? T[J1] extends OpTok<"(">
						? SkipToCloseParen<T, Nx<J1>> extends infer K extends number
							? ParseTableTail<T, K, Inh>
							: never
						: Expected<'"("', T, J1>
					: Expected<"RANGE, LIST or HASH", T, J>
				: never;

/** `USING method`, `WITH (...)`, `WITHOUT OIDS`, `ON COMMIT ...`, `TABLESPACE name` (any order, any number). */
type SkipStorage<T extends Toks, I extends number> =
	T[I] extends WordTok<"using" | "tablespace">
		? SkipStorage<T, Nx2<I>>
		: T[I] extends WordTok<"with">
			? T[Nx<I>] extends OpTok<"(">
				? SkipToCloseParen<T, Nx2<I>> extends infer J extends number
					? SkipStorage<T, J>
					: never
				: I
			: T[I] extends WordTok<"without">
				? T[Nx<I>] extends WordTok<"oids">
					? SkipStorage<T, Nx2<I>>
					: I
				: EatWords<T, I, ["on", "commit"]> extends never
					? I
					: T[EatWords<T, I, ["on", "commit"]>] extends WordTok<"drop">
						? SkipStorage<T, Nx<EatWords<T, I, ["on", "commit"]>>>
						: SkipStorage<T, Nx2<EatWords<T, I, ["on", "commit"]>>>; // PRESERVE ROWS | DELETE ROWS

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
			? R extends Ok<infer C extends TableConstraint, infer J extends number>
				? ElementNext<T, J, TN, Cols, [...Cons, C], Like>
				: R
			: never
		: T[I] extends WordTok<"like">
			? ParseLike<T, Nx<I>> extends infer R
				? R extends Ok<infer L extends LikeClause, infer J extends number>
					? ElementNext<T, J, TN, Cols, Cons, [...Like, L]>
					: R
				: never
			: ParseColumnDef<T, I, TN> extends infer R
				? R extends Ok<infer C extends ColumnDef, infer J extends number>
					? ElementNext<T, J, TN, [...Cols, C], Cons, Like>
					: R
				: never;

type IsConstraintStart<T extends Toks, I extends number> =
	T[I] extends WordTok<
		"constraint" | "primary" | "unique" | "check" | "foreign" | "not"
	>
		? true
		: T[I] extends WordTok<"exclude">
			? T[Nx<I>] extends WordTok<"using"> | OpTok<"(">
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
		? AnyLabel<T, Nx<I>> extends [string, infer J extends number]
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
				? R extends Ok<
						infer Cols extends readonly string[],
						infer J extends number
					>
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
		: Ident<T, EatWord<T, I, "null">> extends [
					infer C extends string,
					infer J extends number,
				]
			? ConstraintAttrs<T, J, false> extends [
					infer NotValid,
					infer J2 extends number,
				]
				? Ok<
						NotValid extends true ? { t: "other" } : { t: "not_null"; col: C },
						J2
					>
				: never
			: Expected<"column name", T, EatWord<T, I, "null">>;

/**
 * Constraint attributes: `[NOT] DEFERRABLE`, `INITIALLY {DEFERRED | IMMEDIATE}`, `[NOT] ENFORCED`,
 * `NO INHERIT`, `NOT VALID` → `[notValid, next]`.
 */
type ConstraintAttrs<
	T extends Toks,
	I extends number,
	NotValid extends boolean,
> =
	T[I] extends WordTok<infer W>
		? W extends "deferrable" | "enforced"
			? ConstraintAttrs<T, Nx<I>, NotValid>
			: W extends "initially"
				? T[Nx<I>] extends WordTok<"deferred" | "immediate">
					? ConstraintAttrs<T, Nx2<I>, NotValid>
					: [NotValid, I]
				: W extends "no"
					? T[Nx<I>] extends WordTok<"inherit">
						? ConstraintAttrs<T, Nx2<I>, NotValid>
						: [NotValid, I]
					: W extends "not"
						? T[Nx<I>] extends WordTok<"deferrable" | "enforced">
							? ConstraintAttrs<T, Nx2<I>, NotValid>
							: T[Nx<I>] extends WordTok<"valid">
								? ConstraintAttrs<T, Nx2<I>, true>
								: [NotValid, I]
						: [NotValid, I]
		: [NotValid, I];

/** After `LIKE`: `source [INCLUDING | EXCLUDING option ...]`. */
type ParseLike<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParseLikeOptions<T, J, false> extends [
				infer Def extends boolean,
				infer J2 extends number,
			]
			? Ok<{ ref: RefOf<Parts>; defaults: Def }, J2>
			: never
		: Expected<"table name after LIKE", T, I>;
type DefaultLikeOption = "defaults" | "identity" | "generated" | "all";
type ParseLikeOptions<T extends Toks, I extends number, Def extends boolean> =
	T[I] extends WordTok<"including">
		? T[Nx<I>] extends WordTok<infer O>
			? ParseLikeOptions<T, Nx2<I>, O extends DefaultLikeOption ? true : Def>
			: Expected<"LIKE option", T, Nx<I>>
		: T[I] extends WordTok<"excluding">
			? T[Nx<I>] extends WordTok<infer O>
				? ParseLikeOptions<T, Nx2<I>, O extends DefaultLikeOption ? false : Def>
				: Expected<"LIKE option", T, Nx<I>>
			: [Def, I];

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
			? R extends Ok<infer Ty extends string, infer J2 extends number>
				? ParseColConstraints<
						T,
						J2,
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
			? AnyLabel<T, Nx<I>> extends [string, infer J extends number]
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
					? NN extends true
						? NullConflict<Name, TN, I>
						: ParseColConstraints<T, Nx<I>, TN, Name, Ty, NN, HD, PK, true>
					: W extends "default"
						? ParseBExpr<T, Nx<I>> extends infer R
							? R extends Ok<unknown, infer J extends number>
								? ParseColConstraints<T, J, TN, Name, Ty, NN, true, PK, Nul>
								: R
							: never
						: W extends "primary"
							? EatWord<T, Nx<I>, "key"> extends never
								? Expected<"KEY", T, Nx<I>>
								: SkipIndexParams<T, Nx2<I>> extends infer J extends number
									? ParseColConstraints<T, J, TN, Name, Ty, NN, HD, true, Nul>
									: never
							: W extends "unique"
								? SkipIndexParams<
										T,
										SkipNullsDistinct<T, Nx<I>>
									> extends infer J extends number
									? ParseColConstraints<T, J, TN, Name, Ty, NN, HD, PK, Nul>
									: never
								: W extends "check"
									? T[Nx<I>] extends OpTok<"(">
										? SkipToCloseParen<T, Nx2<I>> extends infer J extends number
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
											: never
										: Expected<'"("', T, Nx<I>>
									: W extends "references"
										? QualName<T, Nx<I>> extends [
												unknown,
												infer J extends number,
											]
											? SkipRefActions<
													T,
													SkipParenOpt<T, J>
												> extends infer J2 extends number
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
														: W extends "compression" | "storage"
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
		? R extends Ok<unknown, infer J extends number>
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

/** `[INCLUDE (...)] [WITH (...)] [USING INDEX TABLESPACE name]` after PRIMARY KEY / UNIQUE. */
type SkipIndexParams<T extends Toks, I extends number> =
	T[I] extends WordTok<"include" | "with">
		? T[Nx<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>> extends infer J extends number
				? SkipIndexParams<T, J>
				: never
			: I
		: EatWords<T, I, ["using", "index", "tablespace"]> extends never
			? I
			: SkipIndexParams<
					T,
					Nx<EatWords<T, I, ["using", "index", "tablespace"]>>
				>;

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
						? SkipParenOpt<T, Nx2<Nx2<I>>> extends infer J extends number
							? SkipRefActions<T, J>
							: never
						: SkipRefActions<T, Nx3<I>>
				: I
			: I;

/**
 * After `GENERATED`: `ALWAYS AS IDENTITY [(opts)]` | `BY DEFAULT AS IDENTITY [(opts)]` |
 * `ALWAYS AS (expr) [STORED | VIRTUAL]` → `[isIdentity, next]`.
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
						? [
								false,
								SkipWord<T, SkipToCloseParen<T, Nx<J>>, "stored" | "virtual">,
							]
						: Expected<'"(" or IDENTITY', T, J>
				: never
			: [
					true,
					SkipParenOpt<T, EatWords<T, I, ["by", "default", "as", "identity"]>>,
				]
		: [true, SkipParenOpt<T, EatWords<T, I, ["always", "as", "identity"]>>];

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
				? R extends Ok<
						infer Names extends readonly string[],
						infer J2 extends number
					>
					? SkipViewStorage<T, J2, Mat> extends infer J3 extends number
						? ParseViewAs<T, J3, OrReplace, Mat, Ine, RefOf<Parts>, Names>
						: never
					: R
				: never
			: SkipViewStorage<T, J, Mat> extends infer J2 extends number
				? ParseViewAs<T, J2, OrReplace, Mat, Ine, RefOf<Parts>, null>
				: never
		: Expected<"view name", T, I>;

/** A plain view takes only `WITH (options)`; USING and TABLESPACE are for materialized views. */
type SkipViewStorage<
	T extends Toks,
	I extends number,
	Mat extends boolean,
> = Mat extends true
	? SkipStorage<T, I>
	: T[I] extends WordTok<"with">
		? T[Nx<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>>
			: I
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
			? R extends Ok<infer Q, infer J extends number>
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
			? R extends Ok<
					infer Names extends readonly string[],
					infer J2 extends number
				>
				? SkipStorage<T, J2> extends infer J3 extends number
					? EatWord<T, J3, "as"> extends never
						? Expected<"AS", T, J3>
						: ParseSelectStmt<T, EatWord<T, J3, "as">> extends infer Q
							? Q extends Ok<infer S, infer J4 extends number>
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
										SkipCheckOption<T, J4>
									>
								: Q
							: never
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
		groupingSets: false;
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
		? SkipWords<
				T,
				SkipWord<T, Nx<I>, "cascaded" | "local">,
				["check", "option"]
			> extends infer J extends number
			? J extends SkipWord<T, Nx<I>, "cascaded" | "local">
				? I
				: J
			: never
		: I;

// ─── CREATE TYPE / SCHEMA ───

/** After `TYPE`: only `name AS ENUM (...)` has a schema effect; composite, range, base and shell types are noops. */
type ParseCreateType<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? EatWords<T, J, ["as", "enum"]> extends never
			? Noop<T, J, "create type">
			: T[EatWords<T, J, ["as", "enum"]>] extends OpTok<"(">
				? ParseEnumValues<
						T,
						Nx<EatWords<T, J, ["as", "enum"]>>,
						[]
					> extends infer R
					? R extends Ok<
							infer Vs extends readonly string[],
							infer J2 extends number
						>
						? Ok<{ t: "create_enum"; name: RefOf<Parts>; values: Vs }, J2>
						: R
					: never
				: Expected<'"("', T, EatWords<T, J, ["as", "enum"]>>
		: Expected<"type name", T, I>;

type ParseEnumValues<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	T[I] extends OpTok<")">
		? Ok<Acc, Nx<I>>
		: T[I] extends StrTok<infer V>
			? T[Nx<I>] extends OpTok<",">
				? ParseEnumValues<T, Nx2<I>, [...Acc, V]>
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
						SkipElement<T, Nx<I>, [], false>,
						Ine,
						S,
						Known,
						Tbls,
						Views
					>
				: SchemaElement<T, Nx<I>, S, Known, false, false> extends infer R
					? R extends Ok<infer E, infer J extends number>
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
							? R extends Ok<infer E, infer J extends number>
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
											: R
								: R
							: never
					: W extends "sequence"
						? QualName<T, IfNotExists<T, Nx<I>>[1]> extends [
								infer P extends readonly string[],
								number,
							]
							? InSchema<
									T,
									SkipElement<T, Nx<I>, [], true>,
									S,
									Known,
									RefOf<P>,
									null,
									IfNotExists<T, Nx<I>>[1]
								>
							: Expected<"sequence name", T, Nx<I>>
						: W extends "index" | "unique" | "trigger" | "constraint"
							? SkipElement<T, Nx<I>, [], true> extends infer J extends number
								? ElementOn<T, Nx<I>, J> extends infer K extends number
									? QualName<T, SkipWord<T, K, "only">> extends [
											infer P extends readonly string[],
											number,
										]
										? InSchema<
												T,
												J,
												S,
												Known,
												RefOf<P>,
												null,
												SkipWord<T, K, "only">
											>
										: Ok<null, J>
									: Ok<null, J>
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
		: E;

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

/** Index after the first `ON` between `I` and `End` (the relation of an index or trigger), or `null`. */
type ElementOn<
	T extends Toks,
	I extends number,
	End extends number,
> = I extends End
	? null
	: T[I] extends WordTok<"on">
		? Nx<I>
		: T[I] extends OpTok<"(">
			? null
			: ElementOn<T, Nx<I>, End>;

/**
 * Skip a schema element without a schema effect: up to the next depth-0 `CREATE` / `GRANT` that
 * starts an element, or the end of the statement. `Stop` is false right after `GRANT`, `,` and
 * `WITH`, where `CREATE` / `GRANT` is a privilege (`GRANT CREATE ON ...`, `WITH GRANT OPTION`).
 */
type SkipElement<
	T extends Toks,
	I extends number,
	D extends readonly unknown[],
	Stop extends boolean,
> =
	T[I] extends OpTok<infer O>
		? O extends ";"
			? D extends readonly []
				? I
				: SkipElement<T, Nx<I>, D, true>
			: O extends "("
				? SkipElement<T, Nx<I>, [...D, 0], true>
				: O extends ")"
					? SkipElement<
							T,
							Nx<I>,
							D extends readonly [unknown, ...infer D2] ? D2 : [],
							true
						>
					: SkipElement<T, Nx<I>, D, O extends "," ? false : true>
		: T[I] extends WordTok<infer W>
			? W extends "create" | "grant"
				? Stop extends true
					? D extends readonly []
						? I
						: SkipElement<T, Nx<I>, D, true>
					: SkipElement<T, Nx<I>, D, true>
				: SkipElement<T, Nx<I>, D, W extends "with" ? false : true>
			: T[I] extends Tok
				? SkipElement<T, Nx<I>, D, true>
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
	Ident<T, I> extends [infer From extends string, infer J extends number]
		? EatWords<T, J, ["rename", "to"]> extends never
			? Noop<T, J, "alter schema">
			: Ident<T, EatWords<T, J, ["rename", "to"]>> extends [
						infer To extends string,
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
							? R extends Ok<infer A, infer J2 extends number>
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
	T[I] extends WordTok<"rename">
		? true
		: T[I] extends WordTok<"set">
			? T[Nx<I>] extends WordTok<"schema">
				? true
				: false
			: false;

type ParseSetSchema<T extends Toks, I extends number> =
	Ident<T, I> extends [infer S extends string, infer J extends number]
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
			? R extends Ok<infer A extends AlterAction, infer J extends number>
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
		? AnyLabel<T, Nx<I>> extends [string, infer J extends number]
			? ParseAddConstraintBody<T, J>
			: Expected<"constraint name", T, Nx<I>>
		: T[I] extends WordTok<"primary" | "not">
			? ParseAddConstraintBody<T, I>
			: T[I] extends WordTok<"unique" | "check" | "foreign" | "exclude">
				? NoopAction<T, I>
				: IfNotExists<T, SkipWord<T, I, "column">> extends [
							infer Ine extends boolean,
							infer I1 extends number,
						]
					? ParseColumnDef<T, I1, TN> extends infer R
						? R extends Ok<infer C extends ColumnDef, infer J extends number>
							? Ok<{ t: "add_column"; ifNotExists: Ine; col: C }, J>
							: R
						: never
					: never;

type ParseAddConstraintBody<T extends Toks, I extends number> =
	T[I] extends WordTok<"not">
		? ParseNotNullConstraint<T, Nx<I>> extends infer R
			? R extends Ok<infer C, infer J extends number>
				? Ok<
						C extends { readonly col: infer N }
							? { t: "set_not_null"; name: N }
							: { t: "noop" },
						J
					>
				: R
			: never
		: EatWords<T, I, ["primary", "key"]> extends never
			? NoopAction<T, I>
			: T[EatWords<T, I, ["primary", "key"]>] extends OpTok<"(">
				? KeyColumns<
						T,
						Nx<EatWords<T, I, ["primary", "key"]>>,
						[]
					> extends infer R
					? R extends Ok<
							infer Cols extends readonly string[],
							infer J extends number
						>
						? Ok<{ t: "add_pk"; cols: Cols }, SkipToActionEnd<T, J>>
						: R
					: never
				: NoopAction<T, I>; // PRIMARY KEY USING INDEX name

/** After `DROP`: `CONSTRAINT ...` (noop) | `[COLUMN] [IF EXISTS] name [CASCADE | RESTRICT]`. */
type ParseAlterDrop<T extends Toks, I extends number> =
	T[I] extends WordTok<"constraint">
		? NoopAction<T, I>
		: IfExists<T, SkipWord<T, I, "column">> extends [
					infer Ife extends boolean,
					infer I1 extends number,
				]
			? Ident<T, I1> extends [infer Name extends string, infer J extends number]
				? Ok<{ t: "drop_column"; ifExists: Ife; name: Name }, Cascade<T, J>[1]>
				: Expected<"column name", T, I1>
			: never;

/** After `RENAME`: `TO new` | `CONSTRAINT a TO b` (noop) | `[COLUMN] a TO b`. */
type ParseAlterRename<T extends Toks, I extends number> =
	T[I] extends WordTok<"to">
		? Ident<T, Nx<I>> extends [infer To extends string, infer J extends number]
			? Ok<{ t: "rename_table"; to: To }, J>
			: Expected<"new name", T, Nx<I>>
		: T[I] extends WordTok<"constraint">
			? AnyLabel<T, Nx<I>> extends [string, infer J extends number]
				? EatWord<T, J, "to"> extends never
					? Expected<"TO", T, J>
					: AnyLabel<T, EatWord<T, J, "to">> extends [
								string,
								infer J2 extends number,
							]
						? Ok<{ t: "noop" }, J2>
						: Expected<"new constraint name", T, EatWord<T, J, "to">>
				: Expected<"constraint name", T, Nx<I>>
			: Ident<T, SkipWord<T, I, "column">> extends [
						infer From extends string,
						infer J extends number,
					]
				? EatWord<T, J, "to"> extends never
					? Expected<"TO", T, J>
					: Ident<T, EatWord<T, J, "to">> extends [
								infer To extends string,
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
										? R extends Ok<unknown, infer J2 extends number>
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
		? R extends Ok<infer Ty extends string, infer J extends number>
			? SkipCollate<T, J> extends infer J2 extends number
				? EatWord<T, J2, "using"> extends never
					? Ok<{ t: "alter_type"; name: C; type: Ty }, J2>
					: ParseExpr<T, EatWord<T, J2, "using">, 0> extends infer E
						? E extends Ok<unknown, infer J3 extends number>
							? Ok<{ t: "alter_type"; name: C; type: Ty }, J3>
							: E
						: never
				: never
			: R
		: never;
type SkipCollate<T extends Toks, I extends number> =
	T[I] extends WordTok<"collate">
		? QualName<T, Nx<I>> extends [unknown, infer J extends number]
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
				: IfNotExists<T, Nx2<J>> extends [
							infer Ine extends boolean,
							infer I1 extends number,
						]
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
						? Ident<T, Nx2<J>> extends [
								infer To extends string,
								infer J2 extends number,
							]
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
			? R extends Ok<
					infer Names extends readonly TableRef[],
					infer J extends number
				>
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
