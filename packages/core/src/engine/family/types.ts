// The scope model of the MySQL and SQLite engines: the relations a query
// reads, the CTEs it can name, and how it aggregates.
import type { ColInfo, Scope, ScopeItem } from "../types.js";

/** A column in scope: its type, and its name as written in the schema or query. */
export type Col = ColInfo & { readonly n: string };
export type ColOf<T, N, Name> = {
	readonly type: T;
	readonly nullable: N;
	readonly n: Name;
};
/** Columns by lowercase name. */
export type ColMap = { readonly [lc: string]: Col };

/**
 * A relation in scope (see `ScopeItem`): `order` lists its columns for `*`,
 * `orig` keeps its own columns when an outer join made them nullable, and
 * `subst` holds the columns a right `USING` join lists in `*` in place of
 * the skipped ones.
 */
export type Item = ScopeItem & {
	readonly cols: ColMap;
	readonly order: readonly string[];
	readonly orig?: ColMap;
	readonly subst?: ColMap;
};
export type Level = readonly Item[];

export type CteMap = {
	readonly [lc: string]: {
		readonly cols: ColMap;
		readonly order: readonly string[];
	};
};

/** `group`: GROUP BY; `whole`: aggregates without GROUP BY, one row. */
export type AggMode = "none" | "group" | "whole";

/**
 * What an expression is typed against. `aggScope` is the scope an aggregate's
 * arguments read, before grouping made columns nullable; `aliases` are the
 * SELECT aliases the clause may name.
 */
export type Ctx = {
	readonly db: unknown;
	readonly scope: Scope;
	readonly aggScope: Scope;
	readonly ctes: CteMap;
	readonly agg: AggMode;
	readonly inAgg: boolean;
	readonly aliases: ColMap;
};

export type MkCtx<
	DB,
	S extends Scope,
	Ctes extends CteMap,
	Agg extends AggMode = "none",
	Aliases extends ColMap = {},
	AggScope extends Scope = S,
	InAgg extends boolean = false,
> = {
	readonly db: DB;
	readonly scope: S;
	readonly aggScope: AggScope;
	readonly ctes: Ctes;
	readonly agg: Agg;
	readonly inAgg: InAgg;
	readonly aliases: Aliases;
};

/** The context of an aggregate's arguments. */
export type AggCtx<C extends Ctx> = MkCtx<
	C["db"],
	C["aggScope"],
	C["ctes"],
	"none",
	C["aliases"],
	C["aggScope"],
	true
>;

/** A result column: its name, type, and the name a derived table gives it (`d`). */
export type Cell = {
	readonly n: string;
	readonly t: ColInfo;
	readonly d?: string;
};

/** The environment of query binding, projection and parameter inference. */
export type QueryContext<DB, S extends Scope, Ctes extends CteMap> = {
	readonly db: DB;
	readonly scope: S;
	readonly ctes: Ctes;
};
