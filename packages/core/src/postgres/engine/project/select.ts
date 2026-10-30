import type { NarrowKeys, NarrowLevel } from "../../../engine/narrow.js";
import type {
	ColInfo,
	ColMap,
	Cols,
	ColsToMap,
	CteMap,
	Ctx,
	Info,
	MkCtx,
	NullableMap,
	Scope,
	ScopeLevel,
} from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
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
	ResolveSortKeys,
	TypeDisplay,
	WindowDefs,
} from "../binder/clauses.js";
import type { BindFrom, RenameCols } from "../binder/from.js";
import type { ExpandStar } from "../binder/resolve.js";
import type { Nx } from "../parser/util.js";
import type { ObjShape, Shaped } from "../shape.js";
import type { CommonLit, LitToText } from "../typer/operators.js";
import type { TypeOf } from "../typer/typeof.js";
import type { ColumnName } from "./naming.js";
import type { ProjectStmt } from "./stmt.js";

export type ProjectSelect<
	Q extends SelectStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = ProjectSelectParts<
	Q["with"],
	Q["body"],
	Q["orderBy"],
	DB,
	Outer,
	Ctes,
	false
>;

export type ProjectSelectParts<
	W extends WithClause | null,
	B extends SelectBody,
	Order extends readonly Expr[],
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Lit extends boolean = false,
> =
	BindWith<W, DB, Outer, Ctes> extends infer C2
		? C2 extends CteMap
			? ProjectBody<B, DB, Outer, C2, Order, Lit>
			: C2
		: never;

export type BindWith<
	W extends WithClause | null,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = BindCtes<
	NonNullable<W>["ctes"],
	NonNullable<W>["recursive"],
	DB,
	Outer,
	Ctes,
	never,
	0
>;

type BindCtes<
	Cs extends readonly Cte[],
	Rec extends boolean,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Seen extends string,
	I extends number,
> = Cs[I] extends undefined
	? Ctes
	: Cs[I]["name"] extends Seen
		? SqlError<
				`WITH query name "${Cs[I]["name"]}" specified more than once`,
				null
			>
		: BindCte<Cs[I], Rec, DB, Outer, Ctes> extends infer M
			? M extends ColMap
				? BindCtes<
						Cs,
						Rec,
						DB,
						Outer,
						AddCte<Ctes, Cs[I]["name"], M>,
						Seen | Cs[I]["name"],
						Nx<I>
					>
				: M
			: never;

type AddCte<Ctes extends CteMap, N extends string, M extends ColMap> = Omit<
	Ctes,
	N
> & { readonly [K in N]: M };

type BindCte<
	C extends Cte,
	Rec extends boolean,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = Rec extends true
	? C["q"] extends {
			readonly t: "select";
			readonly body: TagSetop;
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
					DB,
					Outer,
					Ctes,
					C["search"],
					C["cycle"]
				>
			>
		: NotRecursive<C, ProjectCteBody<C, DB, Outer, Ctes>>
	: NotRecursive<C, ProjectCteBody<C, DB, Outer, Ctes>>;

type ProjectCteBody<
	C extends Cte,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ProjectStmt<C["q"], DB, Outer, Ctes> extends infer R
		? R extends Cols
			? ApplyCteCols<R, C["cols"], C["name"]> extends infer R2
				? R2 extends Cols
					? ColsToMap<R2>
					: R2
				: never
			: R extends null
				? SqlError<
						`WITH query "${C["name"]}" does not have a RETURNING clause`,
						null
					>
				: R
		: never;

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
	| TagSetop
	| {
			readonly t: "paren";
			readonly q: { readonly body: TagSetop };
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
	SearchCols<S, M> extends infer SC
		? SC extends AnyErr
			? SC
			: CycleCols<Y, S, M> extends infer YC
				? YC extends AnyErr
					? YC
					: SC & YC extends infer All
						? { readonly [K in keyof All]: All[K] }
						: never
				: never
		: never;
type SearchCols<S, M extends ColMap> = S extends CteSearch
	? CheckCteColList<S["cols"], M, "search", never> extends infer E
		? E extends AnyErr
			? E
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
		: never
	: {};
type CycleCols<Y, S, M extends ColMap> = Y extends CteCycle
	? CheckCteColList<Y["cols"], M, "cycle", never> extends infer E
		? E extends AnyErr
			? E
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
								: CycleMarkType<Y["to"], Y["default"]> extends infer T
									? T extends string
										? { readonly [K in Y["set"]]: Info<T> } & {
												readonly [K in Y["using"]]: Info<"record[]">;
											}
										: T
									: never
		: never
	: {};
type CycleMarkType<To, Def> = [To, Def] extends [
	infer V extends Expr,
	infer D extends Expr,
]
	? ConstType<V> extends infer A extends string
		? ConstType<D> extends infer B extends string
			? CommonLit<A, B> extends infer T extends string
				? T extends "unknown"
					? B extends "unknown"
						? "text"
						: SqlError<
								`CYCLE types ${TypeDisplay<A>} and ${TypeDisplay<B>} cannot be matched`,
								null
							>
					: LitToText<T> extends NoEquality
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
				: never
			: never
		: never
	: "bool";
type NoEquality =
	| "box"
	| "circle"
	| "json"
	| "jsonpath"
	| "line"
	| "lseg"
	| "path"
	| "pg_snapshot"
	| "point"
	| "polygon"
	| "refcursor"
	| "txid_snapshot"
	| "xml";
type ConstType<E extends Expr> = E extends TagStr
	? "lit"
	: TypeOf<E, MkCtx<unknown, [], {}, false>> extends infer T
		? T extends ColInfo
			? T["type"]
			: "unknown"
		: never;

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
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	S,
	Y,
> =
	BindWith<W, DB, Outer, Ctes> extends infer C2
		? C2 extends CteMap
			? ProjectBody<B["l"], DB, Outer, C2, [], false> extends infer C0
				? C0 extends Cols
					? ApplyCteCols<C0, Names, Name> extends infer C1
						? C1 extends Cols
							? SearchCycleCols<S, Y, ColsToMap<C1>> extends infer X
								? X extends ColMap
									? RecursiveFix<
											Name,
											Names,
											W,
											B,
											Order,
											DB,
											Outer,
											Ctes,
											ColsToMap<C1>,
											ColsToMap<C1>,
											[0],
											X
										>
									: X
								: never
							: C1
						: never
					: C0
				: never
			: C2
		: never;
type RecursiveFix<
	Name extends string,
	Names extends readonly string[] | null,
	W extends WithClause | null,
	B extends SelectBody,
	Order extends readonly Expr[],
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	M0 extends ColMap,
	M extends ColMap,
	Iter extends readonly unknown[],
	X extends ColMap,
> =
	ProjectSelectParts<
		W,
		B,
		Order,
		DB,
		Outer,
		AddCte<Ctes, Name, WithExtra<M, X>>
	> extends infer Full
		? Full extends Cols
			? ApplyCteCols<Full, Names, Name> extends infer F2
				? F2 extends Cols
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
										DB,
										Outer,
										Ctes,
										M0,
										Next,
										[...Iter, 0],
										X
									>
						: never
					: F2
				: never
			: Full
		: never;
type WithExtra<M extends ColMap, X extends ColMap> = M & X extends infer All
	? { readonly [K in keyof All]: All[K] }
	: never;
type FixStep<M0 extends ColMap, Full extends ColMap> = {
	readonly [K in keyof M0]: {
		readonly type: M0[K]["type"];
		readonly nullable: Full[K & string]["nullable"];
	};
};
type Changed<A extends ColMap, B extends ColMap> = {
	[K in keyof A]: [A[K]["nullable"]] extends [B[K & string]["nullable"]]
		? never
		: K;
}[keyof A];

type ProjectBody<
	B extends SelectBody,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Order extends readonly Expr[],
	Lit extends boolean,
> = B extends TagSimple
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
				DB,
				Outer,
				Ctes,
				Lit
			>
	: B extends TagSetop
		? ProjectSetOp<B["l"], B["r"], B["op"], DB, Outer, Ctes> extends infer C
			? C extends Cols
				? CheckOutputOrder<Order, C> extends infer O
					? O extends AnyErr
						? O
						: C
					: never
				: C
			: never
		: B extends TagValues
			? ProjectValues<B["rows"], DB, Outer, Ctes, Order>
			: B extends TagParen
				? Order extends readonly []
					? ProjectSelectParts<
							B["q"]["with"],
							B["q"]["body"],
							B["q"]["orderBy"],
							DB,
							Outer,
							Ctes,
							Lit
						>
					: B["q"]["orderBy"] extends readonly []
						? ProjectSelectParts<
								B["q"]["with"],
								B["q"]["body"],
								Order,
								DB,
								Outer,
								Ctes,
								Lit
							>
						: SqlError<"multiple ORDER BY clauses not allowed", null>
				: SqlError<"unsupported query body", null>;

type ProjectSetOp<
	L extends SelectBody,
	R extends SelectBody,
	Op extends string,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ProjectBody<L, DB, Outer, Ctes, [], true> extends infer LC
		? LC extends Cols
			? ProjectBody<R, DB, Outer, Ctes, [], true> extends infer RC
				? RC extends Cols
					? AlignSetOp<LC, RC, Uppercase<Op>, [], 0>
					: RC
				: never
			: LC
		: never;

type AlignSetOp<
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
			? CommonLit<LT["type"], RT["type"]> extends infer T extends string
				? T extends "unknown"
					? RT["type"] extends "unknown"
						? AlignSetOp<
								L,
								R,
								Op,
								[...Acc, { readonly n: N; readonly t: Info<"unknown", true> }],
								Nx<I>
							>
						: SqlError<
								`${Op} types ${TypeDisplay<LT["type"]>} and ${TypeDisplay<RT["type"]>} cannot be matched`,
								null
							>
					: AlignSetOp<
							L,
							R,
							Op,
							[
								...Acc,
								{
									readonly n: N;
									readonly t: Info<
										LitToText<T>,
										LT["nullable"] extends true ? true : RT["nullable"]
									>;
								},
							],
							Nx<I>
						>
				: never
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
> = C[I] extends undefined ? Acc : RestFrom<C, Nx<I>, [...Acc, C[I]]>;

type ProjectValues<
	Rows extends readonly (readonly Expr[])[],
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Order extends readonly Expr[],
> =
	OperandRow<Rows[0], MkCtx<DB, Outer, Ctes, false>, [], 0> extends infer T0
		? T0 extends readonly ColInfo[]
			? MergeRows<Rows, T0, MkCtx<DB, Outer, Ctes, false>, 1> extends infer Ts
				? Ts extends readonly ColInfo[]
					? ValuesCols<Ts, 1, []> extends infer Cs extends Cols
						? ResolveSortKeys<
								Order,
								"ORDER BY",
								ValuesTargets<Cs>,
								Cs,
								MkCtx<
									DB,
									[
										[
											{
												readonly alias: "*VALUES*";
												readonly cols: ColsToMap<Cs>;
												readonly skip: [];
											},
										],
										...Outer,
									],
									Ctes,
									false
								>
							> extends infer K
							? K extends AnyErr
								? K
								: Cs
							: never
						: never
					: Ts
				: never
			: T0
		: never;

type OperandRow<
	Row extends readonly Expr[],
	C extends Ctx,
	Acc extends readonly ColInfo[],
	I extends number,
> = Row[I] extends undefined
	? Acc
	: (Row[I] extends TagStr ? Info<"lit"> : TypeOf<Row[I], C>) extends infer T
		? T extends ColInfo
			? OperandRow<Row, C, [...Acc, T], Nx<I>>
			: T
		: never;

type MergeRows<
	Rows extends readonly (readonly Expr[])[],
	Acc extends readonly ColInfo[],
	C extends Ctx,
	I extends number,
> = Rows[I] extends readonly Expr[]
	? OperandRow<Rows[I], C, [], 0> extends infer Us
		? Us extends readonly ColInfo[]
			? Us["length"] extends Acc["length"]
				? ZipCommon<Acc, Us, [], 0> extends infer Z
					? Z extends readonly ColInfo[]
						? MergeRows<Rows, Z, C, Nx<I>>
						: Z
					: never
				: SqlError<"VALUES lists must all be the same length", null>
			: Us
		: never
	: Acc;

type ZipCommon<
	A extends readonly ColInfo[],
	B extends readonly ColInfo[],
	Acc extends readonly ColInfo[],
	I extends number,
> = A[I] extends ColInfo
	? CommonLit<A[I]["type"], B[I]["type"]> extends infer T extends string
		? T extends "unknown"
			? B[I]["type"] extends "unknown"
				? ZipCommon<A, B, [...Acc, Info<"unknown", true>], Nx<I>>
				: SqlError<
						`VALUES types ${TypeDisplay<A[I]["type"]>} and ${TypeDisplay<B[I]["type"]>} cannot be matched`,
						null
					>
			: ZipCommon<
					A,
					B,
					[
						...Acc,
						Info<T, A[I]["nullable"] extends true ? true : B[I]["nullable"]>,
					],
					Nx<I>
				>
		: never
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
			Nx<I>,
			[
				...Acc,
				{
					readonly n: `column${I}`;
					readonly t: Info<LitToText<T["type"]>, T["nullable"]>;
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
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Lit extends boolean,
> =
	BindFrom<From, DB, Outer, Ctes> extends infer L
		? L extends ScopeLevel
			? SetsLevel<
					NarrowLevel<L, NarrowKeys<Where>>,
					Sets
				> extends infer L2 extends ScopeLevel
				? ProjectTargets<
						Ts,
						MkCtx<DB, [L2, ...Outer], Ctes, Grouped<GroupBy, Sets>>,
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
								MkCtx<DB, [L, ...Outer], Ctes, Grouped<GroupBy, Sets>>,
								MkCtx<DB, [L2, ...Outer], Ctes, Grouped<GroupBy, Sets>>
							> extends infer R
							? R extends AnyErr
								? R
								: Cs
							: never
						: Cs
					: never
				: never
			: L
		: never;

type Grouped<GroupBy, Sets> = Sets extends false
	? GroupBy extends null
		? false
		: true
	: false;

type SetsLevel<L extends ScopeLevel, Sets> = Sets extends false
	? L
	: NullLevel<L, Sets extends readonly unknown[] ? LeftOut<L, Sets> : string>;
type LeftOut<
	L extends ScopeLevel,
	Is extends readonly unknown[],
> = Is extends readonly [infer H, ...infer R]
	? H extends { readonly t: "col"; readonly name: infer N }
		? N extends LevelNames<L>
			? N | LeftOut<L, R>
			: string
		: string
	: never;
type LevelNames<L extends ScopeLevel> = {
	[I in keyof L]: keyof L[I]["cols"];
}[number];
type NullLevel<L extends ScopeLevel, Names> = {
	readonly [I in keyof L]: {
		readonly alias: L[I]["alias"];
		readonly cols: {
			readonly [K in keyof L[I]["cols"]]: K extends Names
				? { readonly type: L[I]["cols"][K]["type"]; readonly nullable: true }
				: L[I]["cols"][K];
		};
		readonly skip: L[I]["skip"];
	};
};

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
		Ts,
		C0["db"],
		C0["scope"] extends readonly [unknown] ? true : false
	> extends infer P extends AnyErr
		? P
		: CheckCondition<"WHERE", Where, C0> extends infer W
			? W extends AnyErr
				? W
				: CheckCondition<"HAVING", Having, C> extends infer H
					? H extends AnyErr
						? H
						: ResolveSortKeys<Order, "ORDER BY", Ts, Cs, C> extends infer OK
							? OK extends AnyErr
								? OK
								: OK extends readonly unknown[]
									? CheckGroupBy<GroupBy, Ts, Cs, C> extends infer G
										? G extends AnyErr
											? G
											: CheckDistinct<Distinct, OK, Ts, Cs, C> extends infer D
												? D extends AnyErr
													? D
													: CheckWindows<Ws, Ts, Order, C>
												: never
										: never
									: never
							: never
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
	CheckWindowClause<Ws, C> extends infer Defs
		? Defs extends WindowDefs
			? CheckWindowRefs<TargetExprs<Ts>, Defs, C> extends infer R
				? R extends AnyErr
					? R
					: CheckWindowRefs<Order, Defs, C>
				: never
			: Defs
		: never;
type TargetExprs<Ts extends readonly Target[]> = {
	readonly [K in keyof Ts]: Ts[K]["e"];
};

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
> = Ts[I] extends undefined
	? Acc
	: Ts[I]["e"] extends {
				readonly t: "star";
				readonly tbl: infer Tbl extends string | null;
			}
		? ExpandStar<C["scope"], Tbl> extends infer M
			? M extends ColMap
				? ProjectTargets<Ts, C, [...Acc, { readonly star: M }], Nx<I>, Lit>
				: M
			: never
		: Ts[I]["e"] extends { readonly t: "field"; readonly name: "*" }
			? FieldStar<TypeOf<Ts[I]["e"]["e"], C>> extends infer M
				? M extends ColMap
					? ProjectTargets<Ts, C, [...Acc, { readonly star: M }], Nx<I>, Lit>
					: M
				: never
			: (
						Lit extends true
							? Ts[I]["e"] extends TagStr
								? Info<"lit">
								: TypeOf<Ts[I]["e"], C>
							: TypeOf<Ts[I]["e"], C>
					) extends infer Ty
				? Ty extends ColInfo
					? ColumnName<Ts[I]["e"], Ts[I]["alias"], C> extends infer N
						? N extends string
							? ProjectTargets<
									Ts,
									C,
									[...Acc, { readonly n: N; readonly t: Ty }],
									Nx<I>,
									Lit
								>
							: N
						: never
					: Ty
				: never;

type TagSetop = { readonly t: "setop" };
type TagStr = { readonly t: "str" };
type TagSimple = { readonly t: "simple" };
type TagValues = { readonly t: "values" };
type TagParen = { readonly t: "paren" };
