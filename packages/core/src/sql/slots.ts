import type { CARRIED, Fragment, Query, TextType } from "../query.js";
import type { Skip } from "./inline.js";
import type { MaxParamStr, SlotNames } from "./splice.js";

export type Slottable =
	| Fragment<string, readonly unknown[], readonly unknown[]>
	| Query<unknown, readonly unknown[], string>;

export type SlotMap = { readonly [name: string]: Slottable };

export type SlotsFor<Q extends string, S> = {
	readonly [K in SlotNames<Q>]: K extends keyof S ? S[K] : Slottable;
};

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
