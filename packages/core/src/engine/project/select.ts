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
import type { NarrowKeys, NarrowLevel } from "../binder/narrow.js";
import type { ExpandStar } from "../binder/resolve.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Nx } from "../parser/util.js";
import type { ObjShape, Shaped } from "../shape.js";
import type { CommonLit, LitToText } from "../typer/operators.js";
import type { TypeOf } from "../typer/typeof.js";
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
} from "../types.js";
import type { ColumnName } from "./naming.js";
import type { ProjectStmt } from "./stmt.js";

/**
 * Project a SELECT statement to its ordered output columns.
 * `ProjectSelect<Q, DB, Outer, Ctes>` → `Cols` or `SqlError`.
 *
 * Nodes are discriminated on `t` and passed on field by field (never compared against the
 * recursive AST types, ENGINE.md pitfall 12).
 */
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

/**
 * `[WITH ...] body [ORDER BY ...]`. `Lit`: type untyped string-literal targets as `lit`
 * (operands of a set operation, where they take the type of the other branches).
 */
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

// ───────────────────────────── WITH ─────────────────────────────

/**
 * Add the CTEs of a WITH clause to the CTE map. Each CTE sees the previous ones (and
 * shadows an outer CTE or table of the same name); a RECURSIVE CTE also sees itself.
 * Without a WITH clause the list of CTEs is `never`, which binds none.
 */
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

/** Add (or replace: an inner WITH shadows an outer CTE of the same name) the CTE `N`. */
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
			readonly body: { readonly t: "setop" };
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

// ─── SEARCH / CYCLE ───

/**
 * `SEARCH ... SET seq` and `CYCLE ... SET mark [TO v DEFAULT d] USING path` add columns to a
 * recursive CTE (also visible to its recursive term): `seq` is `record[]` (DEPTH FIRST) or
 * `record` (BREADTH FIRST), `mark` is `bool` or the common type of `v` and `d`, `path` is
 * `record[]`; none is ever NULL. They need a recursive CTE whose two terms are plain SELECTs.
 */
type NotRecursive<C extends Cte, R> = C extends {
	readonly search: null;
	readonly cycle: null;
}
	? R
	: SqlError<"WITH query is not recursive", null>;
/**
 * `R`, the recursive CTE `C` with the UNION `B`; with SEARCH or CYCLE, the recursive term and the
 * non-recursive term must both be plain SELECTs (not set operations).
 */
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
/** A set operation, parenthesized or not. */
type SetOperand =
	| { readonly t: "setop" }
	| {
			readonly t: "paren";
			readonly q: { readonly body: { readonly t: "setop" } };
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
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error
/** The columns SEARCH and CYCLE add (`{}` without them), or an error. `M`: the CTE's columns. */
type SearchCycleCols<S, Y, M extends ColMap> =
	SearchCols<S, M> extends infer SC
		? SC extends AnyErr
			? SC
			: CycleCols<Y, S, M> extends infer YC
				? YC extends AnyErr // type-mutate: equivalent cond-false – merged with the search columns, the error keeps its message and position, all an error is read for
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
/**
 * `TO v DEFAULT d`: their common type (string literals yield; two of them are text; with a value
 * of type `unknown`, which yields to anything but `unknown` and NULL, it is text too), which
 * needs an equality and an inequality operator.
 */
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
/** The types a constant can have that have no default btree or hash operator class (pg_opclass, PostgreSQL 18). */
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
type ConstType<E extends Expr> = E extends { readonly t: "str" }
	? "lit"
	: TypeOf<
				E,
				MkCtx<unknown, [], {}, false> // type-mutate: equivalent bool-flip – a constant has no aggregate, the only thing grouped changes
			> extends infer T
		? T extends ColInfo
			? T["type"]
			: "unknown" // type-mutate: equivalent never-false – TypeOf of a constant is a type
		: never;

/** `WITH a(x, y) AS (...)`: rename positionally; more names than columns is an error. */
type ApplyCteCols<
	C extends Cols,
	Names extends readonly string[] | null,
	Name extends string,
> = Names extends readonly string[]
	? RenameCols<C, Names, [], `WITH query "${Name}"`>
	: C;

/**
 * `WITH RECURSIVE t AS (non_recursive UNION [ALL] recursive)`: column types come from the
 * non-recursive term (as in Postgres); nullability is the union over both terms, iterated
 * to a fixpoint (a recursive term can feed a nullable column back into another one).
 */
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
/**
 * One step of the fixpoint: the whole UNION with the self reference typed `M`. Each step can
 * only make columns nullable, so it ends; after four steps every column is typed nullable.
 * `X`: the SEARCH / CYCLE columns (`{}` without them), added to the self reference and the result.
 */
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
					: F2 // type-mutate: equivalent never-false – the names fit the non-recursive term, renamed first
				: never
			: Full
		: never;
type WithExtra<M extends ColMap, X extends ColMap> = M & X extends infer All
	? { readonly [K in keyof All]: All[K] }
	: never;
/** The non-recursive term's types; the whole UNION's nullability (which includes that term's). */
type FixStep<M0 extends ColMap, Full extends ColMap> = {
	readonly [K in keyof M0]: {
		readonly type: M0[K]["type"];
		readonly nullable: Full[K & string]["nullable"];
	};
};
/** The columns whose nullability differs between two steps. */
type Changed<A extends ColMap, B extends ColMap> = {
	[K in keyof A]: [A[K]["nullable"]] extends [B[K & string]["nullable"]]
		? never
		: K;
}[keyof A];

// ───────────────────────────── bodies ─────────────────────────────

type ProjectBody<
	B extends SelectBody,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Order extends readonly Expr[],
	Lit extends boolean,
> = B extends { readonly t: "simple" }
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
	: B extends { readonly t: "setop" }
		? ProjectSetOp<B["l"], B["r"], B["op"], DB, Outer, Ctes> extends infer C
			? C extends Cols
				? CheckOutputOrder<Order, C> extends infer O
					? O extends AnyErr
						? O
						: C
					: never
				: C
			: never
		: B extends { readonly t: "values" }
			? ProjectValues<B["rows"], DB, Outer, Ctes, Order>
			: B extends { readonly t: "paren" }
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
				: SqlError<"unsupported query body", null>; // type-mutate: equivalent never-false – a body is one of these four

// ─── set operations ───

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

/**
 * Names come from the left branch; per position the type is the common type (untyped
 * string literals yield to the other branch, Postgres's `select_common_type`; no common
 * type is an error) and nullability is the union. Alignment stops at the first `*` entry
 * (its width is unknown). `unknown` (a type we do not know) yields to every type but itself:
 * `CommonLit` is `unknown` with an `unknown` right side only when the left is `unknown` or NULL,
 * and so is the column.
 */
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

// ─── VALUES ───

/**
 * `VALUES (...), ...` (the parser takes one row or more): columns `column1`, `column2`, ...;
 * per column the common type over the rows (string literals yield, like in set operations) and
 * nullable if any row is. ORDER BY sees the columns (by name, position or in expressions).
 */
type ProjectValues<
	Rows extends readonly (readonly Expr[])[],
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Order extends readonly Expr[],
> =
	OperandRow<
		Rows[0],
		MkCtx<DB, Outer, Ctes, false>, // type-mutate: equivalent bool-flip – aggregates are not allowed in VALUES, so no valid statement depends on it
		[],
		0
	> extends infer T0
		? T0 extends readonly ColInfo[]
			? MergeRows<
					Rows,
					T0,
					MkCtx<DB, Outer, Ctes, false>, // type-mutate: equivalent bool-flip – aggregates are not allowed in VALUES, so no valid statement depends on it
					1
				> extends infer Ts
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
									false // type-mutate: equivalent bool-flip – the keys are only checked for errors, and grouped changes only nullability
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

/** Type a row in operand position (string literals are `lit`). */
type OperandRow<
	Row extends readonly Expr[],
	C extends Ctx,
	Acc extends readonly ColInfo[],
	I extends number,
> = Row[I] extends undefined
	? Acc
	: (
				Row[I] extends { readonly t: "str" }
					? Info<"lit">
					: TypeOf<Row[I], C>
			) extends infer T
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

/** Per column the common type of two rows of the same length (`unknown` as in `AlignSetOp`). */
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
/** The columns as a target list, for ORDER BY positions and names. */
type ValuesTargets<Cs extends Cols> = {
	readonly [K in keyof Cs]: {
		readonly e: {
			readonly t: "col";
			readonly tbl: null;
			readonly name: Cs[K] extends { readonly n: infer N } ? N : never; // type-mutate: equivalent cond-false – the keys are only checked for errors, and VALUES column names are distinct, so none is ambiguous
		};
		readonly alias: null;
	};
};

// ─── simple select ───

/**
 * FROM → scope; WHERE narrows nullability (binder/narrow.ts); grouping sets make the columns
 * they may leave out nullable; targets are projected in that scope; then WHERE / HAVING /
 * ORDER BY / GROUP BY / DISTINCT [ON] / WINDOW are validated (binder/clauses.ts).
 */
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

/**
 * A GROUP BY without grouping sets: aggregates then see no empty input. The empty grouping set
 * (`()`, and in ROLLUP and CUBE) yields a row even for no input rows, as no GROUP BY does.
 */
type Grouped<GroupBy, Sets> = Sets extends false
	? GroupBy extends null
		? false // type-mutate: equivalent never-true – read with extends false, never counts as not grouped
		: true
	: false; // type-mutate: equivalent never-false – read with extends false, never counts as not grouped

/**
 * Grouping sets: a column that a set leaves out is NULL in that set's rows. `Sets`: the ROLLUP /
 * CUBE items (columns of this level, or anything else: then every column), or `true` (GROUPING
 * SETS, `()`: every column).
 */
type SetsLevel<L extends ScopeLevel, Sets> = Sets extends false
	? L
	: NullLevel<L, Sets extends readonly unknown[] ? LeftOut<L, Sets> : string>;
/** The names of the items `Is`, if all are columns of the level `L`; else `string` (all of them). */
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
/** Mark the columns `Names` of every item of a level nullable. */
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
	CheckCondition<"WHERE", Where, C0> extends infer W
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
		: true; // type-mutate: equivalent bool-flip – the callers only look for an error

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

/** `(t).*` in a target list: the columns of a whole-row value (all nullable when the row is). */
type FieldStar<A> = A extends ColInfo
	? A["type"] extends Shaped<"record", ObjShape<infer M>>
		? A["nullable"] extends true
			? NullableMap<M>
			: M
		: SqlError<"(e).* needs a whole-row value such as (t).*", null>
	: A;

/**
 * Targets → ordered columns, applying Postgres column naming. A `*` / `t.*` target is one
 * `{ star }` entry. `Lit`: an untyped string-literal target is typed `lit` (set operations).
 */
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
							? Ts[I]["e"] extends { readonly t: "str" }
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
							: N // type-mutate: equivalent never-false – ColumnName is always a name
						: never
					: Ty
				: never;
