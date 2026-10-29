import type { EnumsOf } from "../type-map/index.js";
import type { ApplyPatch } from "./ddl/object.js";
import type { Analyze } from "./infer.js";
import type { AnyShaped, BaseOf } from "./shape.js";
import type { IsRelation, RelCols } from "./suggest.js";
import type { FunctionCatalog } from "./typer/catalog.js";

export interface QueryCache {}
export interface QueryCacheKeys {}
export interface CacheSnapshots {}

export interface DdlCache {}
export interface DdlCacheKeys {}

export type CacheVersion = "02e5e74e04c4";

export interface Missing {
	readonly "typesql.missing": true;
}
export interface Builtin {
	readonly "typesql.builtin": true;
}

export type DbSnapshot = {
	readonly v: string;
	readonly t: unknown;
	readonly w: {
		readonly [word: string]: readonly [
			rel: unknown,
			pg: unknown,
			fn: unknown,
			cat: unknown,
		];
	};
	readonly q: { readonly [pair: string]: unknown };
	readonly h?: unknown;
	readonly all?: unknown;
};

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
	| (D extends { readonly h: infer H }
			? Same<HintIndex<DB>, H> extends true
				? never
				: "!h"
			: never)
	| (D extends { readonly all: infer A }
			? Same<DB, A> extends true
				? never
				: "!all"
			: never);

export type Same<A, B> = Mutual<Expand<A>, Expand<B>>;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expand<T> = T extends (...args: never) => unknown
	? T
	: T extends { readonly k: "ts"; readonly v: unknown }
		? T
		: T extends object
			? { [K in keyof T]: Expand<T[K]> }
			: T;

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

export type CacheEntry = {
	readonly r: string;
	readonly a?: unknown;
	readonly c?: CallEntry;
};
export type CallEntry = {
	readonly m: unknown;
	readonly k: string;
	readonly g: unknown;
	readonly p: readonly unknown[];
	readonly q: unknown;
};

type GroupStale<DB, G, Snaps> = G extends keyof Snaps
	? Snaps[G] extends infer D extends DbSnapshot
		? Stale<DB, D>
		: "*"
	: "*";

export type ReadyCallTable<DB, TM, Keys, Snaps = CacheSnapshots> = [
	DB,
	TM,
	Keys,
] extends [infer D, infer M, infer K]
	? MergeCalls<ReadyCalls<D, M, K, Snaps>>
	: never;
type MergeCalls<T> = [T] extends [never] ? {} : UnionToIntersection<T>;
type ReadyCalls<DB, TM, Keys, Snaps> = {
	[G in keyof Snaps]: Snaps[G] extends {
		m: infer M;
		k: infer K;
		c: infer Q extends Record<string, CallEntry>;
	}
		? [Keys] extends [K]
			? Same<TM, M> extends true
				? [GroupStale<DB, G, Snaps>] extends [never]
					? Q
					: never
				: never
			: never
		: never;
}[keyof Snaps];

type FreshIn<DB, G, E, Snaps> =
	GroupStale<DB, G, Snaps> extends infer S
		? [S] extends [never]
			? E
			: E extends { readonly r: infer R }
				? [Extract<S, R>] extends [never]
					? E
					: never
				: never
		: never;

export type FreshVariants<
	DB,
	Q extends string,
	QC = QueryCache,
	Snaps = CacheSnapshots,
> = {
	[G in keyof QC]: Q extends keyof QC[G]
		? FreshIn<DB, G, QC[G][Q], Snaps> extends infer E
			? [E] extends [never]
				? never
				: [G, E]
			: never
		: never;
}[keyof QC];

export type OneOf<U> = IsUnion<U> extends false ? U : LastOf<U>;
type LastOf<U> =
	UnionToIntersection<U extends unknown ? (x: U) => void : never> extends (
		x: infer L,
	) => void
		? L
		: never;
type UnionToIntersection<U> = (
	U extends unknown
		? (u: U) => void
		: never
) extends (u: infer I) => void
	? I
	: never;

export type IsUnion<T, U = T> = T extends unknown
	? [U] extends [T]
		? false
		: true
	: never;

export type CachedAnalysis<
	DB,
	Q extends string,
	QC = QueryCache,
	Snaps = CacheSnapshots,
> =
	IsUnion<Q> extends true
		? never
		: Second<
				OneOf<
					FreshVariants<DB, Q, QC, Snaps> extends infer V
						? V extends [infer G, { readonly a: infer A }]
							? [G, A]
							: never
						: never
				>
			>;

export type Second<P> = [P] extends [never]
	? never
	: P extends [unknown, infer X]
		? X
		: never;

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

export type CachedDdl<DB, Q extends string, DC = DdlCache> =
	IsUnion<Q> extends true
		? never
		: OneOf<
				DdlVariants<Q, DC> extends infer V
					? V extends {
							readonly d: infer D extends DbSnapshot;
							readonly r: infer R;
						}
						? [Extract<Stale<DB, D>, R>] extends [never]
							? DdlResult<DB, V>
							: never
						: never
					: never
			>;
type DdlVariants<Q extends string, DC> = {
	[F in keyof DC]: Q extends keyof DC[F] ? DC[F][Q] : never;
}[keyof DC];
type DdlResult<DB, V> = V extends { readonly e: infer E }
	? E
	: V extends { readonly s: infer S; readonly x: infer X }
		? ApplyPatch<DB, S, X>
		: never;

export type DdlEffect<Before, After> = {
	readonly s: {
		[K in keyof After as K extends keyof Before
			? Same<Before[K], After[K]> extends true
				? never
				: K
			: K]: After[K];
	};
	readonly x: Exclude<keyof Before, keyof After>;
};
