// The scope model of the PostgreSQL engine.
import type { ColMap, Scope } from "../../engine/types.js";

export type CteMap = { readonly [name: string]: ColMap };

export type Ctx = {
	readonly db: unknown;
	readonly scope: Scope;
	readonly ctes: CteMap;
	readonly grouped: boolean;
};

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

/** The environment of query binding, projection and parameter inference. */
export type QueryContext<
	DB = unknown,
	S extends Scope = Scope,
	Ctes = CteMap,
> = {
	readonly db: DB;
	readonly scope: S;
	readonly ctes: Ctes;
};
