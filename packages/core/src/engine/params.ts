import type { Toks } from "./tokens.js";
import type { ColInfo } from "./types.js";

export type ParamMap = { readonly [n: number]: ColInfo };

export type ParamEntry<N extends number = number, T = ColInfo> = {
	readonly n: N;
	readonly t: T;
};

export type AddParam<M, N extends number, T> = M | ParamEntry<N, T>;

export type ParamsToMap<U> = {
	readonly [E in U as E extends { readonly n: infer N extends number }
		? N
		: never]: E extends { readonly t: infer T } ? T : never;
};

export type MaxParam<T extends Toks> = HighestParam<
	Extract<T[number], { readonly k: "$" }>["v"] | 0
>;

type HighestParam<N extends number, All extends number = N> = N extends number
	? Exclude<All, Before<N>> extends N
		? N
		: never
	: never;
type Before<N extends number, A extends number[] = []> = A["length"] extends N
	? A[number]
	: Before<N, [...A, A["length"]]>;

export type NullTest = {
	readonly type: "unknown";
	readonly nullable: true;
	readonly nullTest: true;
};
