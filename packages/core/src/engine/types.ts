import type { Next } from "../sql/next.js";
export type ColInfo = { readonly type: string; readonly nullable: boolean };

export type ColMap = { readonly [name: string]: ColInfo };

export type ColEntry =
	| { readonly n: string; readonly t: ColInfo }
	| { readonly star: ColMap };
export type Cols = readonly ColEntry[];

export type ScopeItem = {
	readonly alias: string | null;
	readonly cols: ColMap;
	readonly skip: readonly string[];
};
export type ScopeLevel = readonly ScopeItem[];
export type Scope = readonly ScopeLevel[];

export type CteMap = { readonly [name: string]: ColMap };

export type Ctx = {
	readonly db: unknown;
	readonly scope: Scope;
	readonly ctes: CteMap;
	readonly grouped: boolean;
};

export type Info<T extends string, N extends boolean = false> = {
	readonly type: T;
	readonly nullable: N;
};

export type NullableMap<M extends ColMap> = {
	readonly [K in keyof M]: {
		readonly type: M[K]["type"];
		readonly nullable: true;
	};
};

export type ColsToMap<C extends Cols> = C extends readonly [
	{ readonly star: infer M extends ColMap },
]
	? M
	: C[number] extends { readonly n: string }
		? HasDuplicateNames<C, 0, never> extends false
			? UniqueMap<C>
			: PlainMap<C>
		: SlowMap<C, {}>;

// Unique names can be mapped directly; duplicates still use the last column.
type HasDuplicateNames<
	C extends Cols,
	I extends number,
	Seen extends string,
> = C[I] extends { readonly n: infer N extends string }
	? N extends Seen
		? true
		: HasDuplicateNames<C, Next[I], Seen | N>
	: false;
type UniqueMap<C extends Cols> = {
	[E in C[number] as E extends { readonly n: infer N extends string }
		? N
		: never]: E extends { readonly t: infer T } ? T : never;
};
type PlainMap<C extends Cols> = {
	[E in C[number] as E extends { readonly n: infer N extends string }
		? N
		: never]: E extends { readonly n: infer N extends string }
		? LastT<C, N>
		: never;
};
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
					N extends keyof Acc
						? Omit<Acc, N> & { readonly [K in N]: T }
						: Acc & { readonly [K in N]: T }
				>
			: never
	: { readonly [K in keyof Acc]: Acc[K] };

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

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
