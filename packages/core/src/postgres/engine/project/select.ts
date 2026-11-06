import type { NarrowKeys, NarrowLevel } from "../../../engine/narrow.js";
import type { Next } from "../../../engine/next.js";
import type {
	ColInfo,
	ColMap,
	Cols,
	ColsToMap,
	Info,
	ScopeLevel,
} from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { TypeFact } from "../../schema/type-facts.js";
import type {
	Cte,
	CteCycle,
	CteSearch,
	Expr,
	FromItem,
	NamedWindow,
	SelectBody,
	SelectStmt,
	SetOp,
	Tag,
	Target,
	WithClause,
} from "../ast.js";
import type {
	CallPlacement,
	CheckCondition,
	CheckDistinctOnOrder,
	CheckDistinctOrder,
	CheckGroupBy,
	CheckOutputOrder,
	CheckWindowClause,
	CheckWindowRefs,
	Grouped,
	HasStar,
	ResolveSortKeys,
	SetsLevel,
	TargetExprs,
	WindowDefs,
} from "../binder/clauses.js";
import type { BindFrom, RenameCols } from "../binder/from.js";
import type { ExpandStar } from "../binder/resolve.js";
import type {
	ArrInfo,
	HasNullElems,
	LitToText,
	NullableMap,
	ObjShape,
	Shaped,
} from "../shape.js";
import type { SelectCommon, UnmatchedErr } from "../typer/operators.js";
import type { TypeOf } from "../typer/typeof.js";
import type { CteMap, Ctx, MkCtx, QueryContext } from "../types.js";
import type { ColumnName } from "./naming.js";
import type { ProjectStmt } from "./stmt.js";

export type ProjectSelect<
	Q extends SelectStmt,
	Env extends QueryContext,
> = ProjectSelectParts<Q["with"], Q["body"], Q["orderBy"], Env, false>;

type ProjectSelectParts<
	W extends WithClause | null,
	B extends SelectBody,
	Order extends readonly Expr[],
	Env extends QueryContext,
	Lit extends boolean = false,
> =
	BindWith<W, Env> extends infer C2 extends CteMap
		? ProjectBody<B, QueryContext<Env["db"], Env["scope"], C2>, Order, Lit>
		: BindWith<W, Env>;

export type BindWith<
	W extends WithClause | null,
	Env extends QueryContext,
> = BindCtes<
	NonNullable<W>["ctes"],
	NonNullable<W>["recursive"],
	Env,
	never,
	0
>;

type BindCtes<
	Cs extends readonly Cte[],
	Rec extends boolean,
	Env extends QueryContext,
	Seen extends string,
	I extends number,
> = Cs[I] extends undefined
	? Env["ctes"]
	: Cs[I]["name"] extends Seen
		? SqlError<
				`WITH query name "${Cs[I]["name"]}" specified more than once`,
				null
			>
		: BindCte<Cs[I], Rec, Env> extends infer M extends ColMap
			? BindCtes<
					Cs,
					Rec,
					QueryContext<
						Env["db"],
						Env["scope"],
						AddCte<Env["ctes"], Cs[I]["name"], M>
					>,
					Seen | Cs[I]["name"],
					Next<I>
				>
			: BindCte<Cs[I], Rec, Env>;

type AddCte<Ctes extends CteMap, N extends string, M extends ColMap> = Omit<
	Ctes,
	N
> & { readonly [K in N]: M };

type BindCte<
	C extends Cte,
	Rec extends boolean,
	Env extends QueryContext,
> = Rec extends true
	? C["q"] extends {
			readonly t: "select";
			readonly body: Tag<"setop">;
		}
		? CheckExpandable<
				C,
				C["q"]["body"],
				RecursiveCte<
					C["name"],
					C["cols"],
					C["q"]["with"],
					C["q"]["body"],
					C["q"]["orderBy"],
					Env,
					C["search"],
					C["cycle"]
				>
			>
		: NotRecursive<C, ProjectCteBody<C, Env>>
	: NotRecursive<C, ProjectCteBody<C, Env>>;

type ProjectCteBody<C extends Cte, Env extends QueryContext> =
	ProjectStmt<C["q"], Env> extends infer R extends Cols
		? ApplyCteCols<R, C["cols"], C["name"]> extends infer R2 extends Cols
			? ColsToMap<R2>
			: ApplyCteCols<R, C["cols"], C["name"]>
		: ProjectStmt<C["q"], Env> extends null
			? SqlError<
					`WITH query "${C["name"]}" does not have a RETURNING clause`,
					null
				>
			: ProjectStmt<C["q"], Env>;

type NotRecursive<C extends Cte, R> = C extends {
	readonly search: null;
	readonly cycle: null;
}
	? R
	: SqlError<"WITH query is not recursive", null>;
type CheckExpandable<C extends Cte, B extends SetOp, R> = C extends {
	readonly search: null;
	readonly cycle: null;
}
	? R
	: B["l"] extends SetOperand
		? SqlError<
				"with a SEARCH or CYCLE clause, the left side of the UNION must be a SELECT",
				null
			>
		: B["r"] extends SetOperand
			? SqlError<
					"with a SEARCH or CYCLE clause, the right side of the UNION must be a SELECT",
					null
				>
			: R;
type SetOperand =
	| Tag<"setop">
	| {
			readonly t: "paren";
			readonly q: { readonly body: Tag<"setop"> };
	  };
type CheckCteColList<
	Cols extends readonly string[],
	M extends ColMap,
	What extends string,
	Seen extends string,
> = Cols extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? H extends keyof M
		? H extends Seen
			? SqlError<`${What} column "${H}" specified more than once`, null>
			: CheckCteColList<R, M, What, Seen | H>
		: SqlError<`${What} column "${H}" not in WITH query column list`, null>
	: true;
type SearchCycleCols<S, Y, M extends ColMap> =
	SearchCols<S, M> extends AnyErr
		? SearchCols<S, M>
		: CycleCols<Y, S, M> extends AnyErr
			? CycleCols<Y, S, M>
			: SearchCols<S, M> & CycleCols<Y, S, M> extends infer All
				? { readonly [K in keyof All]: All[K] }
				: never;
type SearchCols<S, M extends ColMap> = S extends CteSearch
	? CheckCteColList<S["cols"], M, "search", never> extends AnyErr
		? CheckCteColList<S["cols"], M, "search", never>
		: S["set"] extends keyof M
			? SqlError<
					`search sequence column name "${S["set"]}" already used in WITH query column list`,
					null
				>
			: {
					readonly [K in S["set"]]: Info<
						S["breadth"] extends true ? "record" : "record[]"
					>;
				}
	: {};
type CycleCols<Y, S, M extends ColMap> = Y extends CteCycle
	? CheckCteColList<Y["cols"], M, "cycle", never> extends AnyErr
		? CheckCteColList<Y["cols"], M, "cycle", never>
		: Y["set"] extends keyof M
			? SqlError<
					`cycle mark column name "${Y["set"]}" already used in WITH query column list`,
					null
				>
			: Y["using"] extends keyof M
				? SqlError<
						`cycle path column name "${Y["using"]}" already used in WITH query column list`,
						null
					>
				: Y["set"] extends Y["using"]
					? SqlError<
							"cycle mark column name and cycle path column name are the same",
							null
						>
					: S extends CteSearch & { readonly set: Y["set"] }
						? SqlError<
								"search sequence column name and cycle mark column name are the same",
								null
							>
						: S extends CteSearch & { readonly set: Y["using"] }
							? SqlError<
									"search sequence column name and cycle path column name are the same",
									null
								>
							: CycleMarkType<Y["to"], Y["default"]> extends infer T extends
										string
								? { readonly [K in Y["set"]]: Info<T> } & {
										readonly [K in Y["using"]]: Info<"record[]">;
									}
								: CycleMarkType<Y["to"], Y["default"]>
	: {};
type CycleMarkType<To, Def> = [To, Def] extends [
	infer V extends Expr,
	infer D extends Expr,
]
	? ConstType<V> extends infer A extends string
		? ConstType<D> extends infer B extends string
			? SelectCommon<A, B> extends infer T extends string
				? T extends "unknown"
					? "text"
					: TypeFact<LitToText<T>, "eq", true> extends false
						? SqlError<
								`could not identify an equality operator for type ${LitToText<T>}`,
								null
							>
						: LitToText<T> extends "aclitem" | "cid"
							? SqlError<
									`could not identify an inequality operator for type ${LitToText<T>}`,
									null
								>
							: LitToText<T>
				: UnmatchedErr<"CYCLE", SelectCommon<A, B>>
			: never
		: never
	: "bool";
type ConstType<E extends Expr> =
	E extends Tag<"str">
		? "lit"
		: TypeOf<E, MkCtx<unknown, [], {}, false>> extends infer T extends ColInfo
			? T["type"]
			: "unknown";

type ApplyCteCols<
	C extends Cols,
	Names extends readonly string[] | null,
	Name extends string,
> = Names extends readonly string[]
	? RenameCols<C, Names, [], `WITH query "${Name}"`>
	: C;

type RecursiveCte<
	Name extends string,
	Names extends readonly string[] | null,
	W extends WithClause | null,
	B extends SetOp,
	Order extends readonly Expr[],
	Env extends QueryContext,
	S,
	Y,
> =
	BindWith<W, Env> extends infer C2 extends CteMap
		? ProjectBody<
				B["l"],
				QueryContext<Env["db"], Env["scope"], C2>,
				[],
				false
			> extends infer C0 extends Cols
			? ApplyCteCols<C0, Names, Name> extends infer C1 extends Cols
				? SearchCycleCols<S, Y, ColsToMap<C1>> extends infer X extends ColMap
					? RecursiveFix<
							Name,
							Names,
							W,
							B,
							Order,
							Env,
							ColsToMap<C1>,
							ColsToMap<C1>,
							[0],
							X
						>
					: SearchCycleCols<S, Y, ColsToMap<C1>>
				: ApplyCteCols<C0, Names, Name>
			: ProjectBody<
					B["l"],
					QueryContext<Env["db"], Env["scope"], C2>,
					[],
					false
				>
		: BindWith<W, Env>;
type RecursiveFix<
	Name extends string,
	Names extends readonly string[] | null,
	W extends WithClause | null,
	B extends SelectBody,
	Order extends readonly Expr[],
	Env extends QueryContext,
	M0 extends ColMap,
	M extends ColMap,
	Iter extends readonly unknown[],
	X extends ColMap,
> =
	ProjectSelectParts<
		W,
		B,
		Order,
		QueryContext<
			Env["db"],
			Env["scope"],
			AddCte<Env["ctes"], Name, WithExtra<M, X>>
		>
	> extends infer Full
		? Full extends Cols
			? ApplyCteCols<Full, Names, Name> extends infer F2 extends Cols
				? FixStep<M0, ColsToMap<F2>> extends infer Next extends ColMap
					? [Changed<M, Next>] extends [never]
						? WithExtra<Next, X>
						: Iter["length"] extends 4
							? WithExtra<NullableMap<Next>, X>
							: RecursiveFix<
									Name,
									Names,
									W,
									B,
									Order,
									Env,
									M0,
									Next,
									[...Iter, 0],
									X
								>
					: never
				: ApplyCteCols<Full, Names, Name>
			: Full
		: never;
type WithExtra<M extends ColMap, X extends ColMap> = M & X extends infer All
	? { readonly [K in keyof All]: All[K] }
	: never;
type FixStep<M0 extends ColMap, Full extends ColMap> = {
	readonly [K in keyof M0]: ArrInfo<
		M0[K]["type"],
		Full[K & string]["nullable"],
		HasNullElems<M0[K]> extends true ? true : HasNullElems<Full[K & string]>
	>;
};
type Changed<A extends ColMap, B extends ColMap> = {
	[K in keyof A]: [A[K]["nullable"], HasNullElems<A[K]>] extends [
		B[K & string]["nullable"],
		HasNullElems<B[K & string]>,
	]
		? never
		: K;
}[keyof A];

type ProjectBody<
	B extends SelectBody,
	Env extends QueryContext,
	Order extends readonly Expr[],
	Lit extends boolean,
> =
	B extends Tag<"simple">
		? B extends { readonly into: unknown }
			? SqlError<"SELECT ... INTO is not allowed here", null>
			: ProjectSimple<
					B["distinct"],
					B["targets"],
					B["from"],
					B["where"],
					B["groupBy"],
					B["groupingSets"],
					B["having"],
					B["windows"],
					Order,
					Env,
					Lit
				>
		: B extends Tag<"setop">
			? ProjectSetOp<B["l"], B["r"], B["op"], Env> extends infer C extends Cols
				? CheckOutputOrder<Order, C> extends AnyErr
					? CheckOutputOrder<Order, C>
					: C
				: ProjectSetOp<B["l"], B["r"], B["op"], Env>
			: B extends Tag<"values">
				? ProjectValues<B["rows"], Env, Order>
				: B extends Tag<"paren">
					? (
							Order extends readonly []
								? B["q"]["orderBy"]
								: B["q"]["orderBy"] extends readonly []
									? Order
									: null
						) extends infer O extends readonly Expr[]
						? ProjectSelectParts<B["q"]["with"], B["q"]["body"], O, Env, Lit>
						: SqlError<"multiple ORDER BY clauses not allowed", null>
					: SqlError<"unsupported query body", null>;

type ProjectSetOp<
	L extends SelectBody,
	R extends SelectBody,
	Op extends string,
	Env extends QueryContext,
> =
	ProjectBody<L, Env, [], true> extends infer LC extends Cols
		? ProjectBody<R, Env, [], true> extends infer RC extends Cols
			? AlignSetOp<LC, RC, Uppercase<Op>, [], 0>
			: ProjectBody<R, Env, [], true>
		: ProjectBody<L, Env, [], true>;

/**
 * A `*` branch keeps its columns as a map, without positions. Keep the left
 * branch's columns (and positions) and add the other branch's nullability: by
 * name when both sides have the same columns, otherwise any nullable column on
 * the right makes every column nullable.
 */
type StarSetOp<L extends Cols, R extends Cols> =
	ColsToMap<L> extends infer LM extends ColMap
		? ColsToMap<R> extends infer RM extends ColMap
			? [keyof LM] extends [keyof RM]
				? [keyof RM] extends [keyof LM]
					? MergeStar<L, RM, null>
					: MergeStar<L, RM, AnyNullableMap<RM>>
				: MergeStar<L, RM, AnyNullableMap<RM>>
			: never
		: never;
type MergeStar<
	L extends Cols,
	RM extends ColMap,
	Any extends boolean | null,
> = {
	readonly [I in keyof L]: L[I] extends {
		readonly n: infer N extends string;
		readonly t: infer T extends ColInfo;
	}
		? { readonly n: N; readonly t: MergeNull<T, N, RM, Any> }
		: L[I] extends { readonly star: infer M extends ColMap }
			? {
					readonly star: {
						readonly [K in keyof M]: MergeNull<M[K], K, RM, Any>;
					};
				}
			: L[I];
};
type MergeNull<
	T extends ColInfo,
	N,
	RM extends ColMap,
	Any extends boolean | null,
> = ArrInfo<
	T["type"],
	T["nullable"] extends true
		? true
		: Any extends boolean
			? Any
			: N extends keyof RM
				? RM[N]["nullable"]
				: true,
	HasNullElems<T> extends true
		? true
		: N extends keyof RM
			? HasNullElems<RM[N]>
			: false
>;
type AnyNullableMap<M extends ColMap> = true extends M[keyof M]["nullable"]
	? true
	: false;

type AlignSetOp<
	L extends Cols,
	R extends Cols,
	Op extends string,
	Acc extends Cols,
	I extends number,
> = I extends 0
	? HasStar<L> extends true
		? StarSetOp<L, R>
		: HasStar<R> extends true
			? StarSetOp<L, R>
			: AlignCols<L, R, Op, Acc, I>
	: AlignCols<L, R, Op, Acc, I>;
type AlignCols<
	L extends Cols,
	R extends Cols,
	Op extends string,
	Acc extends Cols,
	I extends number,
> = L[I] extends undefined
	? R[I] extends undefined | { readonly star: unknown }
		? Acc
		: CountErr<Op>
	: L[I] extends {
				readonly n: infer N extends string;
				readonly t: infer LT extends ColInfo;
			}
		? R[I] extends { readonly t: infer RT extends ColInfo }
			? SelectCommon<LT["type"], RT["type"]> extends infer T extends string
				? T extends "unknown"
					? AlignSetOp<
							L,
							R,
							Op,
							[...Acc, { readonly n: N; readonly t: Info<"unknown", true> }],
							Next<I>
						>
					: AlignSetOp<
							L,
							R,
							Op,
							[
								...Acc,
								{
									readonly n: N;
									readonly t: ArrInfo<
										LitToText<T>,
										LT["nullable"] extends true ? true : RT["nullable"],
										HasNullElems<LT> extends true ? true : HasNullElems<RT>
									>;
								},
							],
							Next<I>
						>
				: UnmatchedErr<Op, SelectCommon<LT["type"], RT["type"]>>
			: R[I] extends undefined
				? CountErr<Op>
				: RestFrom<L, I, Acc>
		: RestFrom<L, I, Acc>;
type CountErr<Op extends string> = SqlError<
	`each ${Op} query must have the same number of columns`,
	null
>;
type RestFrom<
	C extends Cols,
	I extends number,
	Acc extends Cols,
> = C[I] extends undefined ? Acc : RestFrom<C, Next<I>, [...Acc, C[I]]>;

type ProjectValues<
	Rows extends readonly (readonly Expr[])[],
	Env extends QueryContext,
	Order extends readonly Expr[],
> =
	OperandRow<
		Rows[0],
		MkCtx<Env["db"], Env["scope"], Env["ctes"], false>,
		[],
		0
	> extends infer T0 extends readonly ColInfo[]
		? MergeRows<
				Rows,
				T0,
				MkCtx<Env["db"], Env["scope"], Env["ctes"], false>,
				1
			> extends infer Ts extends readonly ColInfo[]
			? ValuesCols<Ts, 1, []> extends infer Cs extends Cols
				? ResolveSortKeys<
						Order,
						"ORDER BY",
						ValuesTargets<Cs>,
						Cs,
						MkCtx<
							Env["db"],
							[
								[
									{
										readonly alias: "*VALUES*";
										readonly cols: ColsToMap<Cs>;
										readonly skip: [];
									},
								],
								...Env["scope"],
							],
							Env["ctes"],
							false
						>
					> extends infer K
					? K extends AnyErr
						? K
						: Cs
					: never
				: never
			: MergeRows<
					Rows,
					T0,
					MkCtx<Env["db"], Env["scope"], Env["ctes"], false>,
					1
				>
		: OperandRow<
				Rows[0],
				MkCtx<Env["db"], Env["scope"], Env["ctes"], false>,
				[],
				0
			>;

type OperandRow<
	Row extends readonly Expr[],
	C extends Ctx,
	Acc extends readonly ColInfo[],
	I extends number,
> = Row[I] extends undefined
	? Acc
	: (
				Row[I] extends Tag<"str">
					? Info<"lit">
					: TypeOf<Row[I], C>
			) extends infer T
		? T extends ColInfo
			? OperandRow<Row, C, [...Acc, T], Next<I>>
			: T
		: never;

type MergeRows<
	Rows extends readonly (readonly Expr[])[],
	Acc extends readonly ColInfo[],
	C extends Ctx,
	I extends number,
> = Rows[I] extends readonly Expr[]
	? OperandRow<Rows[I], C, [], 0> extends infer Us extends readonly ColInfo[]
		? Us["length"] extends Acc["length"]
			? ZipCommon<Acc, Us, [], 0> extends infer Z extends readonly ColInfo[]
				? MergeRows<Rows, Z, C, Next<I>>
				: ZipCommon<Acc, Us, [], 0>
			: SqlError<"VALUES lists must all be the same length", null>
		: OperandRow<Rows[I], C, [], 0>
	: Acc;

type ZipCommon<
	A extends readonly ColInfo[],
	B extends readonly ColInfo[],
	Acc extends readonly ColInfo[],
	I extends number,
> = A[I] extends ColInfo
	? SelectCommon<A[I]["type"], B[I]["type"]> extends infer T extends string
		? T extends "unknown"
			? ZipCommon<A, B, [...Acc, Info<"unknown", true>], Next<I>>
			: ZipCommon<
					A,
					B,
					[
						...Acc,
						ArrInfo<
							T,
							A[I]["nullable"] extends true ? true : B[I]["nullable"],
							HasNullElems<A[I]> extends true ? true : HasNullElems<B[I]>
						>,
					],
					Next<I>
				>
		: UnmatchedErr<"VALUES", SelectCommon<A[I]["type"], B[I]["type"]>>
	: Acc;

type ValuesCols<
	Ts extends readonly ColInfo[],
	I extends number,
	Acc extends Cols,
> = Ts extends readonly [
	infer T extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? ValuesCols<
			R,
			Next<I>,
			[
				...Acc,
				{
					readonly n: `column${I}`;
					readonly t: ArrInfo<
						LitToText<T["type"]>,
						T["nullable"],
						HasNullElems<T>
					>;
				},
			]
		>
	: Acc;
type ValuesTargets<Cs extends Cols> = {
	readonly [K in keyof Cs]: {
		readonly e: {
			readonly t: "col";
			readonly tbl: null;
			readonly name: Cs[K] extends { readonly n: infer N } ? N : never;
		};
		readonly alias: null;
	};
};

type ProjectSimple<
	Distinct,
	Ts extends readonly Target[],
	From extends readonly FromItem[],
	Where extends Expr | null,
	GroupBy extends readonly Expr[] | null,
	Sets,
	Having extends Expr | null,
	Ws extends readonly NamedWindow[],
	Order extends readonly Expr[],
	Env extends QueryContext,
	Lit extends boolean,
> =
	BindFrom<From, Env> extends infer L extends ScopeLevel
		? SetsLevel<
				NarrowLevel<L, NarrowKeys<Where>>,
				Sets
			> extends infer L2 extends ScopeLevel
			? ProjectTargets<
					Ts,
					MkCtx<
						Env["db"],
						[L2, ...Env["scope"]],
						Env["ctes"],
						Grouped<GroupBy, Sets>
					>,
					[],
					0,
					Lit
				> extends infer Cs
				? Cs extends Cols
					? CheckSimple<
							Distinct,
							Ts,
							Cs,
							Where,
							GroupBy,
							Having,
							Ws,
							Order,
							MkCtx<
								Env["db"],
								[L, ...Env["scope"]],
								Env["ctes"],
								Grouped<GroupBy, Sets>
							>,
							MkCtx<
								Env["db"],
								[L2, ...Env["scope"]],
								Env["ctes"],
								Grouped<GroupBy, Sets>
							>
						> extends infer R
						? R extends AnyErr
							? R
							: Cs
						: never
					: Cs
				: never
			: never
		: BindFrom<From, Env>;

type CheckSimple<
	Distinct,
	Ts extends readonly Target[],
	Cs extends Cols,
	Where extends Expr | null,
	GroupBy extends readonly Expr[] | null,
	Having extends Expr | null,
	Ws extends readonly NamedWindow[],
	Order extends readonly Expr[],
	C0 extends Ctx,
	C extends Ctx,
> =
	CallPlacement<
		Where,
		Ts[number]["e"],
		C0["db"],
		C0["scope"] extends readonly [unknown] ? true : false
	> extends infer P extends AnyErr
		? P
		: CheckCondition<"WHERE", Where, C0> extends AnyErr
			? CheckCondition<"WHERE", Where, C0>
			: CheckCondition<"HAVING", Having, C> extends AnyErr
				? CheckCondition<"HAVING", Having, C>
				: ResolveSortKeys<Order, "ORDER BY", Ts, Cs, C> extends infer OK
					? OK extends AnyErr
						? OK
						: OK extends readonly unknown[]
							? CheckGroupBy<GroupBy, Ts, Cs, C> extends AnyErr
								? CheckGroupBy<GroupBy, Ts, Cs, C>
								: CheckDistinct<Distinct, OK, Ts, Cs, C> extends AnyErr
									? CheckDistinct<Distinct, OK, Ts, Cs, C>
									: CheckWindows<Ws, Ts, Order, C>
							: never
					: never;

type CheckDistinct<
	Distinct,
	OKeys extends readonly unknown[],
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
> = Distinct extends readonly Expr[]
	? ResolveSortKeys<Distinct, "DISTINCT ON", Ts, Cs, C> extends infer DK
		? DK extends AnyErr
			? DK
			: DK extends readonly unknown[]
				? CheckDistinctOnOrder<DK, OKeys>
				: never
		: never
	: Distinct extends true
		? CheckDistinctOrder<OKeys, Ts, Cs>
		: true;

type CheckWindows<
	Ws extends readonly NamedWindow[],
	Ts extends readonly Target[],
	Order extends readonly Expr[],
	C extends Ctx,
> =
	CheckWindowClause<Ws, C> extends infer Defs extends WindowDefs
		? CheckWindowRefs<TargetExprs<Ts>, Defs, C> extends AnyErr
			? CheckWindowRefs<TargetExprs<Ts>, Defs, C>
			: CheckWindowRefs<Order, Defs, C>
		: CheckWindowClause<Ws, C>;

type FieldStar<A> = A extends ColInfo
	? A["type"] extends Shaped<"record", ObjShape<infer M>>
		? A["nullable"] extends true
			? NullableMap<M>
			: M
		: SqlError<"(e).* needs a whole-row value such as (t).*", null>
	: A;

export type ProjectTargets<
	Ts extends readonly Target[],
	C extends Ctx,
	Acc extends Cols,
	I extends number = 0,
	Lit extends boolean = false,
> = Ts[I] extends infer Tg extends Target
	? ProjectStarTarget<Tg["e"], C> extends infer R
		? R extends { readonly star: ColMap }
			? ProjectTargets<Ts, C, [...Acc, R], Next<I>, Lit>
			: R extends "typed"
				? (
						Lit extends true
							? Tg["e"] extends Tag<"str">
								? Info<"lit">
								: TypeOf<Tg["e"], C>
							: TypeOf<Tg["e"], C>
					) extends infer Ty
					? Ty extends ColInfo
						? ColumnName<Tg["e"], Tg["alias"], C> extends infer N extends string
							? ProjectTargets<
									Ts,
									C,
									[...Acc, { readonly n: N; readonly t: Ty }],
									Next<I>,
									Lit
								>
							: ColumnName<Tg["e"], Tg["alias"], C>
						: Ty
					: never
				: R
		: never
	: Acc;
type ProjectStarTarget<E, C extends Ctx> = E extends {
	readonly t: "star";
	readonly tbl: infer Tbl extends string | null;
}
	? ExpandStar<C["scope"], Tbl> extends infer M extends ColMap
		? { readonly star: M }
		: ExpandStar<C["scope"], Tbl>
	: E extends { readonly t: "field"; readonly name: "*"; readonly e: infer F }
		? FieldStar<TypeOf<Extract<F, Expr>, C>> extends infer M extends ColMap
			? { readonly star: M }
			: FieldStar<TypeOf<Extract<F, Expr>, C>>
		: "typed";
