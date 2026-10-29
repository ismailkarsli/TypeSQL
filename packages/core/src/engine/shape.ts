import type { MergeShapes } from "./json.js";
import type { ColMap } from "./types.js";

export type Shaped<B extends string, S> = B & { readonly shape: S };
export type AnyShaped = { readonly shape: unknown };

export type ObjShape<M extends ColMap> = { readonly k: "obj"; readonly m: M };

export type BaseOf<T extends string> = T extends "jsonb"
	? "jsonb"
	: T extends "json"
		? "json"
		: T extends "record"
			? "record"
			: T extends "lit"
				? "lit"
				: T;

export type StripShape<T extends string> = T extends AnyShaped
	? BaseOf<T>
	: T extends `${infer E}[]`
		? `${BaseOf<E>}[]`
		: T;

export type RowInfo<M extends ColMap> = {
	readonly type: Shaped<"record", ObjShape<M>>;
	readonly nullable: AllNullable<M>;
};
type AllNullable<M extends ColMap> = false extends M[keyof M]["nullable"]
	? false
	: true;

export type ShapedCommon<A extends string, B extends string> = [
	BaseOf<A>,
] extends [BaseOf<B>]
	? A extends Shaped<string, infer SA>
		? B extends Shaped<string, infer SB>
			? Shaped<BaseOf<A>, MergeShapes<SA, SB>>
			: BaseOf<A>
		: BaseOf<A>
	: "unknown";
