import type * as Shared from "../../engine/cache.js";
import type { DbSnapshot, Same } from "../../engine/cache.js";
import type { HintIndex } from "./diagnostics.js";
import type { Analyze } from "./infer.js";
import type { FunctionCatalog } from "./typer/functions.js";

export type {
	Builtin,
	CacheEntry,
	DbSnapshot,
	DdlEffect,
	Missing,
} from "../../engine/cache.js";
export type { CallEntry } from "../../engine/contract.js";

export interface QueryCache {}
export interface QueryCacheKeys {}
export interface CacheSnapshots {}

export interface DdlCache {}
export interface DdlCacheKeys {}

export type CacheVersion = "19a89f093fa1";

export type Stale<DB, D extends DbSnapshot> =
	| (D["v"] extends CacheVersion ? never : "*")
	| {
			[W in keyof D["w"] & string]: Same<
				Relations<DB, W>,
				D["w"][W][0]
			> extends true
				? Same<Named<Functions<DB>, W>, D["w"][W][1]> extends true
					? Same<Named<FunctionCatalog, W>, D["w"][W][2]> extends true
						? never
						: W
					: W
				: W;
	  }[keyof D["w"] & string]
	| Shared.StaleExtras<DB, D, HintIndex<DB>>;

type Relations<DB, W extends string> = {
	[K in keyof DB & string as K extends `$${string}`
		? never
		: Lowercase<K> extends W
			? K
			: never]: DB[K];
};

type Named<O, W extends string> = {
	[K in keyof O & string as Lowercase<K> extends W ? K : never]: O[K];
};
type Functions<DB> = DB extends { readonly $functions: infer F } ? F : {};

interface SqliteStale extends Shared.StaleFn {
	readonly out: Stale<this["db"], Extract<this["d"], DbSnapshot>>;
}

export type { HintIndex } from "./diagnostics.js";

export type CallCached<DB, TM, Keys, Q extends string> = Shared.CallCached<
	SqliteStale,
	DB,
	TM,
	Keys,
	Q,
	CacheSnapshots
>;

export type CachedAnalysis<DB, Q extends string> = Shared.CachedAnalysis<
	SqliteStale,
	DB,
	Q,
	QueryCache,
	CacheSnapshots
>;

export type CacheAnalysis<DB, Q extends string> = Analyze<DB, Q>;

export type CachedDdl<DB, Q extends string> = Shared.CachedDdl<
	SqliteStale,
	DB,
	Q,
	DdlCache
>;
