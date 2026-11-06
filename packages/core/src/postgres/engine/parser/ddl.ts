import type { Next } from "../../../engine/next.js";
import type { Tok, Toks } from "../../../engine/tokens.js";
import type { SerialAliases } from "../../schema/type-facts.js";
import type {
	AlterAction,
	ColumnDef,
	LikeClause,
	TableConstraint,
	TableRef,
	Tag,
} from "../ast.js";
import type { OpTok, StrTok, WordTok } from "../lexer/tokens.js";
import type { CompareOp } from "../ops.js";
import type { LastOf, ParseExpr, ParseExprList } from "./expr.js";
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
	Nx2,
	Nx3,
	Ok,
	ParenIdentList,
	QualName,
	SkipFirst,
	SkipToCloseParen,
	SkipWord,
	SkipWords,
	SyntaxErrorAt,
} from "./util.js";

export type ParseDdl<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "create"
			? ParseCreate<T, Next<I>, false>
			: W extends "alter"
				? ParseAlter<T, Next<I>>
				: W extends "drop"
					? ParseDrop<T, Next<I>>
					: Noop<T, I, W>
		: SyntaxErrorAt<T, I>;

type Noop<T extends Toks, I extends number, What extends string> = Ok<
	{ t: "noop"; what: What },
	SkipToStmtEnd<T, I>
>;

type SkipUntil<
	T extends Toks,
	I extends number,
	Stop extends string,
	D extends readonly unknown[] = [],
> =
	T[I] extends OpTok<infer O>
		? D extends readonly [unknown, ...infer D2]
			? O extends "("
				? SkipUntil<T, Next<I>, Stop, [...D, 0]>
				: O extends ")"
					? SkipUntil<T, Next<I>, Stop, D2>
					: SkipUntil<T, Next<I>, Stop, D>
			: O extends Stop
				? I
				: O extends "("
					? SkipUntil<T, Next<I>, Stop, [0]>
					: SkipUntil<T, Next<I>, Stop, D>
		: T[I] extends Tok
			? SkipUntil<T, Next<I>, Stop, D>
			: I;

type SkipToStmtEnd<T extends Toks, I extends number> = SkipUntil<T, I, ";">;
type SkipToElementEnd<T extends Toks, I extends number> = SkipUntil<
	T,
	I,
	"," | ")"
>;
type SkipToActionEnd<T extends Toks, I extends number> = SkipUntil<
	T,
	I,
	"," | ";"
>;

type SkipRoutine<T extends Toks, I extends number> =
	T[I] extends OpTok<";">
		? I
		: T[I] extends WordTok<"begin">
			? T[Next<I>] extends WordTok<"atomic">
				? SkipAtomic<T, Nx2<I>, []>
				: SkipRoutine<T, Next<I>>
			: T[I] extends OpTok<"(">
				? SkipToCloseParen<T, Next<I>> extends infer J extends number
					? SkipRoutine<T, J>
					: SkipToCloseParen<T, Next<I>>
				: T[I] extends Tok
					? SkipRoutine<T, Next<I>>
					: I;
type SkipAtomic<
	T extends Toks,
	I extends number,
	D extends readonly unknown[],
> =
	T[I] extends WordTok<"case">
		? SkipAtomic<T, Next<I>, [...D, 0]>
		: T[I] extends WordTok<"end">
			? D extends readonly [unknown, ...infer D2]
				? SkipAtomic<T, Next<I>, D2>
				: Next<I>
			: T[I] extends Tok
				? SkipAtomic<T, Next<I>, D>
				: SyntaxErrorAt<T, I>;

type RoutineEnd<T extends Toks, I extends number, Node> =
	SkipRoutine<T, I> extends infer J extends number
		? Ok<Node, J>
		: SkipRoutine<T, I>;

type SkipParenOpt<T extends Toks, I extends number> =
	T[I] extends OpTok<"("> ? SkipToCloseParen<T, Next<I>> : I;

type IfExists<T extends Toks, I extends number> =
	EatWords<T, I, ["if", "exists"]> extends never ? [false, I] : [true, Nx2<I>];
type IfNotExists<T extends Toks, I extends number> =
	EatWords<T, I, ["if", "not", "exists"]> extends never
		? [false, I]
		: [true, Nx3<I>];

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
			: ParseNameList<T, Next<J>, [...Acc, RefOf<Parts>]>
		: Expected<"name", T, I>;

type Cascade<T extends Toks, I extends number> =
	T[I] extends WordTok<"cascade">
		? [true, Next<I>]
		: T[I] extends WordTok<"restrict">
			? [false, Next<I>]
			: [false, I];

type NoopObject =
	| "index"
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
	| "event"
	| "publication"
	| "subscription"
	| "server"
	| "statistics"
	| "text"
	| "foreign"
	| "language"
	| "conversion"
	| "tablespace";
type NoopCreateObject =
	| NoopObject
	| "unique"
	| "constraint"
	| "cast"
	| "access"
	| "transform"
	| "default"
	| "trusted"
	| "procedural";

type ParseCreate<T extends Toks, I extends number, OrReplace extends boolean> =
	T[I] extends WordTok<infer W>
		? W extends "or"
			? EatWord<T, Next<I>, "replace"> extends never
				? Expected<"REPLACE", T, Next<I>>
				: ParseCreate<T, Nx2<I>, true>
			: W extends "temp" | "temporary" | "unlogged" | "global" | "local"
				? ParseCreate<T, Next<I>, OrReplace>
				: W extends "table"
					? ParseCreateTable<T, Next<I>>
					: W extends "view"
						? ParseCreateView<T, Next<I>, OrReplace, false, false>
						: W extends "materialized"
							? EatWord<T, Next<I>, "view"> extends never
								? Expected<"VIEW", T, Next<I>>
								: OrReplace extends true
									? SyntaxErrorAt<T, I>
									: IfNotExists<T, Nx2<I>> extends [
												infer Ine extends boolean,
												infer I1 extends number,
											]
										? ParseCreateView<T, I1, false, true, Ine>
										: never
							: W extends "recursive"
								? EatWord<T, Next<I>, "view"> extends never
									? Expected<"VIEW", T, Next<I>>
									: ParseCreateView<T, Nx2<I>, OrReplace, false, false, true>
								: W extends "type"
									? ParseCreateType<T, Next<I>>
									: W extends "schema"
										? ParseCreateSchema<T, Next<I>>
										: W extends "function"
											? ParseCreateFunction<T, Next<I>>
											: W extends "procedure"
												? RoutineEnd<
														T,
														Next<I>,
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

type ParseCreateFunction<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? SkipToCloseParen<T, Next<J>> extends infer J1 extends number
				? FnReturns<T, J1> extends [
						infer Ret,
						infer Srf,
						infer K extends number,
					]
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
					: FnReturns<T, J1>
				: SkipToCloseParen<T, Next<J>>
			: Expected<'"("', T, J>
		: Expected<"function name", T, I>;
type FnReturns<T extends Toks, I extends number> =
	T[I] extends WordTok<"returns">
		? T[Next<I>] extends WordTok<"table">
			? FnTableReturn<T, Nx2<I>>
			: T[Next<I>] extends WordTok<"setof">
				? FnRetType<T, Nx2<I>, true>
				: FnRetType<T, Next<I>, false>
		: ["unknown", false, I];
type FnRetType<T extends Toks, I extends number, Srf extends boolean> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"%">
			? T[Next<J>] extends WordTok<"type">
				? [`${LastOf<Parts>}%type`, Srf, Nx2<J>]
				: SyntaxErrorAt<T, Next<J>>
			: FnPlainRetType<T, I, Srf>
		: FnPlainRetType<T, I, Srf>;
type FnPlainRetType<T extends Toks, I extends number, Srf extends boolean> =
	ParseTypeName<T, I> extends Ok<infer Ty, infer J>
		? [Ty, Srf, J]
		: ParseTypeName<T, I>;

type FnTableReturn<T extends Toks, I extends number> =
	T[I] extends OpTok<"(">
		? Ident<T, Next<I>> extends [string, infer J extends number]
			? FnRetType<T, J, true> extends [infer Ty, true, infer K extends number]
				? T[K] extends OpTok<")">
					? [Ty, true, Next<K>]
					: ["record", true, I]
				: FnRetType<T, J, true>
			: Expected<"column name", T, Next<I>>
		: Expected<'"("', T, I>;

type CreateTableNode<Ine, Ref, Cols, Cons, Like, Inh, Of> = {
	t: "create_table";
	ifNotExists: Ine;
	table: Ref;
	columns: Cols;
	constraints: Cons;
	like: Like;
	inherits: Inh;
	of: Of;
};
type CtasNode<Ine, Ref, Names, Q> = {
	t: "create_table_as";
	ifNotExists: Ine;
	table: Ref;
	cols: Names;
	q: Q;
};

type ParseCreateTable<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer I1 extends number]
		? QualName<T, I1> extends [
				infer Parts extends readonly string[],
				infer J extends number,
			]
			? T[J] extends OpTok<"(">
				? IsCtasColList<T, Next<J>> extends true
					? ParseCtasCols<T, J, Ine, RefOf<Parts>>
					: ParseTableBody<T, Next<J>, RefOf<Parts>["name"]> extends Ok<
								[infer Cols, infer Cons, infer Like],
								infer J2
							>
						? ParseTableTail<T, J2> extends [infer Inh, infer J3 extends number]
							? Ok<
									CreateTableNode<
										Ine,
										RefOf<Parts>,
										Cols,
										Cons,
										Like,
										Inh,
										null
									>,
									J3
								>
							: ParseTableTail<T, J2>
						: ParseTableBody<T, Next<J>, RefOf<Parts>["name"]>
				: T[J] extends WordTok<"of">
					? ParseTypedTable<T, Next<J>, Ine, RefOf<Parts>>
					: EatWords<T, J, ["partition", "of"]> extends never
						? ParseCtasAfterCols<T, J, Ine, RefOf<Parts>, null>
						: ParsePartitionOf<T, Nx2<J>, Ine, RefOf<Parts>>
			: Expected<"table name", T, I1>
		: never;

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
					? ParseTypedElements<T, Next<J>, Ref["name"]>
					: J
			) extends infer J2
			? J2 extends number
				? PartitionTail<T, J2> extends infer J3 extends number
					? Ok<CreateTableNode<Ine, Ref, [], [], [], [], RefOf<TP>>, J3>
					: PartitionTail<T, J2>
				: J2
			: never
		: Expected<"type name", T, I>;

type ParseTypedElements<T extends Toks, I extends number, TN extends string> = (
	IsConstraintStart<T, I> extends true
		? ParseTableConstraint<T, I>
		: Ident<T, I> extends [infer Name extends string, infer J extends number]
			? ParseColConstraints<
					T,
					SkipWords<T, J, ["with", "options"]>,
					{ tn: TN; name: Name; ty: "unknown" },
					never
				>
			: Expected<"column name or table constraint", T, I>
) extends infer R
	? R extends Ok<unknown, infer J>
		? T[J] extends OpTok<",">
			? ParseTypedElements<T, Next<J>, TN>
			: T[J] extends OpTok<")">
				? Next<J>
				: Expected<'"," or ")"', T, J>
		: R
	: never;

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
	ParenIdentList<T, I> extends Ok<
		infer Names extends readonly string[],
		infer J
	>
		? ParseCtasAfterCols<T, J, Ine, Ref, Names>
		: ParenIdentList<T, I>;

type ParseCtasAfterCols<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Ref extends TableRef,
	Names extends readonly string[] | null,
> =
	SkipStorage<T, I, false> extends infer I1 extends number
		? EatWord<T, I1, "as"> extends never
			? Expected<'"(", AS, OF or PARTITION OF', T, I1>
			: T[Next<I1>] extends WordTok<"execute">
				? ParseCtasExecute<T, Nx2<I1>, Ine, Ref, Names>
				: ParseSelectStmt<T, Next<I1>> extends Ok<infer Q, infer J>
					? Ok<CtasNode<Ine, Ref, Names, Q>, SkipWithData<T, J>>
					: ParseSelectStmt<T, Next<I1>>
		: SkipStorage<T, I, false>;

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
					? ParseExprList<T, Next<J>, []>
					: Ok<[], J>
			) extends infer R
			? R extends Ok<unknown, infer J2>
				? (
						T[J] extends OpTok<"(">
							? EatOp<T, J2, ")"> extends never
								? Expected<'")"', T, J2>
								: Next<J2>
							: J2
					) extends infer J3
					? J3 extends number
						? Ok<
								CtasNode<Ine, Ref, Names, { t: "execute"; name: N }>,
								SkipWithData<T, J3>
							>
						: J3
					: never
				: R
			: never
		: Expected<"prepared statement name", T, I>;

type SkipWithData<T extends Toks, I extends number> =
	EatWords<T, I, ["with", "data"]> extends never
		? SkipWords<T, I, ["with", "no", "data"]>
		: Nx2<I>;

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
		? SkipParenOpt<T, J> extends infer J1 extends number
			? SkipPartitionBound<T, J1> extends infer J2 extends number
				? PartitionTail<T, J2> extends infer J3 extends number
					? Ok<CreateTableNode<Ine, Ref, [], [], [], [RefOf<PP>], null>, J3>
					: PartitionTail<T, J2>
				: SkipPartitionBound<T, J1>
			: SkipParenOpt<T, J>
		: Expected<"parent table name", T, I>;

type SkipPartitionBound<T extends Toks, I extends number> =
	T[I] extends WordTok<"default">
		? Next<I>
		: EatWords<T, I, ["for", "values"]> extends never
			? Expected<"FOR VALUES or DEFAULT", T, I>
			: Nx2<I> extends infer J extends number
				? T[J] extends WordTok<"in" | "with">
					? T[Next<J>] extends OpTok<"(">
						? T[Nx2<J>] extends OpTok<")">
							? SyntaxErrorAt<T, Nx2<J>>
							: SkipToCloseParen<T, Nx2<J>>
						: Expected<'"("', T, Next<J>>
					: T[J] extends WordTok<"from">
						? T[Next<J>] extends OpTok<"(">
							? SkipToCloseParen<T, Nx2<J>> extends infer K extends number
								? EatWord<T, K, "to"> extends never
									? Expected<"TO", T, K>
									: T[Next<K>] extends OpTok<"(">
										? SkipToCloseParen<T, Nx2<K>>
										: Expected<'"("', T, Next<K>>
								: SkipToCloseParen<T, Nx2<J>>
							: Expected<'"("', T, Next<J>>
						: Expected<"IN, FROM or WITH", T, J>
				: never;

type ParseTableTail<T extends Toks, I extends number> =
	T[I] extends WordTok<"inherits">
		? EatOp<T, Next<I>, "("> extends never
			? Expected<'"("', T, Next<I>>
			: ParseNameList<T, Nx2<I>, []> extends Ok<infer Ps, infer J>
				? EatOp<T, J, ")"> extends never
					? Expected<'")"', T, J>
					: WithInherits<Ps, PartitionTail<T, Next<J>>>
				: ParseNameList<T, Nx2<I>, []>
		: WithInherits<[], PartitionTail<T, I>>;
type WithInherits<Ps, J> = J extends number ? [Ps, J] : J;

type PartitionTail<T extends Toks, I extends number> =
	EatWords<T, I, ["partition", "by"]> extends never
		? SkipStorage<T, I, false>
		: Nx2<I> extends infer J extends number
			? Ident<T, J> extends [string, infer J1 extends number]
				? T[J1] extends OpTok<"(">
					? SkipToCloseParen<T, Next<J1>> extends infer J2 extends number
						? SkipStorage<T, J2, false>
						: SkipToCloseParen<T, Next<J1>>
					: Expected<'"("', T, J1>
				: Expected<"RANGE, LIST or HASH", T, J>
			: never;

type SkipStorage<T extends Toks, I extends number, Mat extends boolean> =
	SkipReloptions<
		T,
		T[I] extends WordTok<"using"> ? Nx2<I> : I,
		Mat
	> extends infer J
		? J extends number
			? Mat extends true
				? SkipTablespace<T, J>
				: SkipOnCommit<T, J> extends infer K extends number
					? SkipTablespace<T, K>
					: SkipOnCommit<T, J>
			: J
		: never;
type SkipReloptions<T extends Toks, I extends number, Mat extends boolean> =
	T[I] extends WordTok<"with">
		? T[Next<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>>
			: SyntaxErrorAt<T, Next<I>>
		: Mat extends true
			? I
			: SkipWords<T, I, ["without", "oids"]>;
type SkipOnCommit<T extends Toks, I extends number> =
	EatWords<T, I, ["on", "commit"]> extends never
		? I
		: OnCommitAction<T, Nx2<I>>;
type OnCommitAction<T extends Toks, I extends number> =
	T[I] extends WordTok<"drop">
		? Next<I>
		: T[I] extends WordTok<"delete" | "preserve">
			? EatWord<T, Next<I>, "rows"> extends never
				? Expected<"ROWS", T, Next<I>>
				: Nx2<I>
			: Expected<"DROP, DELETE ROWS or PRESERVE ROWS", T, I>;
type SkipTablespace<T extends Toks, I extends number> =
	T[I] extends WordTok<"tablespace"> ? Nx2<I> : I;

type ParseTableBody<T extends Toks, I extends number, TN extends string> =
	T[I] extends OpTok<")">
		? Ok<[[], [], []], Next<I>>
		: ParseTableElements<T, I, TN, [], [], []>;

type ParseTableElements<
	T extends Toks,
	I extends number,
	TN extends string,
	Cols extends readonly ColumnDef[],
	Cons extends readonly TableConstraint[],
	Like extends readonly LikeClause[],
> =
	IsConstraintStart<T, I> extends true
		? ParseTableConstraint<T, I> extends Ok<
				infer C extends TableConstraint,
				infer J
			>
			? ElementNext<T, J, TN, Cols, [...Cons, C], Like>
			: ParseTableConstraint<T, I>
		: T[I] extends WordTok<"like">
			? ParseLike<T, Next<I>> extends Ok<infer L extends LikeClause, infer J>
				? ElementNext<T, J, TN, Cols, Cons, [...Like, L]>
				: ParseLike<T, Next<I>>
			: ParseColumnDef<T, I, TN> extends Ok<infer C extends ColumnDef, infer J>
				? ElementNext<T, J, TN, [...Cols, C], Cons, Like>
				: ParseColumnDef<T, I, TN>;

type ConstraintStart =
	| "constraint"
	| "primary"
	| "unique"
	| "check"
	| "foreign"
	| "not";
type IsConstraintStart<T extends Toks, I extends number> =
	T[I] extends WordTok<ConstraintStart>
		? true
		: T[I] extends WordTok<"exclude">
			? T[Next<I>] extends WordTok<"using"> | OpTok<"(">
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
		? ParseTableElements<T, Next<I>, TN, Cols, Cons, Like>
		: T[I] extends OpTok<")">
			? Ok<[Cols, Cons, Like], Next<I>>
			: Expected<'"," or ")"', T, I>;

type ParseTableConstraint<T extends Toks, I extends number> =
	T[I] extends WordTok<"constraint">
		? Ident<T, Next<I>> extends [string, infer J extends number]
			? ParseTableConstraintBody<T, J>
			: Expected<"constraint name", T, Next<I>>
		: ParseTableConstraintBody<T, I>;

type ParseTableConstraintBody<T extends Toks, I extends number> =
	EatWords<T, I, ["primary", "key"]> extends never
		? T[I] extends WordTok<"not">
			? ParseNotNullConstraint<T, Next<I>>
			: T[I] extends WordTok<"unique" | "check" | "foreign" | "exclude">
				? Ok<{ t: "other" }, SkipToElementEnd<T, Next<I>>>
				: Expected<"table constraint", T, I>
		: T[Nx2<I>] extends OpTok<"(">
			? KeyColumns<T, Nx3<I>, []> extends Ok<infer Cols, infer J>
				? Ok<{ t: "pk"; cols: Cols }, SkipToElementEnd<T, J>>
				: KeyColumns<T, Nx3<I>, []>
			: Expected<'"("', T, Nx2<I>>;

type KeyColumns<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? T[J] extends OpTok<",">
			? KeyColumns<T, Next<J>, [...Acc, N]>
			: (
						EatWords<T, J, ["without", "overlaps"]> extends never
							? J
							: Nx2<J>
					) extends infer K extends number
				? EatOp<T, K, ")"> extends never
					? Expected<'"," or ")"', T, K>
					: Ok<[...Acc, N], Next<K>>
				: never
		: Expected<"column name", T, I>;

type ParseNotNullConstraint<T extends Toks, I extends number> =
	EatWord<T, I, "null"> extends never
		? Expected<"NULL", T, I>
		: Ident<T, Next<I>> extends [infer C, infer J extends number]
			? ConstraintAttrs<T, J, false, J> extends [
					infer NotValid,
					infer J2 extends number,
				]
				? Ok<
						NotValid extends true ? { t: "other" } : { t: "not_null"; col: C },
						J2
					>
				: ConstraintAttrs<T, J, false, J>
			: Expected<"column name", T, Next<I>>;

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
					? T[Next<I>] extends WordTok<"immediate">
						? ConstraintAttrs<T, Nx2<I>, NotValid, At>
						: T[Next<I>] extends WordTok<"deferred">
							? NotMarked<"DEFERRABLE", At>
							: [NotValid, I]
					: W extends "no"
						? T[Next<I>] extends WordTok<"inherit">
							? ConstraintAttrs<T, Nx2<I>, NotValid, At>
							: [NotValid, I]
						: W extends "not"
							? T[Next<I>] extends WordTok<"deferrable">
								? ConstraintAttrs<T, Nx2<I>, NotValid, At>
								: T[Next<I>] extends WordTok<"enforced">
									? NotMarked<"NOT ENFORCED", At>
									: T[Next<I>] extends WordTok<"valid">
										? ConstraintAttrs<T, Nx2<I>, true, At>
										: [NotValid, I]
							: [NotValid, I]
		: [NotValid, I];
type NotMarked<What extends string, At extends number> = Fail<
	`NOT NULL constraints cannot be marked ${What}`,
	At
>;

type ParseLike<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? ParseLikeOptions<T, J, never, false> extends [
				infer Def,
				infer J2 extends number,
				infer Copies,
			]
			? Ok<
					{
						ref: RefOf<Parts>;
						defaults: Copies;
						options: Def;
					},
					J2
				>
			: ParseLikeOptions<T, J, never, false>
		: Expected<"table name after LIKE", T, I>;
type DefaultLikeOption = "defaults" | "identity" | "generated";
type ParseLikeOptions<
	T extends Toks,
	I extends number,
	Def extends DefaultLikeOption,
	Copies extends boolean,
> =
	T[I] extends WordTok<"including">
		? T[Next<I>] extends WordTok<infer O>
			? ParseLikeOptions<
					T,
					Nx2<I>,
					O extends "all"
						? DefaultLikeOption
						: Def | Extract<O, DefaultLikeOption>,
					O extends DefaultLikeOption | "all" ? true : Copies
				>
			: Expected<"LIKE option", T, Next<I>>
		: T[I] extends WordTok<"excluding">
			? T[Next<I>] extends WordTok<infer O>
				? ParseLikeOptions<
						T,
						Nx2<I>,
						O extends "all" ? never : Exclude<Def, O>,
						O extends DefaultLikeOption | "all" ? false : Copies
					>
				: Expected<"LIKE option", T, Next<I>>
			: [Def, I, Copies];

type ParseColumnDef<T extends Toks, I extends number, TN extends string> =
	Ident<T, I> extends [infer Name extends string, infer J extends number]
		? ParseTypeName<T, J> extends Ok<infer Ty extends string, infer J2>
			? ParseColConstraints<
					T,
					SkipColumnStorage<T, J2>,
					{ tn: TN; name: Name; ty: Ty },
					IsSerial<T, J> extends true ? "nn" | "hd" : never
				>
			: ParseTypeName<T, J>
		: Expected<"column name", T, I>;

type SkipColumnStorage<T extends Toks, I extends number> =
	T[I] extends WordTok<"storage">
		? SkipCompression<T, Nx2<I>>
		: SkipCompression<T, I>;
type SkipCompression<T extends Toks, I extends number> =
	T[I] extends WordTok<"compression"> ? Nx2<I> : I;

type IsSerial<T extends Toks, I extends number> =
	T[I] extends WordTok<keyof SerialAliases> ? true : false;

type ColCtx = {
	readonly tn: string;
	readonly name: string;
	readonly ty: string;
};
type NullConflict<C extends ColCtx, I extends number> = Fail<
	`conflicting NULL/NOT NULL declarations for column "${C["name"]}" of table "${C["tn"]}"`,
	I
>;

type ParseColConstraints<
	T extends Toks,
	I extends number,
	C extends ColCtx,
	F extends string,
> =
	T[I] extends WordTok<infer W>
		? W extends "constraint"
			? Ident<T, Next<I>> extends [string, infer J extends number]
				? ParseColConstraints<T, J, C, F>
				: Expected<"constraint name", T, Next<I>>
			: W extends "not"
				? T[Next<I>] extends WordTok<"null">
					? "nul" extends F
						? NullConflict<C, I>
						: ParseColConstraints<
								T,
								SkipWords<T, Nx2<I>, ["no", "inherit"]>,
								C,
								F | "nn"
							>
					: T[Next<I>] extends WordTok<"deferrable" | "enforced">
						? ParseColConstraints<T, Nx2<I>, C, F>
						: Expected<"NULL", T, Next<I>>
				: W extends "null"
					? Extract<F, "nn" | "pk"> extends never
						? ParseColConstraints<T, Next<I>, C, F | "nul">
						: NullConflict<C, I>
					: W extends "default"
						? ParseBExpr<T, Next<I>> extends Ok<unknown, infer J>
							? ParseColConstraints<T, J, C, F | "hd">
							: ParseBExpr<T, Next<I>>
						: W extends "primary"
							? EatWord<T, Next<I>, "key"> extends never
								? Expected<"KEY", T, Next<I>>
								: "nul" extends F
									? NullConflict<C, I>
									: SkipIndexParams<T, Nx2<I>> extends infer J extends number
										? ParseColConstraints<T, J, C, F | "pk">
										: SkipIndexParams<T, Nx2<I>>
							: W extends "unique"
								? SkipIndexParams<
										T,
										SkipFirst<
											T,
											Next<I>,
											[["nulls", "distinct"], ["nulls", "not", "distinct"]]
										>
									> extends infer J
									? J extends number
										? ParseColConstraints<T, J, C, F>
										: J
									: never
								: W extends "check"
									? T[Next<I>] extends OpTok<"(">
										? SkipToCloseParen<T, Nx2<I>> extends infer J extends number
											? ParseColConstraints<
													T,
													SkipWords<T, J, ["no", "inherit"]>,
													C,
													F
												>
											: SkipToCloseParen<T, Nx2<I>>
										: Expected<'"("', T, Next<I>>
									: W extends "references"
										? QualName<T, Next<I>> extends [
												unknown,
												infer J extends number,
											]
											? SkipParenOpt<T, J> extends infer J1 extends number
												? SkipRefActions<T, J1> extends infer J2 extends number
													? ParseColConstraints<T, J2, C, F>
													: SkipRefActions<T, J1>
												: SkipParenOpt<T, J>
											: Expected<"referenced table", T, Next<I>>
										: W extends "generated"
											? ParseGenerated<T, Next<I>> extends infer G
												? G extends [true, infer J extends number]
													? "nul" extends F
														? NullConflict<C, I>
														: ParseColConstraints<T, J, C, F | "nn" | "hd">
													: G extends [false, infer J extends number]
														? ParseColConstraints<T, J, C, F | "hd">
														: G
												: never
											: W extends "deferrable" | "enforced"
												? ParseColConstraints<T, Next<I>, C, F>
												: W extends "initially"
													? ParseColConstraints<T, Nx2<I>, C, F>
													: W extends "collate"
														? QualName<T, Next<I>> extends [
																unknown,
																infer J extends number,
															]
															? ParseColConstraints<T, J, C, F>
															: Expected<"collation name", T, Next<I>>
														: Expected<"column constraint", T, I>
		: Ok<
				{
					name: C["name"];
					type: C["ty"];
					notNull: Extract<F, "nn" | "pk"> extends never ? false : true;
					hasDefault: "hd" extends F ? true : false;
					primaryKey: "pk" extends F ? true : false;
				},
				I
			>;

type ParseBExpr<T extends Toks, I extends number> =
	ParseExpr<T, I, 7> extends infer R
		? R extends Ok<unknown, infer J>
			? T[J] extends OpTok<CompareOp>
				? ParseExpr<T, Next<J>, 7>
				: T[J] extends WordTok<"is">
					? EatWords<T, Next<J>, ["distinct", "from"]> extends never
						? EatWords<T, Next<J>, ["not", "distinct", "from"]> extends never
							? R
							: ParseExpr<T, Nx3<Next<J>>, 7>
						: ParseExpr<T, Nx3<J>, 7>
					: R
			: R
		: never;

type SkipIndexParams<T extends Toks, I extends number> =
	T[I] extends WordTok<"with">
		? T[Next<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>> extends infer J extends number
				? SkipIndexTablespace<T, J>
				: SkipToCloseParen<T, Nx2<I>>
			: SkipIndexTablespace<T, I>
		: SkipIndexTablespace<T, I>;
type SkipIndexTablespace<T extends Toks, I extends number> =
	EatWords<T, I, ["using", "index", "tablespace"]> extends never
		? I
		: Nx2<Nx2<I>>;

type SkipRefActions<T extends Toks, I extends number> =
	T[I] extends WordTok<"match">
		? SkipRefActions<T, Nx2<I>>
		: T[I] extends WordTok<"on">
			? T[Next<I>] extends WordTok<"delete" | "update">
				? T[Nx2<I>] extends WordTok<"no">
					? SkipRefActions<T, Nx2<Nx2<I>>>
					: T[Nx2<I>] extends WordTok<"set">
						? SkipParenOpt<T, Nx2<Nx2<I>>> extends infer J extends number
							? SkipRefActions<T, J>
							: SkipParenOpt<T, Nx2<Nx2<I>>>
						: SkipRefActions<T, Nx3<I>>
				: I
			: I;

type ParseGenerated<T extends Toks, I extends number> =
	EatWords<T, I, ["always", "as", "identity"]> extends never
		? EatWords<T, I, ["by", "default", "as", "identity"]> extends never
			? (
					EatWords<T, I, ["always", "as"]> extends never
						? EatWords<T, I, ["by", "default", "as"]>
						: Nx2<I>
				) extends infer J extends number
				? [J] extends [never]
					? Expected<"ALWAYS or BY DEFAULT", T, I>
					: T[J] extends OpTok<"(">
						? SkipToCloseParen<T, Next<J>> extends infer K extends number
							? [false, SkipWord<T, K, "stored" | "virtual">]
							: SkipToCloseParen<T, Next<J>>
						: Expected<'"(" or IDENTITY', T, J>
				: never
			: IdentityNext<
					SkipParenOpt<T, EatWords<T, I, ["by", "default", "as", "identity"]>>
				>
		: IdentityNext<SkipParenOpt<T, Nx3<I>>>;
type IdentityNext<J> = J extends number ? [true, J] : J;

type ParseCreateView<
	T extends Toks,
	I extends number,
	OrReplace extends boolean,
	Mat extends boolean,
	Ine extends boolean,
	Rec extends boolean = false,
> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends OpTok<"(">
			? ParenIdentList<T, J> extends Ok<
					infer Names extends readonly string[],
					infer J2
				>
				? SkipViewStorage<T, J2, Mat> extends infer J3 extends number
					? ParseViewAs<T, J3, OrReplace, Mat, Ine, RefOf<Parts>, Names, Rec>
					: SkipViewStorage<T, J2, Mat>
				: ParenIdentList<T, J>
			: Rec extends true
				? ParenIdentList<T, J>
				: SkipViewStorage<T, J, Mat> extends infer J2 extends number
					? ParseViewAs<T, J2, OrReplace, Mat, Ine, RefOf<Parts>, null, Rec>
					: SkipViewStorage<T, J, Mat>
		: Expected<"view name", T, I>;

type SkipViewStorage<
	T extends Toks,
	I extends number,
	Mat extends boolean,
> = Mat extends true
	? SkipStorage<T, I, true>
	: T[I] extends WordTok<"with">
		? T[Next<I>] extends OpTok<"(">
			? SkipToCloseParen<T, Nx2<I>>
			: SyntaxErrorAt<T, Next<I>>
		: I;

type ParseViewAs<
	T extends Toks,
	I extends number,
	OrReplace extends boolean,
	Mat extends boolean,
	Ine extends boolean,
	Ref extends TableRef,
	Names extends readonly string[] | null,
	Rec extends boolean,
> =
	EatWord<T, I, "as"> extends never
		? Expected<"AS", T, I>
		: ParseSelectStmt<T, Next<I>> extends Ok<infer Q, infer J>
			? Rec extends true
				? SkipCheckOption<T, J> extends J
					? ViewOk<
							OrReplace,
							Mat,
							Ine,
							Ref,
							Names,
							RecursiveViewQuery<Ref["name"], Names, Q>,
							J
						>
					: Fail<"WITH CHECK OPTION not supported on recursive views", J>
				: ViewOk<
						OrReplace,
						Mat,
						Ine,
						Ref,
						Names,
						Q,
						Mat extends true ? SkipWithData<T, J> : SkipCheckOption<T, J>
					>
			: ParseSelectStmt<T, Next<I>>;
type ViewOk<OrReplace, Mat, Ine, Ref, Names, Q, J extends number> = Ok<
	{
		t: "create_view";
		orReplace: OrReplace;
		materialized: Mat;
		ifNotExists: Ine;
		view: Ref;
		cols: Names;
		q: Q;
	},
	J
>;

type RecursiveViewQuery<N extends string, Names, S> = {
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

type SkipCheckOption<T extends Toks, I extends number> =
	T[I] extends WordTok<"with">
		? CheckOptionEnd<
				EatWords<
					T,
					SkipWord<T, Next<I>, "cascaded" | "local">,
					["check", "option"]
				>,
				I
			>
		: I;
type CheckOptionEnd<J extends number, I extends number> = [J] extends [never]
	? I
	: J;

type ParseCreateType<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? EatWords<T, J, ["as", "enum"]> extends never
			? NoDanglingDot<T, J, Noop<T, J, "create type">>
			: T[Nx2<J>] extends OpTok<"(">
				? ParseEnumValues<T, Nx3<J>> extends Ok<infer Vs, infer J2>
					? Ok<{ t: "create_enum"; name: RefOf<Parts>; values: Vs }, J2>
					: ParseEnumValues<T, Nx3<J>>
				: Expected<'"("', T, Nx2<J>>
		: Expected<"type name", T, I>;

type ParseEnumValues<T extends Toks, I extends number> =
	T[I] extends OpTok<")"> ? Ok<[], Next<I>> : EnumLabels<T, I, []>;
type EnumLabels<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	T[I] extends StrTok<infer V>
		? T[Next<I>] extends OpTok<",">
			? EnumLabels<T, Nx2<I>, [...Acc, V]>
			: T[Next<I>] extends OpTok<")">
				? Ok<[...Acc, V], Nx2<I>>
				: Expected<'"," or ")"', T, Next<I>>
		: Expected<"enum label", T, I>;

type ParseCreateSchema<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer I1 extends number]
		? T[I1] extends WordTok<"authorization">
			? AnyLabel<T, Next<I1>> extends [
					infer Role extends string,
					infer J extends number,
				]
				? SchemaElements<
						T,
						J,
						Ine,
						Role,
						T[Next<I1>] extends WordTok<
							"current_role" | "current_user" | "session_user"
						>
							? false
							: true,
						[],
						[]
					>
				: Expected<"role name", T, Next<I1>>
			: Ident<T, I1> extends [infer Name extends string, infer J extends number]
				? T[J] extends WordTok<"authorization">
					? AnyLabel<T, Next<J>> extends [string, infer J2 extends number]
						? SchemaElements<T, J2, Ine, Name, true, [], []>
						: Expected<"role name", T, Next<J>>
					: SchemaElements<T, J, Ine, Name, true, [], []>
				: Expected<"schema name", T, I1>
		: never;

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
						SkipElement<T, Next<I>, I>,
						Ine,
						S,
						Known,
						Tbls,
						Views
					>
				: SchemaElement<T, Next<I>, S, Known, false, false> extends infer R
					? R extends Ok<infer E, infer J>
						? E extends Tag<"create_table">
							? SchemaElements<T, J, Ine, S, Known, [...Tbls, E], Views>
							: E extends Tag<"create_view">
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
			? EatWord<T, Next<I>, "replace"> extends never
				? Expected<"REPLACE", T, Next<I>>
				: SchemaElement<T, Nx2<I>, S, Known, true, Temp>
			: W extends "temp" | "temporary" | "local" | "global" | "unlogged"
				? SchemaElement<
						T,
						Next<I>,
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
										? ParseCreateTable<T, Next<I>>
										: W extends "view"
											? ParseCreateView<T, Next<I>, OrR, false, false>
											: EatWord<T, Next<I>, "view"> extends never
												? Expected<"VIEW", T, Next<I>>
												: ParseCreateView<T, Nx2<I>, OrR, false, false, true>
								) extends infer R
							? R extends Ok<infer E, infer J>
								? E extends Tag<"create_table_as">
									? SyntaxErrorAt<T, I>
									: E extends {
												readonly t: "create_table";
												readonly table: infer Ref extends TableRef;
											}
										? InSchema<
												J,
												S,
												Known,
												Ref,
												Requalify<E, S>,
												IfNotExists<T, Next<I>>[1]
											>
										: E extends {
													readonly t: "create_view";
													readonly view: infer Ref extends TableRef;
												}
											? InSchema<
													J,
													S,
													Known,
													Ref,
													Requalify<E, S>,
													W extends "view" ? Next<I> : Nx2<I>
												>
											: R
								: R
							: never
					: W extends "sequence"
						? QualName<T, IfNotExists<T, Next<I>>[1]> extends [
								infer P extends readonly string[],
								infer J extends number,
							]
							? NoDanglingDot<
									T,
									J,
									InSchema<
										SkipElement<T, Next<I>, I>,
										S,
										Known,
										RefOf<P>,
										null,
										IfNotExists<T, Next<I>>[1]
									>
								>
							: Expected<"sequence name", T, Next<I>>
						: W extends "index" | "unique" | "trigger" | "constraint"
							? SkipElement<T, Next<I>, I> extends infer J extends number
								? ElementOn<T, Next<I>, J> extends infer K extends number
									? QualName<T, SkipWord<T, K, "only">> extends [
											infer P extends readonly string[],
											infer K2 extends number,
										]
										? NoDanglingDot<
												T,
												K2,
												InSchema<
													J,
													S,
													Known,
													RefOf<P>,
													null,
													SkipWord<T, K, "only">
												>
											>
										: SyntaxErrorAt<T, SkipWord<T, K, "only">>
									: ElementOn<T, Next<I>, J>
								: never
							: Expected<"TABLE, VIEW, INDEX, SEQUENCE or TRIGGER", T, I>
		: Expected<"TABLE, VIEW, INDEX, SEQUENCE or TRIGGER", T, I>;

type Requalify<E, S extends string> = {
	[K in keyof E]: K extends "table" | "view"
		? E[K] extends { readonly name: infer N }
			? { schema: S; name: N }
			: E[K]
		: E[K];
};

type NoDanglingDot<T extends Toks, J extends number, Then> =
	T[J] extends OpTok<"."> ? SyntaxErrorAt<T, Next<J>> : Then;

type InSchema<
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

type ElementOn<
	T extends Toks,
	I extends number,
	End extends number,
> = I extends End
	? SyntaxErrorAt<T, I>
	: T[I] extends WordTok<"on">
		? Next<I>
		: T[I] extends OpTok<"(">
			? SyntaxErrorAt<T, I>
			: ElementOn<T, Next<I>, End>;

type SkipElement<T extends Toks, I extends number, P extends number> =
	T[I] extends OpTok<";">
		? I
		: T[I] extends WordTok<"create">
			? T[P] extends WordTok<"grant"> | OpTok<",">
				? SkipElement<T, Next<I>, I>
				: I
			: T[I] extends Tok
				? SkipElement<T, Next<I>, I>
				: I;

type NoopAlterObject =
	| NoopObject
	| "function"
	| "procedure"
	| "routine"
	| "default"
	| "system"
	| "large";

type ParseAlter<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "table" | "view"
			? ParseAlterTable<T, Next<I>>
			: W extends "materialized"
				? EatWord<T, Next<I>, "view"> extends never
					? Expected<"VIEW", T, Next<I>>
					: ParseAlterTable<T, Nx2<I>>
				: W extends "type"
					? ParseAlterType<T, Next<I>>
					: W extends "schema"
						? ParseAlterSchema<T, Next<I>>
						: W extends NoopAlterObject
							? Noop<T, I, `alter ${W}`>
							: Expected<"TABLE, VIEW, TYPE, SCHEMA, ... after ALTER", T, I>
		: Expected<"object type after ALTER", T, I>;

type ParseAlterSchema<T extends Toks, I extends number> =
	Ident<T, I> extends [infer From, infer J extends number]
		? EatWords<T, J, ["rename", "to"]> extends never
			? Noop<T, J, "alter schema">
			: Ident<T, Nx2<J>> extends [infer To, infer J2 extends number]
				? Ok<{ t: "rename_schema"; from: From; to: To }, J2>
				: Expected<"new schema name", T, Nx2<J>>
		: Expected<"schema name", T, I>;

type ParseAlterTable<T extends Toks, I extends number> =
	T[I] extends WordTok<"all">
		? EatWords<T, Next<I>, ["in", "tablespace"]> extends never
			? Expected<"IN TABLESPACE", T, Next<I>>
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
							: Next<J>
					) extends infer J1 extends number
					? IsStandalone<T, J1> extends true
						? (
								T[J1] extends WordTok<"rename">
									? ParseAlterRename<T, Next<J1>>
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
	T[I] extends WordTok<"rename">
		? true
		: T[I] extends WordTok<"set">
			? T[Next<I>] extends WordTok<"schema">
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
		: ParseAlterAction<T, I, Ref["name"]> extends Ok<
					infer A extends AlterAction,
					infer J
				>
			? T[J] extends OpTok<",">
				? ParseAlterActions<T, Next<J>, Ref, Ife, [...Acc, A]>
				: Ok<
						{
							t: "alter_table";
							ifExists: Ife;
							table: Ref;
							actions: [...Acc, A];
						},
						J
					>
			: ParseAlterAction<T, I, Ref["name"]>;

type NoopAction<T extends Toks, I extends number> = Ok<
	{ t: "noop" },
	SkipToActionEnd<T, I>
>;

type ParseAlterAction<T extends Toks, I extends number, TN extends string> =
	T[I] extends WordTok<infer W>
		? W extends "add"
			? ParseAlterAdd<T, Next<I>, TN>
			: W extends "drop"
				? ParseAlterDrop<T, Next<I>>
				: W extends "alter"
					? ParseAlterColumn<T, Next<I>>
					: W extends "set"
						? T[Next<I>] extends WordTok<"with">
							? SyntaxErrorAt<T, Next<I>>
							: NoopAction<T, I>
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

type ParseAlterAdd<T extends Toks, I extends number, TN extends string> =
	T[I] extends WordTok<"constraint">
		? Ident<T, Next<I>> extends [string, infer J extends number]
			? ParseAddConstraintBody<T, J>
			: Expected<"constraint name", T, Next<I>>
		: T[I] extends WordTok<"primary" | "not">
			? ParseAddConstraintBody<T, I>
			: T[I] extends WordTok<"unique" | "check" | "foreign" | "exclude">
				? NoopAction<T, I>
				: IfNotExists<T, SkipWord<T, I, "column">> extends [
							infer Ine,
							infer I1 extends number,
						]
					? ParseColumnDef<T, I1, TN> extends Ok<infer C, infer J>
						? Ok<{ t: "add_column"; ifNotExists: Ine; col: C }, J>
						: ParseColumnDef<T, I1, TN>
					: never;

type ParseAddConstraintBody<T extends Toks, I extends number> =
	T[I] extends WordTok<"not">
		? ParseNotNullConstraint<T, Next<I>> extends Ok<infer C, infer J>
			? Ok<
					C extends { readonly col: infer N }
						? { t: "set_not_null"; name: N }
						: { t: "noop" },
					J
				>
			: ParseNotNullConstraint<T, Next<I>>
		: T[I] extends WordTok<"primary">
			? EatWord<T, Next<I>, "key"> extends never
				? Expected<"KEY", T, Next<I>>
				: T[Nx2<I>] extends OpTok<"(">
					? KeyColumns<T, Nx3<I>, []> extends Ok<infer Cols, infer J>
						? Ok<{ t: "add_pk"; cols: Cols }, SkipToActionEnd<T, J>>
						: KeyColumns<T, Nx3<I>, []>
					: NoopAction<T, I>
			: NoopAction<T, I>;

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

type ParseAlterRename<T extends Toks, I extends number> =
	T[I] extends WordTok<"to">
		? Ident<T, Next<I>> extends [infer To, infer J extends number]
			? Ok<{ t: "rename_table"; to: To }, J>
			: Expected<"new name", T, Next<I>>
		: T[I] extends WordTok<"constraint">
			? Ident<T, Next<I>> extends [string, infer J extends number]
				? EatWord<T, J, "to"> extends never
					? Expected<"TO", T, J>
					: Ident<T, Next<J>> extends [string, infer J2 extends number]
						? Ok<{ t: "noop" }, J2>
						: Expected<"new constraint name", T, Next<J>>
				: Expected<"constraint name", T, Next<I>>
			: Ident<T, SkipWord<T, I, "column">> extends [
						infer From,
						infer J extends number,
					]
				? EatWord<T, J, "to"> extends never
					? Expected<"TO", T, J>
					: Ident<T, Next<J>> extends [infer To, infer J2 extends number]
						? Ok<{ t: "rename_column"; from: From; to: To }, J2>
						: Expected<"new column name", T, Next<J>>
				: Expected<"column name", T, SkipWord<T, I, "column">>;

type ParseAlterColumn<T extends Toks, I extends number> =
	T[I] extends WordTok<"constraint">
		? NoopAction<T, I>
		: Ident<T, SkipWord<T, I, "column">> extends [
					infer C extends string,
					infer J extends number,
				]
			? T[J] extends WordTok<infer W>
				? W extends "type"
					? ParseAlterColType<T, Next<J>, C>
					: W extends "set"
						? T[Next<J>] extends WordTok<"data">
							? EatWord<T, Nx2<J>, "type"> extends never
								? Expected<"TYPE", T, Nx2<J>>
								: ParseAlterColType<T, Nx3<J>, C>
							: T[Next<J>] extends WordTok<"not">
								? EatWord<T, Nx2<J>, "null"> extends never
									? Expected<"NULL", T, Nx2<J>>
									: Ok<{ t: "set_not_null"; name: C }, Nx3<J>>
								: T[Next<J>] extends WordTok<"default">
									? ParseExpr<T, Nx2<J>, 0> extends Ok<unknown, infer J2>
										? Ok<{ t: "set_default"; name: C }, J2>
										: ParseExpr<T, Nx2<J>, 0>
									: NoopAction<T, J>
						: W extends "drop"
							? T[Next<J>] extends WordTok<"not">
								? EatWord<T, Nx2<J>, "null"> extends never
									? Expected<"NULL", T, Nx2<J>>
									: Ok<{ t: "drop_not_null"; name: C }, Nx3<J>>
								: T[Next<J>] extends WordTok<"default">
									? Ok<{ t: "drop_default"; name: C }, Nx2<J>>
									: T[Next<J>] extends WordTok<"identity" | "expression">
										? Ok<
												{ t: "drop_default"; name: C },
												SkipWords<T, Nx2<J>, ["if", "exists"]>
											>
										: Expected<
												"NOT NULL, DEFAULT, IDENTITY or EXPRESSION",
												T,
												Next<J>
											>
							: W extends "add"
								? EatWord<T, Next<J>, "generated"> extends never
									? Expected<"GENERATED", T, Next<J>>
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

type ParseAlterColType<T extends Toks, I extends number, C extends string> =
	ParseTypeName<T, I> extends Ok<infer Ty, infer J>
		? SkipCollate<T, J> extends infer J2 extends number
			? EatWord<T, J2, "using"> extends never
				? Ok<{ t: "alter_type"; name: C; type: Ty }, J2>
				: ParseExpr<T, Next<J2>, 0> extends Ok<unknown, infer J3>
					? Ok<{ t: "alter_type"; name: C; type: Ty }, J3>
					: ParseExpr<T, Next<J2>, 0>
			: never
		: ParseTypeName<T, I>;
type SkipCollate<T extends Toks, I extends number> =
	T[I] extends WordTok<"collate">
		? QualName<T, Next<I>> extends [unknown, infer J]
			? J
			: Next<I>
		: I;

type ParseAlterType<T extends Toks, I extends number> =
	QualName<T, I> extends [
		infer Parts extends readonly string[],
		infer J extends number,
	]
		? T[J] extends WordTok<"add">
			? EatWord<T, Next<J>, "value"> extends never
				? Ok<
						{ t: "alter_enum"; name: RefOf<Parts>; action: { t: "noop" } },
						SkipToStmtEnd<T, J>
					>
				: IfNotExists<T, Nx2<J>> extends [infer Ine, infer I1 extends number]
					? T[I1] extends StrTok<infer V>
						? Ok<
								{
									t: "alter_enum";
									name: RefOf<Parts>;
									action: { t: "add_value"; value: V; ifNotExists: Ine };
								},
								SkipBeforeAfter<T, Next<I1>>
							>
						: Expected<"enum label", T, I1>
					: never
			: T[J] extends WordTok<"rename">
				? T[Next<J>] extends WordTok<"value">
					? T[Nx2<J>] extends StrTok<infer From>
						? EatWord<T, Nx3<J>, "to"> extends never
							? Expected<"TO", T, Nx3<J>>
							: T[Nx2<Nx2<J>>] extends StrTok<infer To>
								? Ok<
										{
											t: "alter_enum";
											name: RefOf<Parts>;
											action: { t: "rename_value"; from: From; to: To };
										},
										Nx2<Nx3<J>>
									>
								: Expected<"enum label", T, Nx2<Nx2<J>>>
						: Expected<"enum label", T, Nx2<J>>
					: T[Next<J>] extends WordTok<"to">
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
							>
				: T[J] extends WordTok<"owner" | "set" | "drop" | "alter">
					? Ok<
							{ t: "alter_enum"; name: RefOf<Parts>; action: { t: "noop" } },
							SkipToStmtEnd<T, J>
						>
					: Expected<"ALTER TYPE action", T, J>
		: Expected<"type name", T, I>;
type SkipBeforeAfter<T extends Toks, I extends number> =
	T[I] extends WordTok<"before" | "after">
		? T[Next<I>] extends StrTok
			? Nx2<I>
			: I
		: I;

type NoopDropObject =
	| NoopObject
	| "function"
	| "procedure"
	| "routine"
	| "cast"
	| "access"
	| "transform"
	| "owned";

type ParseDrop<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "table"
			? ParseDropList<T, Next<I>, "drop_table">
			: W extends "view"
				? ParseDropList<T, Next<I>, "drop_view">
				: W extends "materialized"
					? EatWord<T, Next<I>, "view"> extends never
						? Expected<"VIEW", T, Next<I>>
						: ParseDropList<T, Nx2<I>, "drop_matview">
					: W extends "type"
						? ParseDropList<T, Next<I>, "drop_type">
						: W extends "schema"
							? ParseDropList<T, Next<I>, "drop_schema">
							: W extends NoopDropObject
								? Noop<T, I, `drop ${W}`>
								: Expected<
										"TABLE, VIEW, TYPE, SCHEMA, INDEX, ... after DROP",
										T,
										I
									>
		: Expected<"object type after DROP", T, I>;

type ParseDropList<T extends Toks, I extends number, K extends string> =
	IfExists<T, I> extends [infer Ife extends boolean, infer I1 extends number]
		? ParseNameList<T, I1, []> extends Ok<
				infer Names extends readonly TableRef[],
				infer J
			>
			? Cascade<T, J> extends [infer C extends boolean, infer J2 extends number]
				? Ok<DropNode<K, Ife, Names, C>, J2>
				: never
			: ParseNameList<T, I1, []>
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
