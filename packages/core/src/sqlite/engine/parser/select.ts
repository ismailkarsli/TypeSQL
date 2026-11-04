import type { SqlError } from "../../../errors.js";
import type {
	Cte,
	Expr,
	FromItem,
	NamedWindow,
	SelectBody,
	SelectStmt,
	TableRef,
	Target,
	WindowSpec,
	WithClause,
} from "../ast.js";
import type {
	OptBy,
	OptWhere,
	ParenArgs,
	ParseExpr,
	ParseExprList,
	ParseWindowSpec,
} from "./expr.js";
import type { Reserved } from "./keywords.js";
import type {
	AliasAt,
	BareAlias,
	CloseOk,
	Expect,
	Ident,
	IdentList,
	IsOp,
	IsWord,
	Name,
	NamesV,
	Nx,
	Ok,
	OptCols,
	SkipIndexed,
	SpanText,
	SyntaxErr,
	TableAlias,
	TableRefAt,
	Toks,
} from "./util.js";

export type ParseSubquery<T extends Toks, I extends number> =
	IsWord<T, I, "with"> extends true
		? ParseWith<T, Nx<I>> extends Ok<
				infer Wc extends WithClause,
				infer J extends number
			>
			? ParseSelectAfterWith<T, J, Wc>
			: ParseWith<T, Nx<I>>
		: ParseSelectAfterWith<T, I, null>;

export type ParseWith<T extends Toks, I extends number> =
	IsWord<T, I, "recursive"> extends true
		? CteLoop<T, Nx<I>, true, []>
		: CteLoop<T, I, false, []>;

type CteLoop<
	T extends Toks,
	I extends number,
	Rec extends boolean,
	Acc extends readonly Cte[],
> =
	Ident<T, I> extends infer N extends Name
		? OptCols<T, Nx<I>> extends Ok<infer Cols, infer J extends number>
			? IsWord<T, J, "as"> extends true
				? CteOpen<T, Nx<J>> extends infer J1 extends number
					? ParenSubquery<T, J1> extends Ok<
							infer S extends SelectStmt,
							infer J2 extends number
						>
						? [
								...Acc,
								{
									name: N["v"];
									display: N["n"];
									cols: Cols extends readonly Name[] ? Cols : null;
									q: S;
								},
							] extends infer Acc2 extends readonly Cte[]
							? IsOp<T, J2, ","> extends true
								? CteLoop<T, Nx<J2>, Rec, Acc2>
								: Ok<{ recursive: Rec; ctes: Acc2 }, J2>
							: never
						: ParenSubquery<T, J1>
					: CteOpen<T, Nx<J>>
				: SyntaxErr<T, J>
			: OptCols<T, Nx<I>>
		: SyntaxErr<T, I>;
type CteOpen<T extends Toks, I extends number> =
	IsWord<T, I, "materialized"> extends true
		? Expect<T, Nx<I>, "(">
		: IsWord<T, I, "not"> extends true
			? IsWord<T, Nx<I>, "materialized"> extends true
				? Expect<T, Nx<Nx<I>>, "(">
				: SyntaxErr<T, Nx<I>>
			: Expect<T, I, "(">;

export type ParenSubquery<T extends Toks, I extends number> =
	ParseSubquery<T, I> extends Ok<
		infer Q extends SelectStmt,
		infer J extends number
	>
		? CloseOk<T, J, Q>
		: ParseSubquery<T, I>;

export type ParseSelectAfterWith<T extends Toks, I extends number, W> =
	ParseCompound<T, I> extends Ok<
		infer Body extends SelectBody,
		infer J extends number
	>
		? ParseTail<T, J, W, Body> extends Ok<
				infer S extends SelectStmt,
				infer J2 extends number
			>
			? T[J2] extends {
					readonly k: "w";
					readonly v: infer Op extends "union" | "intersect" | "except";
				}
				? SqlError<
						`${S["orderBy"] extends readonly [] ? "LIMIT" : "ORDER BY"} clause should come after ${Uppercase<Op>}${IsWord<T, Nx<J2>, "all"> extends true ? " ALL" : ""} not before`,
						J2
					>
				: ParseTail<T, J, W, Body>
			: ParseTail<T, J, W, Body>
		: ParseCompound<T, I>;

type ParseTail<T extends Toks, I extends number, W, Body> =
	OptBy<T, I, "order"> extends Ok<
		infer Ord extends readonly Expr[],
		infer J extends number
	>
		? IsWord<T, J, "limit"> extends true
			? ParseExpr<T, Nx<J>> extends Ok<
					infer Lim extends Expr,
					infer J2 extends number
				>
				? IsWord<T, J2, "offset"> extends true
					? ParseExpr<T, Nx<J2>> extends Ok<
							infer Off extends Expr,
							infer J3 extends number
						>
						? Ok<MkSelect<W, Body, Ord, Lim, Off>, J3>
						: ParseExpr<T, Nx<J2>>
					: IsOp<T, J2, ","> extends true
						? ParseExpr<T, Nx<J2>> extends Ok<
								infer Cnt extends Expr,
								infer J3 extends number
							>
							? Ok<MkSelect<W, Body, Ord, Cnt, Lim>, J3>
							: ParseExpr<T, Nx<J2>>
						: Ok<MkSelect<W, Body, Ord, Lim, null>, J2>
				: ParseExpr<T, Nx<J>>
			: Ok<MkSelect<W, Body, Ord, null, null>, J>
		: OptBy<T, I, "order">;
type MkSelect<W, Body, Ord, Lim, Off> = {
	t: "select";
	with: W;
	body: Body;
	orderBy: Ord;
	limit: Lim;
	offset: Off;
};

type ParseCompound<T extends Toks, I extends number> =
	ParseCore<T, I> extends Ok<
		infer Core extends SelectBody,
		infer J extends number
	>
		? CompoundLoop<T, J, Core>
		: ParseCore<T, I>;
type CompoundLoop<
	T extends Toks,
	I extends number,
	L extends SelectBody,
> = T[I] extends {
	readonly k: "w";
	readonly v: infer Op extends "union" | "intersect" | "except";
}
	? (
			Op extends "union"
				? IsWord<T, Nx<I>, "all"> extends true
					? [true, Nx<Nx<I>>]
					: [false, Nx<I>]
				: [false, Nx<I>]
		) extends [infer All extends boolean, infer J extends number]
		? ParseCore<T, J> extends Ok<
				infer R extends SelectBody,
				infer J2 extends number
			>
			? CompoundLoop<T, J2, { t: "setop"; op: Op; all: All; l: L; r: R }>
			: ParseCore<T, J>
		: never
	: Ok<L, I>;

type ParseCore<T extends Toks, I extends number> =
	IsWord<T, I, "select"> extends true
		? ParseSimple<T, Nx<I>>
		: IsWord<T, I, "values"> extends true
			? ParseValues<T, Nx<I>, []>
			: SyntaxErr<T, I>;

export type ParseValues<
	T extends Toks,
	I extends number,
	Acc extends readonly (readonly Expr[])[],
> =
	Expect<T, I, "("> extends infer J extends number
		? ParseExprList<T, J, []> extends Ok<
				infer Row extends readonly Expr[],
				infer J2 extends number
			>
			? Expect<T, J2, ")"> extends infer J3 extends number
				? IsOp<T, J3, ","> extends true
					? ParseValues<T, Nx<J3>, [...Acc, Row]>
					: Acc extends readonly []
						? Ok<{ t: "values"; rows: [Row] }, J3>
						: Row["length"] extends Acc[0]["length"]
							? Ok<{ t: "values"; rows: [...Acc, Row] }, J3>
							: SqlError<"all VALUES must have the same number of terms", J3>
				: Expect<T, J2, ")">
			: ParseExprList<T, J, []>
		: Expect<T, I, "(">;

type ParseSimple<T extends Toks, I extends number> = (
	IsWord<T, I, "distinct"> extends true
		? [true, Nx<I>]
		: IsWord<T, I, "all"> extends true
			? [false, Nx<I>]
			: [false, I]
) extends [infer D extends boolean, infer J extends number]
	? ParseTargets<T, J, []> extends Ok<
			infer Targets extends readonly Target[],
			infer J2 extends number
		>
		? OptFrom<T, J2> extends Ok<infer From, infer J3 extends number>
			? OptWhere<T, J3> extends Ok<infer Where, infer J4 extends number>
				? ParseGroup<T, J4> extends Ok<
						[infer Group, infer Having],
						infer J5 extends number
					>
					? ParseWindows<T, J5> extends Ok<infer Wins, infer J6 extends number>
						? Ok<
								{
									t: "simple";
									distinct: D;
									targets: Targets;
									from: From;
									where: Where;
									groupBy: Group;
									having: Having;
									windows: Wins;
								},
								J6
							>
						: ParseWindows<T, J5>
					: ParseGroup<T, J4>
				: OptWhere<T, J3>
			: OptFrom<T, J2>
		: ParseTargets<T, J, []>
	: never;

export type OptFrom<T extends Toks, I extends number> =
	IsWord<T, I, "from"> extends true ? ParseFrom<T, Nx<I>> : Ok<null, I>;

type ParseGroup<T extends Toks, I extends number> =
	IsWord<T, I, "having"> extends true
		? OptHaving<T, I> extends Ok<infer Having, infer J extends number>
			? OptBy<T, J, "group", null> extends Ok<
					infer Group,
					infer J2 extends number
				>
				? Ok<[Group, Having], J2>
				: OptBy<T, J, "group", null>
			: OptHaving<T, I>
		: OptBy<T, I, "group", null> extends Ok<infer Group, infer J extends number>
			? OptHaving<T, J> extends Ok<infer Having, infer J2 extends number>
				? Ok<[Group, Having], J2>
				: OptHaving<T, J>
			: OptBy<T, I, "group", null>;
type OptHaving<T extends Toks, I extends number> =
	IsWord<T, I, "having"> extends true ? ParseExpr<T, Nx<I>> : Ok<null, I>;

type ParseWindows<T extends Toks, I extends number> =
	IsWord<T, I, "window"> extends true
		? Ident<T, Nx<I>> extends Name
			? IsWord<T, Nx<Nx<I>>, "as"> extends true
				? WindowLoop<T, Nx<I>, []>
				: Ok<[], I>
			: Ok<[], I>
		: Ok<[], I>;
type WindowLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly NamedWindow[],
> =
	Ident<T, I> extends infer N extends Name
		? IsWord<T, Nx<I>, "as"> extends true
			? Expect<T, Nx<Nx<I>>, "("> extends infer J extends number
				? ParseWindowSpec<T, J> extends Ok<
						infer Spec extends WindowSpec,
						infer J2 extends number
					>
					? IsOp<T, J2, ","> extends true
						? WindowLoop<T, Nx<J2>, [...Acc, { name: N["v"]; spec: Spec }]>
						: Ok<[...Acc, { name: N["v"]; spec: Spec }], J2>
					: ParseWindowSpec<T, J>
				: Expect<T, Nx<Nx<I>>, "(">
			: SyntaxErr<T, Nx<I>>
		: SyntaxErr<T, I>;

export type ParseTargets<
	T extends Toks,
	I extends number,
	Acc extends readonly Target[],
> =
	ParseTarget<T, I> extends Ok<infer Tg extends Target, infer J extends number>
		? IsOp<T, J, ","> extends true
			? ParseTargets<T, Nx<J>, [...Acc, Tg]>
			: Ok<[...Acc, Tg], J>
		: ParseTarget<T, I>;

type ParseTarget<T extends Toks, I extends number> =
	IsOp<T, I, "*"> extends true
		? Ok<{ t: "star"; tbl: null }, Nx<I>>
		: IsOp<T, Nx<I>, "."> extends true
			? IsOp<T, Nx<Nx<I>>, "*"> extends true
				? Ident<T, I> extends infer N extends Name
					? Ok<{ t: "star"; tbl: N["v"] }, Nx<Nx<Nx<I>>>>
					: SyntaxErr<T, I>
				: ParseExprTarget<T, I>
			: ParseExprTarget<T, I>;

type ParseExprTarget<T extends Toks, I extends number> =
	ParseExpr<T, I> extends Ok<infer E extends Expr, infer J extends number>
		? IsWord<T, J, "as"> extends true
			? AliasAt<T, Nx<J>, Reserved> extends infer A extends Name
				? Ok<{ t: "expr"; e: E; alias: A["n"]; span: "" }, Nx<Nx<J>>>
				: SyntaxErr<T, Nx<J>>
			: BareAlias<T, J> extends infer A extends Name
				? Ok<{ t: "expr"; e: E; alias: A["n"]; span: "" }, Nx<J>>
				: Ok<
						{
							t: "expr";
							e: E;
							alias: null;
							span: E extends { readonly t: "col" } ? "" : SpanText<T, I, J>;
						},
						J
					>
		: ParseExpr<T, I>;

type ParseFrom<T extends Toks, I extends number> =
	ParseTableOrSub<T, I> extends Ok<
		infer F extends FromItem,
		infer J extends number
	>
		? JoinLoop<T, J, F>
		: ParseTableOrSub<T, I>;

type JoinOp<T extends Toks, I extends number> =
	IsOp<T, I, ","> extends true
		? ["cross", false, Nx<I>]
		: (
					IsWord<T, I, "natural"> extends true
						? [true, Nx<I>]
						: [false, I]
				) extends [infer Nat extends boolean, infer J extends number]
			? IsWord<T, J, "join"> extends true
				? ["inner", Nat, Nx<J>]
				: T[J] extends {
							readonly k: "w";
							readonly v: infer K extends "left" | "right" | "full";
						}
					? (
							IsWord<T, Nx<J>, "outer"> extends true
								? Nx<Nx<J>>
								: Nx<J>
						) extends infer J2 extends number
						? IsWord<T, J2, "join"> extends true
							? [K, Nat, Nx<J2>]
							: SyntaxErr<T, J2>
						: never
					: T[J] extends {
								readonly k: "w";
								readonly v: infer K extends "inner" | "cross";
							}
						? IsWord<T, Nx<J>, "join"> extends true
							? [K extends "cross" ? "cross" : "inner", Nat, Nx<Nx<J>>]
							: SyntaxErr<T, Nx<J>>
						: Nat extends true
							? SyntaxErr<T, J>
							: null
			: never;

type JoinLoop<T extends Toks, I extends number, L> =
	JoinOp<T, I> extends infer Op
		? Op extends [infer Kind, infer Nat extends boolean, infer J extends number]
			? ParseTableOrSub<T, J> extends Ok<
					infer Rt extends FromItem,
					infer J2 extends number
				>
				? ParseJoinConstraint<T, J2> extends Ok<
						[infer On, infer Using],
						infer J3 extends number
					>
					? JoinLoop<
							T,
							J3,
							{
								t: "join";
								kind: Kind;
								l: L;
								r: Rt;
								on: On;
								using: Using;
								natural: Nat;
							}
						>
					: ParseJoinConstraint<T, J2>
				: ParseTableOrSub<T, J>
			: Op extends null
				? Ok<L, I>
				: Op
		: never;

type ParseJoinConstraint<T extends Toks, I extends number> =
	IsWord<T, I, "on"> extends true
		? ParseExpr<T, Nx<I>> extends Ok<
				infer E extends Expr,
				infer J extends number
			>
			? Ok<[E, null], J>
			: ParseExpr<T, Nx<I>>
		: IsWord<T, I, "using"> extends true
			? IdentList<T, Nx<I>> extends Ok<
					infer Cols extends readonly Name[],
					infer J extends number
				>
				? Ok<[null, NamesV<Cols>], J>
				: IdentList<T, Nx<I>>
			: Ok<[null, null], I>;

type ParseTableOrSub<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? IsWord<T, Nx<I>, "select" | "with" | "values"> extends true
			? ParenSubquery<T, Nx<I>> extends Ok<
					infer Q extends SelectStmt,
					infer J extends number
				>
				? WithAlias<T, J, { t: "sub"; q: Q }>
				: ParenSubquery<T, Nx<I>>
			: ParseFrom<T, Nx<I>> extends Ok<
						infer F extends FromItem,
						infer J extends number
					>
				? Expect<T, J, ")"> extends infer J2 extends number
					? F extends {
							readonly t: "table" | "func" | "sub";
							readonly alias: null;
						}
						? WithAlias<T, J2, F>
						: Ok<F, J2>
					: Expect<T, J, ")">
				: ParseFrom<T, Nx<I>>
		: TableRefAt<T, I> extends Ok<
					infer R extends TableRef,
					infer J extends number
				>
			? TableTail<T, J, R>
			: TableRefAt<T, I>;

type TableTail<T extends Toks, I extends number, R extends TableRef> =
	IsOp<T, I, "("> extends true
		? ParenArgs<T, Nx<I>> extends Ok<
				infer Args extends readonly Expr[],
				infer J extends number
			>
			? WithAlias<T, J, { t: "func"; name: R["name"]; args: Args }>
			: ParenArgs<T, Nx<I>>
		: WithAlias<T, I, { t: "table"; ref: R }> extends Ok<
					infer F,
					infer J extends number
				>
			? SkipIndexed<T, J> extends infer J2 extends number
				? Ok<F, J2>
				: SkipIndexed<T, J>
			: WithAlias<T, I, { t: "table"; ref: R }>;

type AliasOf<T extends Toks, I extends number> =
	IsWord<T, I, "as"> extends true
		? AliasAt<T, Nx<I>, Reserved> extends infer A extends Name
			? [A["v"], Nx<Nx<I>>]
			: SyntaxErr<T, Nx<I>>
		: TableAlias<T, I> extends infer A extends Name
			? IsWindowClause<T, I> extends true
				? [null, I]
				: [A["v"], Nx<I>]
			: [null, I];

type WithAlias<T extends Toks, I extends number, F> =
	AliasOf<T, I> extends [infer A, infer J extends number]
		? Ok<Aliased<F, A>, J>
		: AliasOf<T, I>;
type Aliased<F, A> = F extends { readonly t: "sub"; readonly q: infer Q }
	? { t: "sub"; q: Q; alias: A }
	: F extends {
				readonly t: "func";
				readonly name: infer N;
				readonly args: infer Args;
			}
		? { t: "func"; name: N; args: Args; alias: A }
		: F extends { readonly t: "table"; readonly ref: infer R }
			? { t: "table"; ref: R; alias: A }
			: F;

type IsWindowClause<T extends Toks, I extends number> =
	IsWord<T, I, "window"> extends true
		? Ident<T, Nx<I>> extends Name
			? IsWord<T, Nx<Nx<I>>, "as">
			: false
		: false;
