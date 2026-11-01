import type { ColInfo, ColMap, Info } from "../../engine/types.js";
import type { Shaped } from "../../schema.js";
import type { MergeShapes } from "./json.js";

export type { Shaped };
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

/**
 * A column's array elements can be NULL (`array_agg` over a nullable column,
 * `ARRAY[x, NULL]`). Without it, like array columns, the elements are non-null.
 */
export type NullElems = { readonly nullElems: true };
export type HasNullElems<A> = A extends NullElems ? true : false;
/** `Info<T, N>`, marked when `T` is an array and `E` says its elements can be NULL. */
export type ArrInfo<
	T extends string,
	N extends boolean,
	E extends boolean,
> = true extends E
	? T extends `${string}[]`
		? { readonly type: T; readonly nullable: N; readonly nullElems: true }
		: Info<T, N>
	: Info<T, N>;
/** The columns of the outer side of a join, keeping their element nullability. */
export type NullableMap<M extends ColMap> = {
	readonly [K in keyof M]: M[K] extends NullElems
		? {
				readonly type: M[K]["type"];
				readonly nullable: true;
				readonly nullElems: true;
			}
		: { readonly type: M[K]["type"]; readonly nullable: true };
};
/** Whether `A` as an element can be NULL; an array passes on its own elements. */
export type ElemNull<A extends ColInfo> = A["type"] extends `${string}[]`
	? HasNullElems<A>
	: A["nullable"];

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
