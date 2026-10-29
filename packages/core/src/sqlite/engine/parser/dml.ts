import type { Expr, SelectStmt, SetItem, Target, Upsert } from "../ast.js";

type NamesV<N extends readonly Name[]> = {
	[K in keyof N]: N[K] extends Name ? N[K]["v"] : never;
};

import type { ParseExpr, ParseExprList } from "./expr.js";
import type { Reserved } from "./keywords.js";
import type {
	ParseFrom,
	ParseSubquery,
	ParseTargets,
	ParseValues,
} from "./select.js";
import type {
	AliasAt,
	Expect,
	Ident,
	IdentList,
	IsOp,
	IsWord,
	Name,
	Nx,
	Ok,
	SyntaxErr,
	Toks,
} from "./util.js";

type Conflict = "abort" | "fail" | "ignore" | "replace" | "rollback";

type SkipOr<T extends Toks, I extends number> =
	IsWord<T, I, "or"> extends true
		? IsWord<T, Nx<I>, Conflict> extends true
			? Nx<Nx<I>>
			: SyntaxErr<T, Nx<I>>
		: I;

type TableRefAt<T extends Toks, I extends number> =
	Ident<T, I> extends infer A extends Name
		? IsOp<T, Nx<I>, "."> extends true
			? Ident<T, Nx<Nx<I>>> extends infer B extends Name
				? Ok<{ schema: A["v"]; name: B["v"] }, Nx<Nx<Nx<I>>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: Ok<{ schema: null; name: A["v"] }, Nx<I>>
		: SyntaxErr<T, I>;

type AsAlias<T extends Toks, I extends number> =
	IsWord<T, I, "as"> extends true
		? AliasAt<T, Nx<I>, Reserved> extends infer A extends Name
			? Ok<A["v"], Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: Ok<null, I>;

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

export type ParseInsert<T extends Toks, I extends number, W> = (
	IsWord<T, I, "replace"> extends true
		? Nx<I>
		: SkipOr<T, Nx<I>>
) extends infer J
	? J extends number
		? IsWord<T, J, "into"> extends true
			? TableRefAt<T, Nx<J>> extends infer R
				? R extends Ok<infer Table, infer J2 extends number>
					? AsAlias<T, J2> extends infer A
						? A extends Ok<infer Alias, infer J3 extends number>
							? (
									IsOp<T, J3, "("> extends true
										? IdentList<T, J3>
										: Ok<null, J3>
								) extends infer C
								? C extends Ok<infer Cols, infer J4 extends number>
									? InsertSource<T, J4> extends infer S
										? S extends Ok<infer Src, infer J5 extends number>
											? UpsertLoop<T, J5, []> extends infer U
												? U extends Ok<
														infer Ups extends readonly Upsert[],
														infer J6 extends number
													>
													? Returning<T, J6> extends infer Rt
														? Rt extends Ok<infer Ret, infer J7 extends number>
															? Ok<
																	{
																		t: "insert";
																		with: W;
																		table: Table;
																		alias: Alias;
																		columns: Cols extends readonly Name[]
																			? NamesV<Cols>
																			: null;
																		source: Src;
																		upsert: Ups;
																		returning: Ret;
																	},
																	J7
																>
															: Rt
														: never
													: U
												: never
											: S
										: never
									: C
								: never
							: A
						: never
					: R
				: never
			: SyntaxErr<T, J>
		: J
	: never;

type InsertSource<T extends Toks, I extends number> =
	IsWord<T, I, "default"> extends true
		? IsWord<T, Nx<I>, "values"> extends true
			? Ok<{ t: "default" }, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "values"> extends true
			? ParseValues<T, Nx<I>, []> extends infer V
				? V extends Ok<
						{ readonly rows: infer Rows extends readonly (readonly Expr[])[] },
						infer J extends number
					>
					? IsWord<
							T,
							J,
							"union" | "intersect" | "except" | "order" | "limit"
						> extends true
						? ParseSubquery<T, I> extends infer Q
							? Q extends Ok<
									infer S extends SelectStmt,
									infer J2 extends number
								>
								? Ok<{ t: "select"; q: S }, J2>
								: Q
							: never
						: Ok<{ t: "values"; rows: Rows }, J>
					: V
				: never
			: IsWord<T, I, "select" | "with"> extends true
				? ParseSubquery<T, I> extends infer Q
					? Q extends Ok<infer S extends SelectStmt, infer J extends number>
						? Ok<{ t: "select"; q: S }, J>
						: Q
					: never
				: SyntaxErr<T, I>;

type UpsertLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	IsWord<T, I, "on"> extends true
		? IsWord<T, Nx<I>, "conflict"> extends true
			? (
					IsOp<T, Nx<Nx<I>>, "("> extends true
						? ParseExprList<T, Nx<Nx<Nx<I>>>, []> extends infer L
							? L extends Ok<
									infer Target extends readonly Expr[],
									infer J extends number
								>
								? Expect<T, J, ")"> extends infer J2
									? J2 extends number
										? IsWord<T, J2, "where"> extends true
											? ParseExpr<T, Nx<J2>> extends infer Wh
												? Wh extends Ok<
														infer W extends Expr,
														infer J3 extends number
													>
													? Ok<[Target, W], J3>
													: Wh
												: never
											: Ok<[Target, null], J2>
										: J2
									: never
								: L
							: never
						: Ok<[null, null], Nx<Nx<I>>>
				) extends infer Tg
				? Tg extends Ok<[infer Target, infer TWhere], infer J extends number>
					? IsWord<T, J, "do"> extends true
						? IsWord<T, Nx<J>, "nothing"> extends true
							? UpsertLoop<
									T,
									Nx<Nx<J>>,
									[
										...Acc,
										{
											target: Target;
											where: TWhere;
											set: null;
											setWhere: null;
										},
									]
								>
							: IsWord<T, Nx<J>, "update"> extends true
								? IsWord<T, Nx<Nx<J>>, "set"> extends true
									? ParseSet<T, Nx<Nx<Nx<J>>>, []> extends infer S
										? S extends Ok<
												infer Set extends readonly SetItem[],
												infer J2 extends number
											>
											? (
													IsWord<T, J2, "where"> extends true
														? ParseExpr<T, Nx<J2>>
														: Ok<null, J2>
												) extends infer Wh
												? Wh extends Ok<infer SW, infer J3 extends number>
													? UpsertLoop<
															T,
															J3,
															[
																...Acc,
																{
																	target: Target;
																	where: TWhere;
																	set: Set;
																	setWhere: SW;
																},
															]
														>
													: Wh
												: never
											: S
										: never
									: SyntaxErr<T, Nx<Nx<J>>>
								: SyntaxErr<T, Nx<J>>
						: SyntaxErr<T, J>
					: Tg
				: never
			: SyntaxErr<T, Nx<I>>
		: Ok<Acc, I>;

export type ParseSet<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> = (
	IsOp<T, I, "("> extends true
		? IdentList<T, I>
		: Ident<T, I> extends infer N extends Name
			? Ok<[N], Nx<I>>
			: SyntaxErr<T, I>
) extends infer C
	? C extends Ok<infer Cols extends readonly Name[], infer J extends number>
		? Expect<T, J, "="> extends infer J2
			? J2 extends number
				? ParseExpr<T, J2> extends infer R
					? R extends Ok<infer E extends Expr, infer J3 extends number>
						? [...Acc, { cols: NamesV<Cols>; e: E }] extends infer Acc2 extends
								readonly unknown[]
							? IsOp<T, J3, ","> extends true
								? ParseSet<T, Nx<J3>, Acc2>
								: Ok<Acc2, J3>
							: never
						: R
					: never
				: J2
			: never
		: C
	: never;

type Returning<T extends Toks, I extends number> =
	IsWord<T, I, "returning"> extends true
		? ParseTargets<T, Nx<I>, []> extends infer R
			? R extends Ok<infer Tg extends readonly Target[], infer J extends number>
				? Ok<Tg, J>
				: R
			: never
		: Ok<null, I>;

export type ParseUpdate<T extends Toks, I extends number, W> =
	SkipOr<T, I> extends infer J
		? J extends number
			? TableRefAt<T, J> extends infer R
				? R extends Ok<infer Table, infer J2 extends number>
					? AsAlias<T, J2> extends infer A
						? A extends Ok<infer Alias, infer J3 extends number>
							? SkipIndexed<T, J3> extends infer J4
								? J4 extends number
									? IsWord<T, J4, "set"> extends true
										? ParseSet<T, Nx<J4>, []> extends infer S
											? S extends Ok<
													infer Set extends readonly SetItem[],
													infer J5 extends number
												>
												? (
														IsWord<T, J5, "from"> extends true
															? ParseFrom<T, Nx<J5>>
															: Ok<null, J5>
													) extends infer F
													? F extends Ok<infer From, infer J6 extends number>
														? (
																IsWord<T, J6, "where"> extends true
																	? ParseExpr<T, Nx<J6>>
																	: Ok<null, J6>
															) extends infer Wh
															? Wh extends Ok<
																	infer Where,
																	infer J7 extends number
																>
																? Returning<T, J7> extends infer Rt
																	? Rt extends Ok<
																			infer Ret,
																			infer J8 extends number
																		>
																		? Ok<
																				{
																					t: "update";
																					with: W;
																					table: Table;
																					alias: Alias;
																					set: Set;
																					from: From;
																					where: Where;
																					returning: Ret;
																				},
																				J8
																			>
																		: Rt
																	: never
																: Wh
															: never
														: F
													: never
												: S
											: never
										: SyntaxErr<T, J4>
									: J4
								: never
							: A
						: never
					: R
				: never
			: J
		: never;

export type ParseDelete<T extends Toks, I extends number, W> =
	IsWord<T, I, "from"> extends true
		? TableRefAt<T, Nx<I>> extends infer R
			? R extends Ok<infer Table, infer J extends number>
				? AsAlias<T, J> extends infer A
					? A extends Ok<infer Alias, infer J2 extends number>
						? SkipIndexed<T, J2> extends infer J3
							? J3 extends number
								? (
										IsWord<T, J3, "where"> extends true
											? ParseExpr<T, Nx<J3>>
											: Ok<null, J3>
									) extends infer Wh
									? Wh extends Ok<infer Where, infer J4 extends number>
										? Returning<T, J4> extends infer Rt
											? Rt extends Ok<infer Ret, infer J5 extends number>
												? Ok<
														{
															t: "delete";
															with: W;
															table: Table;
															alias: Alias;
															where: Where;
															returning: Ret;
														},
														J5
													>
												: Rt
											: never
										: Wh
									: never
								: J3
							: never
						: A
					: never
				: R
			: never
		: SyntaxErr<T, I>;

export type { TableRefAt };
