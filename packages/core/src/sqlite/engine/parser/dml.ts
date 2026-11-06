import type {
	AliasAt,
	Expect,
	IsOp,
	IsWord,
	Name,
	NamesV,
	SyntaxErr,
} from "../../../engine/family/parse.js";
import type { Next } from "../../../engine/next.js";
import type { Ok, Toks } from "../../../engine/tokens.js";
import type { Expr, SelectStmt, SetItem, Upsert } from "../ast.js";
import type { OptWhere, ParseExpr, ParseExprList } from "./expr.js";
import type { Reserved } from "./keywords.js";
import type {
	OptFrom,
	ParseSubquery,
	ParseTargets,
	ParseValues,
} from "./select.js";
import type {
	Ident,
	IdentList,
	OptCols,
	SkipIndexed,
	TableRefAt,
} from "./util.js";

type Conflict = "abort" | "fail" | "ignore" | "replace" | "rollback";

type SkipOr<T extends Toks, I extends number> =
	IsWord<T, I, "or"> extends true
		? IsWord<T, Next<I>, Conflict> extends true
			? Next<Next<I>>
			: SyntaxErr<T, Next<I>>
		: I;

type AsAlias<T extends Toks, I extends number> =
	IsWord<T, I, "as"> extends true
		? AliasAt<T, Next<I>, Reserved> extends infer A extends Name
			? Ok<A["v"], Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: Ok<null, I>;

type TargetTable<T extends Toks, I extends number> =
	TableRefAt<T, I> extends Ok<infer Table, infer J extends number>
		? AsAlias<T, J> extends Ok<infer Alias, infer J2 extends number>
			? Ok<[Table, Alias], J2>
			: AsAlias<T, J>
		: TableRefAt<T, I>;

type IndexedTarget<T extends Toks, I extends number> =
	TargetTable<T, I> extends Ok<infer TA, infer J extends number>
		? SkipIndexed<T, J> extends infer J2 extends number
			? Ok<TA, J2>
			: SkipIndexed<T, J>
		: TargetTable<T, I>;

export type ParseInsert<T extends Toks, I extends number, W> = (
	IsWord<T, I, "replace"> extends true
		? Next<I>
		: SkipOr<T, Next<I>>
) extends infer J extends number
	? IsWord<T, J, "into"> extends true
		? TargetTable<T, Next<J>> extends Ok<
				[infer Table, infer Alias],
				infer J2 extends number
			>
			? OptCols<T, J2> extends Ok<infer Cols, infer J3 extends number>
				? InsertSource<T, J3> extends Ok<infer Src, infer J4 extends number>
					? UpsertLoop<T, J4, []> extends Ok<
							infer Ups extends readonly Upsert[],
							infer J5 extends number
						>
						? Returning<T, J5> extends Ok<infer Ret, infer J6 extends number>
							? Ok<
									{
										t: "insert";
										with: W;
										table: Table;
										alias: Alias;
										columns: Cols extends readonly Name[] ? NamesV<Cols> : null;
										source: Src;
										upsert: Ups;
										returning: Ret;
									},
									J6
								>
							: Returning<T, J5>
						: UpsertLoop<T, J4, []>
					: InsertSource<T, J3>
				: OptCols<T, J2>
			: TargetTable<T, Next<J>>
		: SyntaxErr<T, J>
	: SkipOr<T, Next<I>>;

type InsertSource<T extends Toks, I extends number> =
	IsWord<T, I, "default"> extends true
		? IsWord<T, Next<I>, "values"> extends true
			? Ok<{ t: "default" }, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: IsWord<T, I, "values"> extends true
			? ParseValues<T, Next<I>, []> extends Ok<
					{ readonly rows: infer Rows extends readonly (readonly Expr[])[] },
					infer J extends number
				>
				? IsWord<
						T,
						J,
						"union" | "intersect" | "except" | "order" | "limit"
					> extends true
					? SelectSource<T, I>
					: Ok<{ t: "values"; rows: Rows }, J>
				: ParseValues<T, Next<I>, []>
			: IsWord<T, I, "select" | "with"> extends true
				? SelectSource<T, I>
				: SyntaxErr<T, I>;
type SelectSource<T extends Toks, I extends number> =
	ParseSubquery<T, I> extends Ok<
		infer S extends SelectStmt,
		infer J extends number
	>
		? Ok<{ t: "select"; q: S }, J>
		: ParseSubquery<T, I>;

type UpsertLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	IsWord<T, I, "on"> extends true
		? IsWord<T, Next<I>, "conflict"> extends true
			? ConflictTarget<T, Next<Next<I>>> extends Ok<
					[infer Target, infer TWhere],
					infer J extends number
				>
				? UpsertAction<T, J> extends Ok<
						[infer Set, infer SW],
						infer J2 extends number
					>
					? UpsertLoop<
							T,
							J2,
							[
								...Acc,
								{ target: Target; where: TWhere; set: Set; setWhere: SW },
							]
						>
					: UpsertAction<T, J>
				: ConflictTarget<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: Ok<Acc, I>;
type ConflictTarget<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? ParseExprList<T, Next<I>, []> extends Ok<
				infer Target extends readonly Expr[],
				infer J extends number
			>
			? IsOp<T, J, ")"> extends true
				? OptWhere<T, Next<J>> extends Ok<infer W, infer J2 extends number>
					? Ok<[Target, W], J2>
					: OptWhere<T, Next<J>>
				: SyntaxErr<T, J>
			: ParseExprList<T, Next<I>, []>
		: Ok<[null, null], I>;
type UpsertAction<T extends Toks, I extends number> =
	IsWord<T, I, "do"> extends true
		? IsWord<T, Next<I>, "nothing"> extends true
			? Ok<[null, null], Next<Next<I>>>
			: IsWord<T, Next<I>, "update"> extends true
				? IsWord<T, Next<Next<I>>, "set"> extends true
					? ParseSet<T, Next<Next<Next<I>>>, []> extends Ok<
							infer Set extends readonly SetItem[],
							infer J extends number
						>
						? OptWhere<T, J> extends Ok<infer SW, infer J2 extends number>
							? Ok<[Set, SW], J2>
							: OptWhere<T, J>
						: ParseSet<T, Next<Next<Next<I>>>, []>
					: SyntaxErr<T, Next<Next<I>>>
				: SyntaxErr<T, Next<I>>
		: SyntaxErr<T, I>;

type ParseSet<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	SetCols<T, I> extends Ok<
		infer Cols extends readonly Name[],
		infer J extends number
	>
		? Expect<T, J, "="> extends infer J2 extends number
			? ParseExpr<T, J2> extends Ok<
					infer E extends Expr,
					infer J3 extends number
				>
				? [...Acc, { cols: NamesV<Cols>; e: E }] extends infer Acc2 extends
						readonly unknown[]
					? IsOp<T, J3, ","> extends true
						? ParseSet<T, Next<J3>, Acc2>
						: Ok<Acc2, J3>
					: never
				: ParseExpr<T, J2>
			: Expect<T, J, "=">
		: SetCols<T, I>;
type SetCols<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? IdentList<T, I>
		: Ident<T, I> extends infer N extends Name
			? Ok<[N], Next<I>>
			: SyntaxErr<T, I>;

type Returning<T extends Toks, I extends number> =
	IsWord<T, I, "returning"> extends true
		? ParseTargets<T, Next<I>, []>
		: Ok<null, I>;

export type ParseUpdate<T extends Toks, I extends number, W> =
	SkipOr<T, I> extends infer J extends number
		? IndexedTarget<T, J> extends Ok<
				[infer Table, infer Alias],
				infer J2 extends number
			>
			? IsWord<T, J2, "set"> extends true
				? ParseSet<T, Next<J2>, []> extends Ok<
						infer Set extends readonly SetItem[],
						infer J3 extends number
					>
					? OptFrom<T, J3> extends Ok<infer From, infer J4 extends number>
						? OptWhere<T, J4> extends Ok<infer Where, infer J5 extends number>
							? Returning<T, J5> extends Ok<infer Ret, infer J6 extends number>
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
										J6
									>
								: Returning<T, J5>
							: OptWhere<T, J4>
						: OptFrom<T, J3>
					: ParseSet<T, Next<J2>, []>
				: SyntaxErr<T, J2>
			: IndexedTarget<T, J>
		: SkipOr<T, I>;

export type ParseDelete<T extends Toks, I extends number, W> =
	IsWord<T, I, "from"> extends true
		? IndexedTarget<T, Next<I>> extends Ok<
				[infer Table, infer Alias],
				infer J extends number
			>
			? OptWhere<T, J> extends Ok<infer Where, infer J2 extends number>
				? Returning<T, J2> extends Ok<infer Ret, infer J3 extends number>
					? Ok<
							{
								t: "delete";
								with: W;
								table: Table;
								alias: Alias;
								where: Where;
								returning: Ret;
							},
							J3
						>
					: Returning<T, J2>
				: OptWhere<T, J>
			: IndexedTarget<T, Next<I>>
		: SyntaxErr<T, I>;
