/**
 * Semantic types shared by binder, typer and projector.
 */

/** Type of an expression or column: canonical Postgres type name + nullability. */
export type ColInfo = { readonly type: string; readonly nullable: boolean };

/** Column name → info (a table's columns, a derived table's row, a CTE's row). */
export type ColMap = { readonly [name: string]: ColInfo };

/**
 * Ordered projection: one entry per target. A `*` / `t.*` target becomes a single
 * `{ star }` entry so column order is preserved without needing `keyof` → tuple.
 */
export type ColEntry =
	| { readonly n: string; readonly t: ColInfo }
	| { readonly star: ColMap };
export type Cols = readonly ColEntry[];

/**
 * A FROM item visible in a query level.
 * - `alias`: name for qualified references (`t.col`); `null` for the synthetic
 *   item that holds `USING` / NATURAL merged columns.
 * - `cols`: columns reachable by qualified reference.
 * - `skip`: columns hidden from unqualified lookup and `*` (merged by USING).
 */
export type ScopeItem = {
	readonly alias: string | null;
	readonly cols: ColMap;
	readonly skip: readonly string[];
};
/** One query level, in FROM order. */
export type ScopeLevel = readonly ScopeItem[];
/** Innermost level first; outer levels follow (correlated subqueries, LATERAL). */
export type Scope = readonly ScopeLevel[];

/** CTE name → its projected columns. */
export type CteMap = { readonly [name: string]: ColMap };

/** Analysis context threaded through typer and projector. */
export type Ctx = {
	readonly db: unknown;
	readonly scope: Scope;
	readonly ctes: CteMap;
	/** The current query level has a GROUP BY (aggregates cannot see an empty input). */
	readonly grouped: boolean;
	/** Function catalog, operator table etc. are global; type map is applied at the boundary. */
};

export type Info<T extends string, N extends boolean = false> = {
	readonly type: T;
	readonly nullable: N;
};

/** Mark every column of a map nullable (outer joins). */
export type NullableMap<M extends ColMap> = {
	readonly [K in keyof M]: {
		readonly type: M[K]["type"];
		readonly nullable: true;
	};
};

/**
 * Collapse an ordered projection into a name → info map (last duplicate wins).
 *
 * Fast paths: a lone `*` is its map; a projection without stars is a single
 * key-remapped mapped type (≈15 instantiations for 7 columns vs ≈700 for an
 * accumulator). Mixed star/plain projections fall back to the accumulator.
 */
export type ColsToMap<C extends Cols> = C extends readonly [
	{ readonly star: infer M extends ColMap }, // type-mutate: equivalent cond-false infer-bare – the lone-star fast path gives the map SlowMap would, and a star of Cols is a ColMap
]
	? M
	: C[number] extends { readonly n: string } // type-mutate: equivalent cond-false – PlainMap is a fast path: SlowMap gives the same map
		? PlainMap<C>
		: SlowMap<C, {}>;

type PlainMap<C extends Cols> = {
	[E in C[number] as E extends { readonly n: infer N extends string } // type-mutate: equivalent infer-bare – an entry's n of Cols is a string
		? N
		: never]: E extends { readonly n: infer N extends string }
		? LastT<C, N>
		: never;
};
/** Type of the last entry named `N` (Postgres row objects keep the last duplicate). */
type LastT<C extends Cols, N extends string> = C extends readonly [
	...infer R extends Cols,
	infer L,
]
	? L extends { readonly n: N; readonly t: infer T }
		? T
		: LastT<R, N>
	: never;

type SlowMap<C extends Cols, Acc> = C extends readonly [
	infer H,
	...infer R extends Cols,
]
	? H extends { readonly star: infer M }
		? SlowMap<R, Omit<Acc, keyof M> & M>
		: H extends {
					readonly n: infer N extends string;
					readonly t: infer T;
				}
			? SlowMap<
					R,
					N extends keyof Acc // type-mutate: equivalent cond-true – Omit of a key Acc does not have leaves Acc as it is
						? Omit<Acc, N> & { readonly [K in N]: T }
						: Acc & { readonly [K in N]: T }
				>
			: never
	: { readonly [K in keyof Acc]: Acc[K] };

/** Prettify an object type for display. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Build a typing context. Always use this alias (never an inline object type): identical
 * contexts are then the same type, so `TypeOf` results computed during projection are reused
 * by the parameter pass (−18% instantiations on the 100-query benchmark).
 */
export type MkCtx<
	DB,
	S extends Scope,
	Ctes extends CteMap,
	G extends boolean,
> = {
	readonly db: DB;
	readonly scope: S;
	readonly ctes: Ctes;
	readonly grouped: G;
};
