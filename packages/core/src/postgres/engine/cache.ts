import type * as Shared from "../../engine/cache.js";
import type { Builtin, DbSnapshot, Missing, Same } from "../../engine/cache.js";
import type { EnumsOf } from "../type-map/index.js";
import type { Analyze } from "./infer.js";
import type { AnyShaped, BaseOf } from "./shape.js";
import type { IsRelation, RelCols } from "./suggest.js";
import type { FunctionCatalog } from "./typer/catalog.js";

export type {
	Builtin,
	CacheEntry,
	DbSnapshot,
	DdlEffect,
	IsUnion,
	Missing,
	OneOf,
	Same,
	Second,
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
	| (Same<EnumsOf<DB>, D["t"]> extends true ? never : "*")
	| {
			[W in keyof D["w"] & string]: WordFresh<DB, W, D["w"][W]> extends true
				? never
				: W;
	  }[keyof D["w"] & string]
	| {
			[P in keyof D["q"] & string]: Same<PairOf<DB, P>, D["q"][P]> extends true
				? never
				: P;
	  }[keyof D["q"] & string]
	| Shared.StaleExtras<DB, D, HintIndex<DB>>;

interface PgStale extends Shared.StaleFn {
	readonly out: Stale<this["db"], Extract<this["d"], DbSnapshot>>;
}

type WordFresh<DB, W extends string, S extends readonly unknown[]> =
	Same<W extends keyof DB ? DB[W] : Missing, S[0]> extends false
		? false
		: Same<PgRel<DB, W>, S[1]> extends false
			? false
			: Same<SchemaFn<DB, W>, S[2]> extends false
				? false
				: S[3] extends Builtin
					? true
					: Same<
							W extends keyof FunctionCatalog ? FunctionCatalog[W] : Missing,
							S[3]
						>;

type PgRel<DB, W extends string> = DB extends { readonly pg_catalog: infer PC }
	? W extends keyof PC
		? PC[W]
		: Missing
	: Missing;
type SchemaFn<DB, W extends string> = DB extends {
	readonly $functions: infer F;
}
	? W extends keyof F
		? F[W]
		: Missing
	: Missing;
type PairOf<DB, P extends string> = P extends `${infer A}.${infer B}`
	? A extends keyof DB
		? B extends keyof DB[A]
			? DB[A][B]
			: Missing
		: Missing
	: Missing;

export type HintIndex<DB> = {
	[K in keyof DB & string]: K extends "$types" | "$functions"
		? never
		: IsRelation<DB[K]> extends true
			? K | `${K}.${RelCols<DB[K]>}`
			: {
					[R in keyof DB[K] & string]: IsRelation<DB[K][R]> extends true
						? R | `${R}.${RelCols<DB[K][R]>}`
						: never;
				}[keyof DB[K] & string];
}[keyof DB & string];

export type CallCached<DB, TM, Keys, Q extends string> = Shared.CallCached<
	PgStale,
	DB,
	TM,
	Keys,
	Q,
	CacheSnapshots
>;

export type ReadyCallTable<
	DB,
	TM,
	Keys,
	Snaps = CacheSnapshots,
> = Shared.ReadyCallTable<PgStale, DB, TM, Keys, Snaps>;

export type FreshVariants<
	DB,
	Q extends string,
	QC = QueryCache,
	Snaps = CacheSnapshots,
> = Shared.FreshVariants<PgStale, DB, Q, QC, Snaps>;

export type CachedAnalysis<
	DB,
	Q extends string,
	QC = QueryCache,
	Snaps = CacheSnapshots,
> = Shared.CachedAnalysis<PgStale, DB, Q, QC, Snaps>;

export type CacheAnalysis<DB, Q extends string> =
	Analyze<DB, Q> extends infer R
		? R extends {
				readonly stmt: unknown;
				readonly kind: infer K;
				readonly cols: infer C;
				readonly params: infer P;
				readonly max: infer M;
				readonly names: infer N;
			}
			? {
					readonly kind: K;
					readonly cols: Plain<C>;
					readonly params: Plain<P>;
					readonly max: M;
					readonly names: N;
				}
			: R
		: never;

export type Plain<T> = T extends { readonly k: "ts"; readonly v: infer V }
	? { readonly k: "ts"; readonly v: V }
	: T extends string
		? T extends AnyShaped
			? BaseOf<T> & { readonly shape: Plain<T["shape"]> }
			: T
		: T extends object
			? { [K in keyof T]: Plain<T[K]> }
			: T;

export type CachedDdl<DB, Q extends string, DC = DdlCache> = Shared.CachedDdl<
	PgStale,
	DB,
	Q,
	DC
>;
