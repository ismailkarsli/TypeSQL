import type { NameAt, NamedAt } from "../../../engine/family/diagnostics.js";
import type { NullLevel, RenameCells } from "../../../engine/family/scope.js";
import type { QueryContext } from "../../../engine/family/types.js";
import type { NarrowKeys, NarrowLevel } from "../../../engine/narrow.js";
import type { Next } from "../../../engine/next.js";
import type { Tup } from "../../../engine/num.js";
import type { ColInfo, Info, Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type {
	Cte,
	Expr,
	SelectBody,
	SelectStmt,
	SetOp,
	SimpleSelect,
	Target,
	ValuesBody,
	WithClause,
} from "../ast.js";
import type {
	BindFrom,
	CteEntry,
	DupCell,
	StarCells,
} from "../binder/scope.js";
import type { IsAggCall } from "../typer/functions.js";
import type { Common, TypeList, TypeOf } from "../typer/typeof.js";
import type {
	AggMode,
	Cell,
	FlavorOf,
	MkCtx,
	MyColMap,
	MyColOf,
	MyCteMap,
	MyCtx,
	MyLevel,
} from "../types.js";

export type ProjectSelect<
	Q extends SelectStmt,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
> =
	BindWith<Q["with"], Env> extends infer C2 extends MyCteMap
		? ProjectBody<
				Q["body"],
				QueryContext<Env["db"], Env["scope"], C2>,
				Q["orderBy"]
			> extends infer R extends readonly Cell[]
			? CheckLimit<Q> extends AnyErr
				? CheckLimit<Q>
				: R
			: ProjectBody<
					Q["body"],
					QueryContext<Env["db"], Env["scope"], C2>,
					Q["orderBy"]
				>
		: BindWith<Q["with"], Env>;

/** LIMIT and OFFSET take integer literals or parameters. */
type CheckLimit<Q extends SelectStmt> =
	LimitOk<Q["limit"]> extends true ? LimitOk<Q["offset"]> : LimitOk<Q["limit"]>;
type LimitOk<E> = E extends null
	? true
	: E extends { readonly t: "param" | "var" }
		? true
		: E extends { readonly t: "num"; readonly v: infer V extends string }
			? V extends `${string}${"." | "e" | "E" | "-"}${string}`
				? SqlError<"Incorrect arguments to LIMIT", NameAt<"limit">>
				: true
			: SqlError<
					"You have an error in your SQL syntax near LIMIT",
					NameAt<"limit">
				>;

export type BindWith<
	W,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
> = W extends WithClause ? CteLoop<W["ctes"], Env, 0> : Env["ctes"];

type CteLoop<
	L extends readonly Cte[],
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	I extends number,
> = L[I] extends infer C extends Cte
	? CteCells<C, Env> extends infer R extends readonly Cell[]
		? DupCell<R> extends infer D extends AnyErr
			? D
			: CteLoop<
					L,
					QueryContext<
						Env["db"],
						Env["scope"],
						Env["ctes"] & { readonly [K in C["name"]]: CteEntry<R> }
					>,
					Next<I>
				>
		: CteCells<C, Env>
	: Env["ctes"];

type CteCells<
	C extends Cte,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
> = (
	C["q"]["body"] extends {
		readonly t: "setop";
		readonly l: infer Anchor extends SelectBody;
	}
		? LeftMost<Anchor> extends infer A extends SelectBody
			? ProjectBody<A, Env, []> extends infer AC extends readonly Cell[]
				? Renamed<C, AC> extends infer RC extends readonly Cell[]
					? ProjectSelect<
							C["q"],
							QueryContext<
								Env["db"],
								Env["scope"],
								Env["ctes"] & { readonly [K in C["name"]]: CteEntry<RC> }
							>
						> extends infer All extends readonly Cell[]
						? AnchorTypes<AC, All>
						: ProjectSelect<
								C["q"],
								QueryContext<
									Env["db"],
									Env["scope"],
									Env["ctes"] & { readonly [K in C["name"]]: CteEntry<RC> }
								>
							>
					: Renamed<C, AC>
				: ProjectBody<A, Env, []>
			: never
		: ProjectSelect<C["q"], Env>
) extends infer R
	? R extends readonly Cell[]
		? Renamed<C, R>
		: R
	: never;
/** A recursive CTE's columns have the anchor's types; any part can make them NULL. */
type AnchorTypes<A extends readonly Cell[], All extends readonly Cell[]> = {
	[I in keyof All]: {
		readonly n: All[I]["n"];
		readonly t: Info<
			A[I & keyof A] extends { readonly t: { readonly type: infer T } }
				? T
				: All[I]["t"]["type"],
			All[I]["t"]["nullable"]
		>;
	};
};
type LeftMost<B extends SelectBody> = B extends {
	readonly t: "setop";
	readonly l: infer L extends SelectBody;
}
	? LeftMost<L>
	: B;

type Renamed<
	C extends Cte,
	R extends readonly Cell[],
> = C["cols"] extends readonly {
	readonly n: string;
}[]
	? C["cols"]["length"] extends R["length"]
		? RenameCells<R, C["cols"]>
		: SqlError<
				"In definition of view, derived table or common table expression, SELECT list and column names list have different column counts",
				null
			>
	: R;

type ProjectBody<
	B extends SelectBody,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	OrderBy extends readonly Expr[],
> = B extends { readonly t: "simple" }
	? B extends { readonly table: true }
		? FlavorOf<Env["db"]> extends "mariadb"
			? SqlError<"You have an error in your SQL syntax near 'TABLE'", null>
			: ProjectSimple<Extract<B, SimpleSelect>, Env, OrderBy>
		: ProjectSimple<Extract<B, SimpleSelect>, Env, OrderBy>
	: B extends { readonly t: "values" }
		? B["row"] extends (FlavorOf<Env["db"]> extends "mariadb" ? true : false)
			? SqlError<
					`You have an error in your SQL syntax near '${B["row"] extends true ? "ROW" : "("}'`,
					null
				>
			: ProjectValues<Extract<B, ValuesBody>, Env>
		: B extends { readonly t: "setop" }
			? ProjectSetOp<Extract<B, SetOp>, Env, OrderBy>
			: B extends {
						readonly t: "nested";
						readonly q: infer Q extends SelectStmt;
					}
				? ProjectSelect<Q, Env>
				: never;

type ProjectSetOp<
	B extends SetOp,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	OrderBy extends readonly Expr[],
> =
	ProjectBody<B["l"], Env, []> extends infer L extends readonly Cell[]
		? ProjectBody<B["r"], Env, []> extends infer R extends readonly Cell[]
			? L["length"] extends R["length"]
				? MergeCells<L, R, B["op"], FlavorOf<Env["db"]>> extends infer M extends
						readonly Cell[]
					? CompoundOrder<OrderBy, M> extends AnyErr
						? CompoundOrder<OrderBy, M>
						: M
					: never
				: SqlError<
						"The used SELECT statements have a different number of columns",
						null
					>
			: ProjectBody<B["r"], Env, []>
		: ProjectBody<B["l"], Env, []>;

type MergeCells<L extends readonly Cell[], R extends readonly Cell[], Op, F> = {
	[I in keyof L]: {
		readonly n: L[I]["n"];
		readonly t: Op extends "union"
			? Info<
					Common<[L[I]["t"], R[I & keyof R]["t"]], F>,
					L[I]["t"]["nullable"] extends true
						? true
						: R[I & keyof R]["t"]["nullable"]
				>
			: Op extends "intersect"
				? Info<
						Common<[L[I]["t"], R[I & keyof R]["t"]], F>,
						L[I]["t"]["nullable"] extends true
							? R[I & keyof R]["t"]["nullable"]
							: false
					>
				: Info<
						Common<[L[I]["t"], R[I & keyof R]["t"]], F>,
						L[I]["t"]["nullable"]
					>;
	};
};

/** ORDER BY after a UNION names result columns or positions. */
type CompoundOrder<
	O extends readonly Expr[],
	M extends readonly Cell[],
	I extends number = 0,
> = O[I] extends infer E extends Expr
	? E extends { readonly t: "num"; readonly v: infer V extends string }
		? PositionOk<V, M["length"], "order clause">
		: E extends {
					readonly t: "col";
					readonly tbl: null;
					readonly name: infer N extends string;
				}
			? N extends Lowercase<M[number]["n"]>
				? CompoundOrder<O, M, Next<I>>
				: SqlError<
						`Unknown column '${E["disp"]}' in 'order clause'`,
						NamedAt<E["disp"], "column">
					>
			: E extends { readonly t: "col" }
				? SqlError<
						`Unknown column '${E["disp"]}' in 'order clause'`,
						NamedAt<E["disp"], "column">
					>
				: CompoundOrder<O, M, Next<I>>
	: true;

type PositionOk<
	V extends string,
	N extends number,
	Where extends string,
> = V extends `${infer K extends number}`
	? `${K}` extends V
		? K extends 0
			? SqlError<`Unknown column '${V}' in '${Where}'`, NamedAt<V, "column">>
			: // A position from a literal may be any size, so only the result's
				// columns are counted: `K` is one of 1…N.
				`${K}` extends keyof [0, ...Tup<N>]
				? true
				: SqlError<`Unknown column '${V}' in '${Where}'`, NamedAt<V, "column">>
		: true
	: true;

type ProjectValues<
	B extends ValuesBody,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
> =
	ValuesRows<
		B["rows"],
		MkCtx<Env["db"], Env["scope"], Env["ctes"], "none", {}>,
		0,
		[]
	> extends infer R
		? R extends readonly [
				infer R0 extends readonly ColInfo[],
				...(readonly (readonly ColInfo[])[]),
			]
			? ValuesCells<R0, R, B, FlavorOf<Env["db"]>>
			: R
		: never;
type ValuesCells<
	R0 extends readonly ColInfo[],
	R extends readonly (readonly ColInfo[])[],
	B extends ValuesBody,
	F,
> = {
	[I in keyof R0]: {
		readonly n: F extends "mariadb"
			? ValueName<
					B["rows"][0][I & keyof B["rows"][0]],
					B["spans"][I & keyof B["spans"]]
				>
			: `column_${I & string}`;
		readonly t: Info<
			Common<Column<R, I>, F>,
			true extends Column<R, I>[number]["nullable"] ? true : false
		>;
	};
};
type ValueName<E, Span> = E extends {
	readonly t: "str";
	readonly v: infer V extends string;
}
	? V
	: Span extends string
		? Span
		: "";
type Column<R extends readonly (readonly ColInfo[])[], I> = {
	[K in keyof R]: R[K][I & keyof R[K]] & ColInfo;
};
type ValuesRows<
	Rows extends readonly (readonly Expr[])[],
	C extends MyCtx,
	I extends number,
	Acc extends readonly (readonly ColInfo[])[],
> = Rows[I] extends infer Row extends readonly Expr[]
	? TypeList<Row, C> extends infer X extends readonly ColInfo[]
		? ValuesRows<Rows, C, Next<I>, [...Acc, X]>
		: TypeList<Row, C>
	: Acc;

export type HasAgg<E, DB> = E extends { readonly t: string }
	? IsAggCall<E, DB> extends true
		? true
		: E extends { readonly t: "sub" | "exists" | "insub" | "quant" }
			? E extends
					| { readonly t: "insub"; readonly e: infer X }
					| { readonly t: "quant"; readonly l: infer X }
				? HasAgg<X, DB>
				: false
			: true extends HasAggIn<E, DB>
				? true
				: false
	: false;
type HasAggIn<E, DB> = {
	[K in keyof E]: E[K] extends readonly unknown[]
		? HasAggList<E[K], DB, 0>
		: E[K] extends { readonly t: string }
			? HasAgg<E[K], DB>
			: E[K] extends { readonly when: infer W; readonly then: infer V }
				? HasAgg<W, DB> | HasAgg<V, DB>
				: false;
}[keyof E];
type HasAggList<
	L extends readonly unknown[],
	DB,
	I extends number,
> = L[I] extends undefined
	? false
	: HasAgg<L[I], DB> extends true
		? true
		: L[I] extends { readonly when: infer W; readonly then: infer V }
			? HasAgg<W, DB> extends true
				? true
				: HasAgg<V, DB> extends true
					? true
					: HasAggList<L, DB, Next<I>>
			: HasAggList<L, DB, Next<I>>;

/** A column reference outside any aggregate (and outside subqueries). */
type BareCol<E, DB> = E extends {
	readonly t: "col";
	readonly disp: infer D extends string;
}
	? D
	: E extends { readonly t: string }
		? IsAggCall<E, DB> extends true
			? never
			: E extends { readonly t: "call"; readonly over: {} }
				? never
				: E extends { readonly t: "sub" | "exists" }
					? never
					: E extends
								| { readonly t: "insub"; readonly e: infer X }
								| { readonly t: "quant"; readonly l: infer X }
						? BareCol<X, DB>
						: BareColIn<E, DB>
		: never;
type BareColIn<E, DB> = {
	[K in keyof E]: E[K] extends readonly unknown[]
		? BareColList<E[K], DB>
		: E[K] extends { readonly t: string }
			? BareCol<E[K], DB>
			: never;
}[keyof E];
type BareColList<L extends readonly unknown[], DB> = L[number] extends infer X
	? X extends { readonly when: infer W; readonly then: infer V }
		? BareCol<W, DB> | BareCol<V, DB>
		: BareCol<X, DB>
	: never;

type AggModeOf<
	S extends SimpleSelect,
	OrderBy extends readonly Expr[],
	DB,
> = S["groupBy"] extends readonly Expr[]
	? "group"
	: HasAggList<S["targets"], DB, 0> extends true
		? "whole"
		: HasAggList<OrderBy, DB, 0> extends true
			? "whole"
			: S["having"] extends Expr
				? HasAgg<S["having"], DB> extends true
					? "whole"
					: "none"
				: "none";

/**
 * MySQL's default ONLY_FULL_GROUP_BY rejects a column outside an aggregate in
 * a query that aggregates without GROUP BY. MariaDB allows it.
 */
type FullGroupBy<
	Ts extends readonly Target[],
	DB,
	I extends number = 0,
> = Ts[I] extends infer T extends Target
	? T extends { readonly t: "expr"; readonly e: infer E }
		? BareCol<E, DB> extends infer D extends string
			? [D] extends [never]
				? FullGroupBy<Ts, DB, Next<I>>
				: SqlError<
						`In aggregated query without GROUP BY, expression #${Next<I>} of SELECT list contains nonaggregated column '${FirstName<D>}'; this is incompatible with sql_mode=only_full_group_by`,
						null
					>
			: never
		: SqlError<
				`In aggregated query without GROUP BY, expression #${Next<I>} of SELECT list contains nonaggregated column; this is incompatible with sql_mode=only_full_group_by`,
				null
			>
	: true;

/** Names of windows referenced as `OVER name`, outside subqueries. */
type WindowRefs<E> = E extends { readonly t: string }
	? E extends { readonly t: "sub" | "exists" | "insub" | "quant" }
		? E extends
				| { readonly t: "insub"; readonly e: infer X }
				| { readonly t: "quant"; readonly l: infer X }
			? WindowRefs<X>
			: never
		:
				| (E extends {
						readonly t: "call";
						readonly over: { readonly name: infer N extends string };
				  }
						? N
						: never)
				| WindowRefsIn<E>
	: never;
type WindowRefsIn<E> = {
	[K in keyof E]: E[K] extends readonly unknown[]
		? WindowRefsList<E[K]>
		: E[K] extends { readonly t: string }
			? WindowRefs<E[K]>
			: E[K] extends { readonly when: infer W; readonly then: infer V }
				? WindowRefs<W> | WindowRefs<V>
				: never;
}[keyof E];
type WindowRefsList<L extends readonly unknown[]> = L[number] extends infer X
	? X extends { readonly when: infer W; readonly then: infer V }
		? WindowRefs<W> | WindowRefs<V>
		: WindowRefs<X>
	: never;

type MissingWindow<S extends SimpleSelect, OrderBy extends readonly Expr[]> =
	| WindowRefsList<S["targets"]>
	| WindowRefsList<OrderBy> extends infer R
	? Exclude<R, S["windows"][number]["name"]> extends infer M extends string
		? [M] extends [never]
			? null
			: SqlError<`Window name '${FirstName<M>}' is not defined.`, null>
		: null
	: null;
type FirstName<U extends string> =
	import("../../../engine/object.js").Members<U> extends readonly [
		infer F extends string,
		...unknown[],
	]
		? F
		: U;

type ProjectSimple<
	S extends SimpleSelect,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	OrderBy extends readonly Expr[],
> =
	MissingWindow<S, OrderBy> extends infer W extends AnyErr
		? W
		: ProjectSimpleChecked<S, Env, OrderBy>;

type ProjectSimpleChecked<
	S extends SimpleSelect,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	OrderBy extends readonly Expr[],
> =
	BindFrom<S["from"], Env> extends infer L extends MyLevel
		? CheckWhere<
				S["where"],
				Env["db"],
				[L, ...Env["scope"]],
				Env["ctes"]
			> extends infer W
			? W extends AnyErr
				? W
				: (
							S["where"] extends Expr
								? NarrowKeys<S["where"]> extends infer Keys
									? NarrowLevel<L, Keys>
									: never
								: L
						) extends infer NL extends MyLevel
					? AggModeOf<S, OrderBy, Env["db"]> extends infer Mode extends AggMode
						? (
								Mode extends "whole"
									? FlavorOf<Env["db"]> extends "mysql"
										? FullGroupBy<S["targets"], Env["db"]>
										: true
									: true
							) extends infer FG extends AnyErr
							? FG
							: (
										Mode extends "whole"
											? MkCtx<
													Env["db"],
													[NullLevel<NL>, ...Env["scope"]],
													Env["ctes"],
													"whole",
													{},
													[NL, ...Env["scope"]]
												>
											: S["rollup"] extends true
												? MkCtx<
														Env["db"],
														[NullLevel<NL>, ...Env["scope"]],
														Env["ctes"],
														Mode,
														{},
														[NL, ...Env["scope"]]
													>
												: MkCtx<
														Env["db"],
														[NL, ...Env["scope"]],
														Env["ctes"],
														Mode,
														{}
													>
									) extends infer C extends MyCtx
								? ProjectTargets<S["targets"], NL, C, 0, []> extends infer Cells
									? Cells extends readonly Cell[]
										? CheckClauses<
												S,
												OrderBy,
												Cells,
												C,
												MkCtx<
													Env["db"],
													[L, ...Env["scope"]],
													Env["ctes"],
													"none",
													AliasMap<Cells>
												>
											> extends infer X
											? X extends AnyErr
												? X
												: Cells
											: never
										: Cells
									: never
								: never
						: never
					: never
			: never
		: BindFrom<S["from"], Env>;

/** WHERE sees the tables only: MySQL resolves no SELECT alias there. */
type CheckWhere<W, DB, S extends Scope, Ctes extends MyCteMap> = W extends Expr
	? HasAgg<W, DB> extends true
		? SqlError<"Invalid use of group function", null>
		: TypeOf<W, MkCtx<DB, S, Ctes, "none", {}>> extends infer X extends AnyErr
			? X
			: true
	: true;

type AliasMap<Cells extends readonly Cell[]> = {
	readonly [C in Cells[number] as Lowercase<C["n"]>]: MyColOf<
		C["t"]["type"],
		C["t"]["nullable"],
		C["n"]
	>;
};

/**
 * The cells of a target list. `L` is the level the targets read from, and
 * `Ret` marks a RETURNING list, which MariaDB names like a SELECT list.
 */
type ProjectTargets<
	Ts extends readonly Target[],
	L extends MyLevel,
	C extends MyCtx,
	I extends number,
	Acc extends readonly Cell[],
	Ret extends boolean = false,
> = Ts[I] extends infer T extends Target
	? T extends {
			readonly t: "star";
			readonly tbl: infer Tb extends string | null;
		}
		? (
				C["scope"] extends readonly [infer L0 extends MyLevel, ...unknown[]]
					? StarCells<L0, Tb>
					: never
			) extends infer S
			? S extends readonly Cell[]
				? ProjectTargets<Ts, L, C, Next<I>, [...Acc, ...S], Ret>
				: S
			: never
		: T extends {
					readonly t: "expr";
					readonly e: infer E extends Expr;
					readonly alias: infer A;
					readonly span: infer Sp extends string;
					readonly tail: infer Tl extends string;
				}
			? TypeOf<E, C> extends infer X extends ColInfo
				? ProjectTargets<
						Ts,
						L,
						C,
						Next<I>,
						[
							...Acc,
							{
								readonly n: A extends string
									? A
									: ExprName<E, Sp, FlavorOf<C["db"]>, Tl>;
								readonly t: Info<X["type"], X["nullable"]>;
							},
						],
						Ret
					>
				: TypeOf<E, C>
			: never
	: Acc;

/**
 * A column is named after the reference as written, a string after its
 * value, and other expressions after their text. MySQL keeps the whitespace
 * after an expression ending in a word, and names `'a' 'b'` after the first
 * string; MariaDB doesn't.
 */
export type ExprName<E, Sp extends string, F, Tail extends string> = E extends {
	readonly t: "col";
	readonly n: infer N extends string;
}
	? N
	: E extends {
				readonly t: "str";
				readonly v: infer V extends string;
				readonly f: infer First extends string;
			}
		? F extends "mariadb"
			? V
			: First
		: F extends "mariadb"
			? Sp
			: E extends { readonly t: "null" | "num" }
				? Sp
				: `${Sp}${Tail}`;

type CheckClauses<
	S extends SimpleSelect,
	OrderBy extends readonly Expr[],
	Cells extends readonly Cell[],
	C extends MyCtx,
	Plain extends MyCtx,
> = (
	S["groupBy"] extends readonly Expr[]
		? ClauseTerms<S["groupBy"], Plain, Cells["length"], "group statement">
		: true
) extends infer G extends AnyErr
	? G
	: (
				S["having"] extends Expr
					? TypeOf<S["having"], WithAliases<C, Plain["aliases"]>>
					: true
			) extends infer H
		? H extends AnyErr
			? H
			: ClauseTerms<
					OrderBy,
					WithAliases<C, Plain["aliases"]>,
					Cells["length"],
					"order clause"
				>
		: never;

type WithAliases<C extends MyCtx, A extends MyColMap> = {
	readonly [K in keyof C]: K extends "aliases" ? A : C[K];
} extends infer W extends MyCtx
	? W
	: never;

/** GROUP BY and ORDER BY terms: a position, or an expression over the tables and aliases. */
type ClauseTerms<
	O extends readonly Expr[],
	C extends MyCtx,
	N extends number,
	W extends "group statement" | "order clause",
	I extends number = 0,
> = O[I] extends infer E extends Expr
	? E extends { readonly t: "num"; readonly v: infer V extends string }
		? PositionOk<V, N, W> extends AnyErr
			? PositionOk<V, N, W>
			: ClauseTerms<O, C, N, W, Next<I>>
		: (W extends "group statement" ? HasAgg<E, C["db"]> : false) extends true
			? SqlError<"Can't group on aggregate", null>
			: TypeOf<E, C> extends AnyErr
				? TypeOf<E, C>
				: ClauseTerms<O, C, N, W, Next<I>>
	: true;
