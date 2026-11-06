import type { ColInfo, ColMap, Info, ScopeLevel } from "../../engine/types.js";
import type { Shaped, TsShape } from "../../schema.js";
import type { JsonT, TypeFact } from "../schema/type-facts.js";

export type { Shaped };
export type AnyShaped = { readonly shape: unknown };

/** An untyped string literal resolves to text. */
export type LitToText<T extends string> = T extends "lit" ? "text" : T;

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
export type ArrInfo<
	T extends string,
	N extends boolean,
	E extends boolean,
> = true extends E
	? T extends `${string}[]`
		? { readonly type: T; readonly nullable: N; readonly nullElems: true }
		: Info<T, N>
	: Info<T, N>;
/**
 * The columns made nullable (the outer side of a join, those a grouping set
 * leaves out), keeping their element nullability.
 */
export type NullableMap<M extends ColMap, Names = keyof M> = {
	readonly [K in keyof M]: K extends Names ? NullableCol<M[K]> : M[K];
};
type NullableCol<C extends ColInfo> = C extends NullElems
	? {
			readonly type: C["type"];
			readonly nullable: true;
			readonly nullElems: true;
		}
	: Info<C["type"], true>;
/**
 * A scope level with its columns, or those named `Names`, made nullable.
 * `orig` keeps the columns as the relation has them, which a condition
 * rejecting NULL in one of them restores (see NarrowLevel).
 */
export type NullableLevel<L extends ScopeLevel, Names = string> = {
	readonly [I in keyof L]: {
		readonly alias: L[I]["alias"];
		readonly cols: NullableMap<L[I]["cols"], Names>;
		readonly skip: L[I]["skip"];
		readonly orig: L[I] extends { readonly orig: infer O } ? O : L[I]["cols"];
	};
};
export type ElemNull<A extends ColInfo> = A["type"] extends `${string}[]`
	? HasNullElems<A>
	: A["nullable"];

/** A type as TypeSQL's own messages show it: its catalog name. */
export type StripShape<T extends string> = T extends AnyShaped
	? BaseOf<T>
	: T extends `${infer E}[]`
		? `${BaseOf<E>}[]`
		: T;

/** A type as PostgreSQL's messages show it (format_type). */
export type TypeDisplay<T extends string> = T extends AnyShaped
	? BaseOf<T>
	: T extends `${infer E}[]`
		? `${TypeDisplay<E>}[]`
		: TypeFact<T, "name", T>;

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

export type ArrShape<E> = { readonly k: "arr"; readonly e: E };

export type MergeShapes<A, B> = [B] extends [TsShape<[]>]
	? ArrayLike<A> extends true
		? A
		: A | B
	: [A] extends [TsShape<[]>]
		? ArrayLike<B> extends true
			? B
			: A | B
		: A | B;
type ArrayLike<S> = [S] extends [ArrShape<unknown>]
	? true
	: [S] extends [TsShape<infer T>]
		? [] extends T
			? true
			: false
		: false;

export type ShapeOfType<T extends string> =
	T extends Shaped<JsonT | "record", infer S> ? S : null;
