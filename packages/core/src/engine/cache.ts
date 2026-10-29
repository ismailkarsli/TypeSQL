import type { CallEntry } from "./contract.js";
import type { ApplyPatch } from "./object.js";

export interface Missing {
	readonly "typesql.missing": true;
}
export interface Builtin {
	readonly "typesql.builtin": true;
}

export type DbSnapshot = {
	readonly v: string;
	readonly t: unknown;
	readonly w: { readonly [word: string]: readonly unknown[] };
	readonly q: { readonly [pair: string]: unknown };
	readonly h?: unknown;
	readonly all?: unknown;
};

export interface StaleFn {
	readonly db: unknown;
	readonly d: unknown;
	readonly out: unknown;
}

type StaleOf<F extends StaleFn, DB, D extends DbSnapshot> = (F & {
	readonly db: DB;
	readonly d: D;
})["out"];

export type Same<A, B> = Mutual<Expand<A>, Expand<B>>;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expand<T> = T extends (...args: never) => unknown
	? T
	: T extends { readonly k: "ts"; readonly v: unknown }
		? T
		: T extends object
			? { [K in keyof T]: Expand<T[K]> }
			: T;

export type StaleExtras<DB, D extends DbSnapshot, Hints> =
	| (D extends { readonly h: infer H }
			? Same<Hints, H> extends true
				? never
				: "!h"
			: never)
	| (D extends { readonly all: infer A }
			? Same<DB, A> extends true
				? never
				: "!all"
			: never);

export type CacheEntry = {
	readonly r: string;
	readonly a?: unknown;
	readonly c?: CallEntry;
};

export type CallCached<
	F extends StaleFn,
	DB,
	TM,
	Keys,
	Q extends string,
	Snaps,
> = [keyof Snaps] extends [never]
	? never
	: IsUnion<Q> extends true
		? never
		: [Q] extends [keyof ReadyCallTable<F, DB, TM, Keys, Snaps>]
			? ReadyCallTable<F, DB, TM, Keys, Snaps>[Q]
			: never;

type GroupStale<F extends StaleFn, DB, G, Snaps> = G extends keyof Snaps
	? Snaps[G] extends infer D extends DbSnapshot
		? StaleOf<F, DB, D>
		: "*"
	: "*";

export type ReadyCallTable<F extends StaleFn, DB, TM, Keys, Snaps> = [
	DB,
	TM,
	Keys,
] extends [infer D, infer M, infer K]
	? MergeCalls<ReadyCalls<F, D, M, K, Snaps>>
	: never;
type MergeCalls<T> = [T] extends [never] ? {} : UnionToIntersection<T>;
type ReadyCalls<F extends StaleFn, DB, TM, Keys, Snaps> = {
	[G in keyof Snaps]: Snaps[G] extends {
		m: infer M;
		k: infer K;
		c: infer Q extends Record<string, CallEntry>;
	}
		? [Keys] extends [K]
			? Same<TM, M> extends true
				? [GroupStale<F, DB, G, Snaps>] extends [never]
					? Q
					: never
				: never
			: never
		: never;
}[keyof Snaps];

type FreshIn<F extends StaleFn, DB, G, E, Snaps> =
	GroupStale<F, DB, G, Snaps> extends infer S
		? [S] extends [never]
			? E
			: E extends { readonly r: infer R }
				? [Extract<S, R>] extends [never]
					? E
					: never
				: never
		: never;

export type FreshVariants<
	F extends StaleFn,
	DB,
	Q extends string,
	QC,
	Snaps,
> = {
	[G in keyof QC]: Q extends keyof QC[G]
		? FreshIn<F, DB, G, QC[G][Q], Snaps> extends infer E
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

export type CachedAnalysis<F extends StaleFn, DB, Q extends string, QC, Snaps> =
	IsUnion<Q> extends true
		? never
		: Second<
				OneOf<
					FreshVariants<F, DB, Q, QC, Snaps> extends infer V
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

export type CachedDdl<F extends StaleFn, DB, Q extends string, DC> =
	IsUnion<Q> extends true
		? never
		: OneOf<
				DdlVariants<Q, DC> extends infer V
					? V extends {
							readonly d: infer D extends DbSnapshot;
							readonly r: infer R;
						}
						? [Extract<StaleOf<F, DB, D>, R>] extends [never]
							? DdlResult<DB, V>
							: never
						: never
					: never
			>;
type DdlVariants<Q extends string, DC> = {
	[K in keyof DC]: Q extends keyof DC[K] ? DC[K][Q] : never;
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
