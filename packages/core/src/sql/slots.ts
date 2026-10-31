import type { CARRIED, Fragment, Query, TextType } from "../query.js";
import type { Skip } from "./inline.js";
import type { MaxParamStr, UnionList } from "./splice.js";

/** A value that can be interpolated into SQL text, and an item of sql.combine/and/or. */
export type Slottable =
	| Fragment<string, readonly unknown[], readonly unknown[]>
	| Query<unknown, readonly unknown[], string>;

export type SlotTexts<S> = {
	readonly [K in keyof S]: { readonly text: TextType<S[K]> };
};

export type CarriedOf<F> = F extends { readonly [CARRIED]?: infer C }
	? C extends readonly unknown[]
		? number extends C["length"]
			? Skip<MaxParamStr<TextType<F>>>
			: C
		: Skip<MaxParamStr<TextType<F>>>
	: Skip<MaxParamStr<TextType<F>>>;

export type SlotCarried<S> = { readonly [K in keyof S]: CarriedOf<S[K]> };

type IsUnion<T, U = T> = T extends unknown
	? [U] extends [T]
		? false
		: true
	: never;
type UnionSlots<S> = {
	[K in keyof S]: true extends IsUnion<S[K]> ? K : never;
}[keyof S];
type Expand<S, Ks extends readonly unknown[]> = Ks extends readonly [
	infer K extends keyof S,
	...infer R,
]
	? S[K] extends infer V
		? V extends unknown
			? Expand<Omit<S, K> & { readonly [P in K]: V }, R>
			: never
		: never
	: { readonly [K in keyof S]: S[K] };

/**
 * A slot holding a union of fragments (`flag ? a : b`) becomes one slot map per
 * member, so each fragment's text is checked with its own parameters.
 */
export type SlotVariants<S> = [UnionSlots<S>] extends [never]
	? S
	: Expand<S, UnionList<UnionSlots<S>>>;
