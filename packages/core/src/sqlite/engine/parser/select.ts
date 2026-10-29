import type { SqlError } from "../../../errors.js";
import type {
	Cte,
	Expr,
	FromItem,
	NamedWindow,
	SelectBody,
	SelectStmt,
	Target,
	WindowSpec,
	WithClause,
} from "../ast.js";
import type {
	ParseExpr,
	ParseExprList,
	ParseOrderList,
	ParseWindowSpec,
} from "./expr.js";
import type { Reserved } from "./keywords.js";
import type {
	AliasAt,
	BareAlias,
	Expect,
	Ident,
	IdentList,
	IsOp,
	IsWord,
	Name,
	Nx,
	Ok,
	SpanText,
	SyntaxErr,
	TableAlias,
	Toks,
} from "./util.js";

export type ParseSubquery<T extends Toks, I extends number> =
	IsWord<T, I, "with"> extends true
		? ParseWith<T, Nx<I>> extends infer W
			? W extends Ok<infer Wc extends WithClause, infer J extends number>
				? ParseSelectAfterWith<T, J, Wc>
				: W
			: never
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
		? (
				IsOp<T, Nx<I>, "("> extends true
					? IdentList<T, Nx<I>>
					: Ok<null, Nx<I>>
			) extends infer C
			? C extends Ok<infer Cols, infer J extends number>
				? IsWord<T, J, "as"> extends true
					? (
							IsWord<T, Nx<J>, "materialized"> extends true
								? Nx<Nx<J>>
								: IsWord<T, Nx<J>, "not"> extends true
									? IsWord<T, Nx<Nx<J>>, "materialized"> extends true
										? Nx<Nx<Nx<J>>>
										: SyntaxErr<T, Nx<Nx<J>>>
									: Nx<J>
						) extends infer J1
						? J1 extends number
							? Expect<T, J1, "("> extends infer J2
								? J2 extends number
									? ParseSubquery<T, J2> extends infer Q
										? Q extends Ok<
												infer S extends SelectStmt,
												infer J3 extends number
											>
											? Expect<T, J3, ")"> extends infer J4
												? J4 extends number
													? [
															...Acc,
															{
																name: N["v"];
																display: N["n"];
																cols: Cols extends readonly Name[]
																	? Cols
																	: null;
																q: S;
															},
														] extends infer Acc2 extends readonly Cte[]
														? IsOp<T, J4, ","> extends true
															? CteLoop<T, Nx<J4>, Rec, Acc2>
															: Ok<{ recursive: Rec; ctes: Acc2 }, J4>
														: never
													: J4
												: never
											: Q
										: never
									: J2
								: never
							: J1
						: never
					: SyntaxErr<T, J>
				: C
			: never
		: SyntaxErr<T, I>;

export type ParseSelectAfterWith<T extends Toks, I extends number, W> =
	ParseCompound<T, I> extends infer B
		? B extends Ok<infer Body extends SelectBody, infer J extends number>
			? ParseTail<T, J, W, Body> extends infer R
				? R extends Ok<infer S extends SelectStmt, infer J2 extends number>
					? T[J2] extends {
							readonly k: "w";
							readonly v: infer Op extends "union" | "intersect" | "except";
						}
						? SqlError<
								`${S["orderBy"] extends readonly [] ? "LIMIT" : "ORDER BY"} clause should come after ${Uppercase<Op>}${IsWord<T, Nx<J2>, "all"> extends true ? " ALL" : ""} not before`,
								J2
							>
						: R
					: R
				: never
			: B
		: never;

type ParseTail<T extends Toks, I extends number, W, Body> = (
	IsWord<T, I, "order"> extends true
		? IsWord<T, Nx<I>, "by"> extends true
			? ParseOrderList<T, Nx<Nx<I>>, []>
			: SyntaxErr<T, Nx<I>>
		: Ok<[], I>
) extends infer O
	? O extends Ok<infer Ord extends readonly Expr[], infer J extends number>
		? IsWord<T, J, "limit"> extends true
			? ParseExpr<T, Nx<J>> extends infer L
				? L extends Ok<infer Lim extends Expr, infer J2 extends number>
					? IsWord<T, J2, "offset"> extends true
						? ParseExpr<T, Nx<J2>> extends infer Of
							? Of extends Ok<infer Off extends Expr, infer J3 extends number>
								? Ok<MkSelect<W, Body, Ord, Lim, Off>, J3>
								: Of
							: never
						: IsOp<T, J2, ","> extends true
							? ParseExpr<T, Nx<J2>> extends infer Of
								? Of extends Ok<infer Cnt extends Expr, infer J3 extends number>
									? Ok<MkSelect<W, Body, Ord, Cnt, Lim>, J3>
									: Of
								: never
							: Ok<MkSelect<W, Body, Ord, Lim, null>, J2>
					: L
				: never
			: Ok<MkSelect<W, Body, Ord, null, null>, J>
		: O
	: never;
type MkSelect<W, Body, Ord, Lim, Off> = {
	t: "select";
	with: W;
	body: Body;
	orderBy: Ord;
	limit: Lim;
	offset: Off;
};

type ParseCompound<T extends Toks, I extends number> =
	ParseCore<T, I> extends infer C
		? C extends Ok<infer Core extends SelectBody, infer J extends number>
			? CompoundLoop<T, J, Core>
			: C
		: never;
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
		? ParseCore<T, J> extends infer C
			? C extends Ok<infer R extends SelectBody, infer J2 extends number>
				? CompoundLoop<T, J2, { t: "setop"; op: Op; all: All; l: L; r: R }>
				: C
			: never
		: never
	: IsWord<T, I, "order" | "limit"> extends true
		? Ok<L, I>
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
	Expect<T, I, "("> extends infer J
		? J extends number
			? ParseExprList<T, J, []> extends infer R
				? R extends Ok<
						infer Row extends readonly Expr[],
						infer J2 extends number
					>
					? Expect<T, J2, ")"> extends infer J3
						? J3 extends number
							? IsOp<T, J3, ","> extends true
								? ParseValues<T, Nx<J3>, [...Acc, Row]>
								: Acc extends readonly []
									? Ok<{ t: "values"; rows: [Row] }, J3>
									: Row["length"] extends Acc[0]["length"]
										? Ok<{ t: "values"; rows: [...Acc, Row] }, J3>
										: SqlError<
												"all VALUES must have the same number of terms",
												J3
											>
							: J3
						: never
					: R
				: never
			: J
		: never;

type ParseSimple<T extends Toks, I extends number> = (
	IsWord<T, I, "distinct"> extends true
		? [true, Nx<I>]
		: IsWord<T, I, "all"> extends true
			? [false, Nx<I>]
			: [false, I]
) extends [infer D extends boolean, infer J extends number]
	? ParseTargets<T, J, []> extends infer Tg
		? Tg extends Ok<
				infer Targets extends readonly Target[],
				infer J2 extends number
			>
			? (
					IsWord<T, J2, "from"> extends true
						? ParseFrom<T, Nx<J2>>
						: Ok<null, J2>
				) extends infer F
				? F extends Ok<infer From, infer J3 extends number>
					? (
							IsWord<T, J3, "where"> extends true
								? ParseExpr<T, Nx<J3>>
								: Ok<null, J3>
						) extends infer Wh
						? Wh extends Ok<infer Where, infer J4 extends number>
							? ParseGroup<T, J4> extends infer G
								? G extends Ok<
										[infer Group, infer Having],
										infer J5 extends number
									>
									? ParseWindows<T, J5> extends infer Wn
										? Wn extends Ok<infer Wins, infer J6 extends number>
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
											: Wn
										: never
									: G
								: never
							: Wh
						: never
					: F
				: never
			: Tg
		: never
	: never;

type ParseGroup<T extends Toks, I extends number> =
	IsWord<T, I, "group"> extends true
		? IsWord<T, Nx<I>, "by"> extends true
			? ParseExprList<T, Nx<Nx<I>>, []> extends infer G
				? G extends Ok<
						infer Group extends readonly Expr[],
						infer J extends number
					>
					? IsWord<T, J, "having"> extends true
						? ParseExpr<T, Nx<J>> extends infer H
							? H extends Ok<infer Having extends Expr, infer J2 extends number>
								? Ok<[Group, Having], J2>
								: H
							: never
						: Ok<[Group, null], J>
					: G
				: never
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "having"> extends true
			? ParseExpr<T, Nx<I>> extends infer H
				? H extends Ok<infer Having extends Expr, infer J2 extends number>
					? IsWord<T, J2, "group"> extends true
						? IsWord<T, Nx<J2>, "by"> extends true
							? ParseExprList<T, Nx<Nx<J2>>, []> extends infer G
								? G extends Ok<
										infer Group extends readonly Expr[],
										infer J3 extends number
									>
									? Ok<[Group, Having], J3>
									: G
								: never
							: SyntaxErr<T, Nx<J2>>
						: Ok<[null, Having], J2>
					: H
				: never
			: Ok<[null, null], I>;

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
			? Expect<T, Nx<Nx<I>>, "("> extends infer J
				? J extends number
					? ParseWindowSpec<T, J> extends infer S
						? S extends Ok<
								infer Spec extends WindowSpec,
								infer J2 extends number
							>
							? IsOp<T, J2, ","> extends true
								? WindowLoop<T, Nx<J2>, [...Acc, { name: N["v"]; spec: Spec }]>
								: Ok<[...Acc, { name: N["v"]; spec: Spec }], J2>
							: S
						: never
					: J
				: never
			: SyntaxErr<T, Nx<I>>
		: SyntaxErr<T, I>;

export type ParseTargets<
	T extends Toks,
	I extends number,
	Acc extends readonly Target[],
> =
	ParseTarget<T, I> extends infer R
		? R extends Ok<infer Tg extends Target, infer J extends number>
			? IsOp<T, J, ","> extends true
				? ParseTargets<T, Nx<J>, [...Acc, Tg]>
				: Ok<[...Acc, Tg], J>
			: R
		: never;

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
	ParseExpr<T, I> extends infer R
		? R extends Ok<infer E extends Expr, infer J extends number>
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
			: R
		: never;

export type ParseFrom<T extends Toks, I extends number> =
	ParseTableOrSub<T, I> extends infer R
		? R extends Ok<infer F extends FromItem, infer J extends number>
			? JoinLoop<T, J, F>
			: R
		: never;

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
			? ParseTableOrSub<T, J> extends infer R
				? R extends Ok<infer Rt extends FromItem, infer J2 extends number>
					? ParseJoinConstraint<T, J2> extends infer C
						? C extends Ok<[infer On, infer Using], infer J3 extends number>
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
							: C
						: never
					: R
				: never
			: Op extends null
				? Ok<L, I>
				: Op
		: never;

type ParseJoinConstraint<T extends Toks, I extends number> =
	IsWord<T, I, "on"> extends true
		? ParseExpr<T, Nx<I>> extends infer R
			? R extends Ok<infer E extends Expr, infer J extends number>
				? Ok<[E, null], J>
				: R
			: never
		: IsWord<T, I, "using"> extends true
			? IdentList<T, Nx<I>> extends infer R
				? R extends Ok<
						infer Cols extends readonly Name[],
						infer J extends number
					>
					? Ok<[null, NamesV<Cols>], J>
					: R
				: never
			: Ok<[null, null], I>;
type NamesV<N extends readonly Name[]> = {
	[K in keyof N]: N[K] extends Name ? N[K]["v"] : never;
};

type ParseTableOrSub<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? IsWord<T, Nx<I>, "select" | "with" | "values"> extends true
			? ParseSubquery<T, Nx<I>> extends infer R
				? R extends Ok<infer Q extends SelectStmt, infer J extends number>
					? Expect<T, J, ")"> extends infer J2
						? J2 extends number
							? WithAlias<T, J2, { t: "sub"; q: Q }>
							: J2
						: never
					: R
				: never
			: ParseFrom<T, Nx<I>> extends infer R
				? R extends Ok<infer F extends FromItem, infer J extends number>
					? Expect<T, J, ")"> extends infer J2
						? J2 extends number
							? F extends {
									readonly t: "table" | "func" | "sub";
									readonly alias: null;
								}
								? WithAlias<T, J2, F>
								: Ok<F, J2>
							: J2
						: never
					: R
				: never
		: ParseTableName<T, I>;

type ParseTableName<T extends Toks, I extends number> =
	Ident<T, I> extends infer A extends Name
		? IsOp<T, Nx<I>, "."> extends true
			? Ident<T, Nx<Nx<I>>> extends infer B extends Name
				? TableTail<T, Nx<Nx<Nx<I>>>, A["v"], B["v"]>
				: SyntaxErr<T, Nx<Nx<I>>>
			: TableTail<T, Nx<I>, null, A["v"]>
		: SyntaxErr<T, I>;

type TableTail<T extends Toks, I extends number, Schema, Name_ extends string> =
	IsOp<T, I, "("> extends true
		? (
				IsOp<T, Nx<I>, ")"> extends true
					? Ok<[], Nx<I>>
					: ParseExprList<T, Nx<I>, []>
			) extends infer R
			? R extends Ok<infer Args extends readonly Expr[], infer J extends number>
				? Expect<T, J, ")"> extends infer J2
					? J2 extends number
						? WithAlias<T, J2, { t: "func"; name: Name_; args: Args }>
						: J2
					: never
				: R
			: never
		: WithAlias<
					T,
					I,
					{ t: "table"; ref: { schema: Schema; name: Name_ } }
				> extends infer R
			? R extends Ok<infer F, infer J extends number>
				? SkipIndexed<T, J> extends infer J2
					? J2 extends number
						? Ok<F, J2>
						: J2
					: never
				: R
			: never;

type SkipIndexed<T extends Toks, I extends number> =
	IsWord<T, I, "indexed"> extends true
		? IsWord<T, Nx<I>, "by"> extends true
			? Ident<T, Nx<Nx<I>>> extends Name
				? Nx<Nx<Nx<I>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "not"> extends true
			? IsWord<T, Nx<I>, "indexed"> extends true
				? Nx<Nx<I>>
				: SyntaxErr<T, Nx<I>>
			: I;

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
