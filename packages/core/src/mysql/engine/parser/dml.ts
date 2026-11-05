import type {
	Expr,
	FromItem,
	SelectStmt,
	SetItem,
	TableRef,
	Target,
} from "../ast.js";
import type { IsSubqueryParen, ParseExpr, ParseOrderList } from "./expr.js";
import type { Reserved } from "./keywords.js";
import type {
	ParseFrom,
	ParseLimit,
	ParseSubquery,
	ParseTargets,
	ParseValues,
} from "./select.js";
import type {
	AliasAt,
	Ident,
	IdentList,
	IsOp,
	IsWord,
	Name,
	NamesV,
	Nx,
	Ok,
	SyntaxErr,
	TableRefAt,
	Toks,
} from "./util.js";

type SkipWords<
	T extends Toks,
	I extends number,
	W extends string,
	Ignore extends boolean = false,
> = T[I] extends { readonly k: "w"; readonly v: infer V }
	? V extends W
		? SkipWords<T, Nx<I>, W, V extends "ignore" ? true : Ignore>
		: [Ignore, I]
	: [Ignore, I];

type SkipPartition<T extends Toks, I extends number> =
	IsWord<T, I, "partition"> extends true
		? IdentList<T, Nx<I>> extends Ok<unknown, infer J extends number>
			? J
			: IdentList<T, Nx<I>>
		: I;

/** `(a, b)`, `()` or a parenthesized query (no column list) after the table. */
type InsertCols<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? IsSubqueryParen<T, Nx<I>> extends true
			? Ok<null, I>
			: IsOp<T, Nx<I>, ")"> extends true
				? Ok<[], Nx<Nx<I>>>
				: IdentList<T, I>
		: Ok<null, I>;

export type ParseInsert<T extends Toks, I extends number> =
	SkipWords<
		T,
		Nx<I>,
		"low_priority" | "delayed" | "high_priority" | "ignore"
	> extends [infer Ignore extends boolean, infer J0 extends number]
		? (IsWord<T, J0, "into"> extends true ? Nx<J0> : J0) extends infer J extends
				number
			? TableRefAt<T, J> extends Ok<infer Table, infer J2 extends number>
				? SkipPartition<T, J2> extends infer J3 extends number
					? InsertCols<T, J3> extends Ok<infer Cols, infer J4 extends number>
						? InsertSource<T, J4> extends Ok<infer Src, infer J5 extends number>
							? RowAlias<T, J5> extends Ok<infer Alias, infer J6 extends number>
								? Odku<T, J6> extends Ok<infer Upd, infer J7 extends number>
									? Returning<T, J7> extends Ok<
											infer Ret,
											infer J8 extends number
										>
										? Ok<
												{
													t: "insert";
													replace: IsWord<T, I, "replace">;
													ignore: Ignore;
													with: null;
													table: Table;
													columns: Cols extends readonly Name[]
														? NamesV<Cols>
														: null;
													source: Src;
													rowAlias: Alias;
													odku: Upd;
													returning: Ret;
												},
												J8
											>
										: Returning<T, J7>
									: Odku<T, J6>
								: RowAlias<T, J5>
							: InsertSource<T, J4>
						: InsertCols<T, J3>
					: SkipPartition<T, J2>
				: TableRefAt<T, J>
			: never
		: never;

type InsertSource<T extends Toks, I extends number> =
	IsWord<T, I, "values" | "value"> extends true
		? ParseValues<T, Nx<I>, [], IsWord<T, Nx<I>, "row">> extends Ok<
				infer Rows extends readonly (readonly Expr[])[],
				infer J extends number
			>
			? Ok<{ t: "values"; rows: Rows }, J>
			: ParseValues<T, Nx<I>, [], IsWord<T, Nx<I>, "row">>
		: IsWord<T, I, "set"> extends true
			? ParseSet<T, Nx<I>, []> extends Ok<infer Set, infer J extends number>
				? Ok<{ t: "set"; set: Set }, J>
				: ParseSet<T, Nx<I>, []>
			: IsWord<T, I, "select" | "with" | "table"> extends true
				? SelectSource<T, I>
				: IsOp<T, I, "("> extends true
					? SelectSource<T, I>
					: SyntaxErr<T, I>;
type SelectSource<T extends Toks, I extends number> =
	ParseSubquery<T, I> extends Ok<
		infer S extends SelectStmt,
		infer J extends number
	>
		? Ok<{ t: "select"; q: S }, J>
		: ParseSubquery<T, I>;

/** `AS new [(a, b)]` after the inserted rows. */
type RowAlias<T extends Toks, I extends number> =
	IsWord<T, I, "as"> extends true
		? Ident<T, Nx<I>> extends infer N extends Name
			? IsOp<T, Nx<Nx<I>>, "("> extends true
				? IdentList<T, Nx<Nx<I>>> extends Ok<
						infer Cols extends readonly Name[],
						infer J extends number
					>
					? Ok<{ name: N["v"]; cols: NamesV<Cols> }, J>
					: IdentList<T, Nx<Nx<I>>>
				: Ok<{ name: N["v"]; cols: null }, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: Ok<null, I>;

type Odku<T extends Toks, I extends number> =
	IsWord<T, I, "on"> extends true
		? IsWord<T, Nx<I>, "duplicate"> extends true
			? IsWord<T, Nx<Nx<I>>, "key"> extends true
				? IsWord<T, Nx<Nx<Nx<I>>>, "update"> extends true
					? ParseSet<T, Nx<Nx<Nx<Nx<I>>>>, []>
					: SyntaxErr<T, Nx<Nx<Nx<I>>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: Ok<null, I>;

/** `a = 1, t.b = DEFAULT, …`. */
type ParseSet<
	T extends Toks,
	I extends number,
	Acc extends readonly SetItem[],
> =
	SetTarget<T, I> extends Ok<
		[infer Tbl, infer Col extends string],
		infer J extends number
	>
		? SetEq<T, J> extends infer J2 extends number
			? ParseExpr<T, J2> extends Ok<
					infer E extends Expr,
					infer J3 extends number
				>
				? [...Acc, { tbl: Tbl; col: Col; e: E }] extends infer Acc2 extends
						readonly SetItem[]
					? IsOp<T, J3, ","> extends true
						? ParseSet<T, Nx<J3>, Acc2>
						: Ok<Acc2, J3>
					: never
				: ParseExpr<T, J2>
			: SetEq<T, J>
		: SetTarget<T, I>;
type SetEq<T extends Toks, I extends number> =
	IsOp<T, I, "=" | ":="> extends true ? Nx<I> : SyntaxErr<T, I>;
type SetTarget<T extends Toks, I extends number> =
	Ident<T, I> extends infer A extends Name
		? IsOp<T, Nx<I>, "."> extends true
			? Ident<T, Nx<Nx<I>>> extends infer B extends Name
				? IsOp<T, Nx<Nx<Nx<I>>>, "."> extends true
					? Ident<T, Nx<Nx<Nx<Nx<I>>>>> extends infer C extends Name
						? Ok<[B["v"], C["v"]], Nx<Nx<Nx<Nx<Nx<I>>>>>>
						: SyntaxErr<T, Nx<Nx<Nx<Nx<I>>>>>
					: Ok<[A["v"], B["v"]], Nx<Nx<Nx<I>>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: Ok<[null, A["v"]], Nx<I>>
		: SyntaxErr<T, I>;

type Returning<T extends Toks, I extends number> =
	IsWord<T, I, "returning"> extends true
		? ParseTargets<T, Nx<I>, []> extends Ok<
				infer Tg extends readonly Target[],
				infer J extends number
			>
			? Ok<Tg, J>
			: ParseTargets<T, Nx<I>, []>
		: Ok<null, I>;

type OptOrder<T extends Toks, I extends number> =
	IsWord<T, I, "order"> extends true
		? IsWord<T, Nx<I>, "by"> extends true
			? ParseOrderList<T, Nx<Nx<I>>, []>
			: SyntaxErr<T, Nx<I>>
		: Ok<[], I>;

/** `[ORDER BY …] [LIMIT n]` of a single-table UPDATE or DELETE: no OFFSET. */
type OrderLimit<T extends Toks, I extends number> =
	OptOrder<T, I> extends Ok<infer Ord, infer J extends number>
		? ParseLimit<T, J> extends Ok<
				[infer Lim, infer Off],
				infer J2 extends number
			>
			? Off extends null
				? Ok<[Ord, Lim], J2>
				: SyntaxErr<T, J>
			: ParseLimit<T, J>
		: OptOrder<T, I>;

type Where<T extends Toks, I extends number> =
	IsWord<T, I, "where"> extends true ? ParseExpr<T, Nx<I>> : Ok<null, I>;

export type ParseUpdate<T extends Toks, I extends number, W> =
	SkipWords<T, I, "low_priority" | "ignore"> extends [
		boolean,
		infer J extends number,
	]
		? ParseFrom<T, J> extends Ok<
				infer From extends FromItem,
				infer J2 extends number
			>
			? IsWord<T, J2, "set"> extends true
				? ParseSet<T, Nx<J2>, []> extends Ok<
						infer Set extends readonly SetItem[],
						infer J3 extends number
					>
					? Where<T, J3> extends Ok<infer Wr, infer J4 extends number>
						? OrderLimit<T, J4> extends Ok<
								[infer Ord, infer Lim],
								infer J5 extends number
							>
							? Ok<
									{
										t: "update";
										with: W;
										from: From;
										set: Set;
										where: Wr;
										orderBy: Ord;
										limit: Lim;
									},
									J5
								>
							: OrderLimit<T, J4>
						: Where<T, J3>
					: ParseSet<T, Nx<J2>, []>
				: SyntaxErr<T, J2>
			: ParseFrom<T, J>
		: never;

/** `t`, `t.*`, `db.t`, comma-separated: the tables of a multi-table DELETE. */
type DeleteTargets<
	T extends Toks,
	I extends number,
	Acc extends readonly TableRef[],
> =
	TableRefAt<T, I> extends Ok<
		infer Ref extends TableRef,
		infer J extends number
	>
		? SkipDotStar<T, J> extends infer J2 extends number
			? IsOp<T, J2, ","> extends true
				? DeleteTargets<T, Nx<J2>, [...Acc, Ref]>
				: Ok<[...Acc, Ref], J2>
			: SkipDotStar<T, J>
		: TableRefAt<T, I>;
type SkipDotStar<T extends Toks, I extends number> =
	IsOp<T, I, "."> extends true
		? IsOp<T, Nx<I>, "*"> extends true
			? Nx<Nx<I>>
			: SyntaxErr<T, Nx<I>>
		: I;

export type ParseDelete<T extends Toks, I extends number, W> =
	SkipWords<T, I, "low_priority" | "quick" | "ignore"> extends [
		boolean,
		infer J extends number,
	]
		? IsWord<T, J, "from"> extends true
			? DeleteTargets<T, Nx<J>, []> extends Ok<
					infer Targets extends readonly TableRef[],
					infer J2 extends number
				>
				? IsWord<T, J2, "using"> extends true
					? MultiDelete<T, Nx<J2>, W, Targets>
					: Targets extends readonly [infer Ref extends TableRef]
						? SingleDelete<T, Nx<J>, W, Ref>
						: SyntaxErr<T, J2>
				: DeleteTargets<T, Nx<J>, []>
			: DeleteTargets<T, J, []> extends Ok<
						infer Targets extends readonly TableRef[],
						infer J2 extends number
					>
				? IsWord<T, J2, "from"> extends true
					? MultiDelete<T, Nx<J2>, W, Targets>
					: SyntaxErr<T, J2>
				: DeleteTargets<T, J, []>
		: never;

/** The optional alias of a single-table DELETE's target. */
type DeleteAlias<T extends Toks, I extends number> =
	IsWord<T, I, "as"> extends true
		? AliasAt<T, Nx<I>, Reserved> extends infer A extends Name
			? Ok<A["v"], Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: Ident<T, I> extends infer A extends Name
			? A["v"] extends "returning" | "partition" | "order" | "limit"
				? Ok<null, I>
				: Ok<A["v"], Nx<I>>
			: Ok<null, I>;

type SingleDelete<T extends Toks, I extends number, W, Ref extends TableRef> =
	TableRefAt<T, I> extends Ok<unknown, infer J extends number>
		? DeleteAlias<T, J> extends Ok<infer Alias, infer J2 extends number>
			? SkipPartition<T, J2> extends infer J3 extends number
				? Where<T, J3> extends Ok<infer Wr, infer J4 extends number>
					? OrderLimit<T, J4> extends Ok<
							[infer Ord, infer Lim],
							infer J5 extends number
						>
						? Returning<T, J5> extends Ok<infer Ret, infer J6 extends number>
							? Ok<
									{
										t: "delete";
										with: W;
										targets: [Ref];
										from: { t: "table"; ref: Ref; alias: Alias };
										multi: false;
										where: Wr;
										orderBy: Ord;
										limit: Lim;
										returning: Ret;
									},
									J6
								>
							: Returning<T, J5>
						: OrderLimit<T, J4>
					: Where<T, J3>
				: SkipPartition<T, J2>
			: DeleteAlias<T, J>
		: TableRefAt<T, I>;

type MultiDelete<
	T extends Toks,
	I extends number,
	W,
	Targets extends readonly TableRef[],
> =
	ParseFrom<T, I> extends Ok<
		infer From extends FromItem,
		infer J extends number
	>
		? Where<T, J> extends Ok<infer Wr, infer J2 extends number>
			? Ok<
					{
						t: "delete";
						with: W;
						targets: Targets;
						from: From;
						multi: true;
						where: Wr;
						orderBy: [];
						limit: null;
						returning: null;
					},
					J2
				>
			: Where<T, J>
		: ParseFrom<T, I>;
