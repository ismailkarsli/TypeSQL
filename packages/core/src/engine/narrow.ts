import type { Nx } from "./parse.js";
import type { ColMap, ScopeItem, ScopeLevel } from "./types.js";

export type NarrowKeys<E> = AndKeys<E, never>;

type AndKeys<E, Acc> = E extends {
	readonly t: "bin";
	readonly op: "and";
	readonly l: unknown;
	readonly r: unknown;
}
	? AndKeys<E["l"], Acc | AndKeys<E["r"], never>>
	: Acc | ConjunctKeys<E>;

type StrictBoolOp =
	| "="
	| "=="
	| "<"
	| ">"
	| "<="
	| ">="
	| "<>"
	| "!="
	| "~"
	| "~*"
	| "!~"
	| "!~*"
	| "~~"
	| "~~*"
	| "!~~"
	| "!~~*"
	| "@>"
	| "<@"
	| "&&"
	| "?"
	| "?|"
	| "?&"
	| "@@"
	| "@?";

type ConjunctKeys<E> = E extends { readonly t: "col" }
	? ColKey<E>
	: E extends {
				readonly t: "is";
				readonly e: infer X;
				readonly what: infer W;
				readonly not: infer N;
			}
		? W extends "null"
			? N extends true
				? ColKey<X>
				: never
			: W extends "true" | "false"
				? N extends false
					? ColKey<X>
					: never
				: never
		: E extends {
					readonly t: "bin";
					readonly op: infer Op;
					readonly l: infer L;
					readonly r: infer R;
				}
			? Op extends StrictBoolOp
				? ColKey<L> | ColKey<R>
				: never
			: E extends {
						readonly t: "like";
						readonly e: infer X;
						readonly pat: infer P;
					}
				? ColKey<X> | ColKey<P>
				: E extends {
							readonly t: "between";
							readonly e: infer X;
							readonly lo: infer Lo;
							readonly hi: infer Hi;
							readonly not: infer N;
						}
					? N extends true
						? ColKey<X>
						: ColKey<X> | ColKey<Lo> | ColKey<Hi>
					: E extends { readonly t: "in" | "insub"; readonly e: infer X }
						? ColKey<X>
						: E extends { readonly t: "quant"; readonly l: infer X }
							? ColKey<X>
							: never;

type ColKey<E> = E extends {
	readonly t: "col";
	readonly tbl: infer Tb;
	readonly name: infer N;
}
	? readonly [Tb, N]
	: E extends { readonly t: "cast" | "collate"; readonly e: infer X }
		? ColKey<X>
		: never;

export type UsingKeys<U extends string> = U extends string
	? readonly [null, U]
	: never;

export type NarrowLevel<L extends ScopeLevel, Keys> = [Keys] extends [never]
	? L
	: AnyHit<L, Keys, 0> extends true
		? {
				readonly [I in keyof L]: L[I] extends ScopeItem
					? true extends KeyHits<L[I], Keys>
						? NarrowItem<L[I], Keys>
						: L[I]
					: L[I];
			}
		: L;

type Hit<A, K, Skip, Keys> = readonly [A, K] extends Keys
	? true
	: K extends Skip
		? false
		: readonly [null, K] extends Keys
			? true
			: false;

type AnyHit<
	L extends ScopeLevel,
	Keys,
	I extends number,
> = L[I] extends ScopeItem
	? true extends KeyHits<L[I], Keys>
		? true
		: AnyHit<L, Keys, Nx<I>>
	: false;
type KeyHits<It extends ScopeItem, Keys> = Keys extends readonly [
	unknown,
	infer K extends string,
]
	? string extends K
		? true
		: K extends keyof It["cols"]
			? It["cols"][K]["nullable"] extends true
				? Hit<It["alias"], K, It["skip"][number], Keys>
				: false
			: false
	: false;

type NarrowItem<It extends ScopeItem, Keys> = {
	readonly [P in keyof It]: P extends "cols"
		? NarrowCols<It["cols"], It["alias"], It["skip"][number], Keys>
		: It[P];
};
type NarrowCols<M extends ColMap, A, Skip, Keys> = {
	readonly [K in keyof M]: M[K]["nullable"] extends true
		? Hit<A, K, Skip, Keys> extends true
			? NotNull<M[K]>
			: M[K]
		: M[K];
};
type NotNull<C> = {
	readonly [P in keyof C]: P extends "nullable" ? false : C[P];
};
