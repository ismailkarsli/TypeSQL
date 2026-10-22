import type { ColMap } from "./types.js";

/**
 * Structured values: whole-row references (`t`, `t.*` used as a value) and, see json.ts, JSON
 * built in SQL or read from typed JSON columns.
 *
 * The engine types every expression by a canonical type name (`ColInfo["type"]` is a string).
 * A structured value keeps its name and carries its structure as a brand:
 * `Shaped<"record", { k: "obj"; m: cols }>` is `"record" & { readonly shape: … }`. A branded
 * name is a subtype of the plain one, so every rule that only looks at the name
 * (`T extends "jsonb"`, overload matching, `${T}[]`) treats it like the plain type; the few
 * rules that change a value's structure strip the brand (`StripShape`) or compute a new one.
 */
export type Shaped<B extends string, S> = B & { readonly shape: S };
/** Any branded type name. */
export type AnyShaped = { readonly shape: unknown };

/** A row or object: column / key name → SQL type. */
export type ObjShape<M extends ColMap> = { readonly k: "obj"; readonly m: M };

/** The plain name under a brand (`json`, `jsonb`, `record`, or `lit` for JSON-looking string literals). */
export type BaseOf<T extends string> =
  T extends "jsonb" ? "jsonb" : T extends "json" ? "json" : T extends "record" ? "record" : T extends "lit" ? "lit" : T;

/** Drop the brand of a type name (and of an array's element type). */
export type StripShape<T extends string> =
  T extends AnyShaped ? BaseOf<T>
  : T extends `${infer E}[]` ? (E extends AnyShaped ? `${BaseOf<E>}[]` : T)
  : T;

/**
 * Type of a whole-row reference: the row's columns as an object shape. Nullable only when every
 * column is: the null-extended side of an outer join makes every column nullable, and a row
 * that has a NOT NULL column cannot be the NULL row. (A table whose columns are all nullable is
 * therefore typed nullable too.)
 */
export type RowInfo<M extends ColMap> = { readonly type: Shaped<"record", ObjShape<M>>; readonly nullable: AllNullable<M> };
type AllNullable<M extends ColMap> = [keyof M] extends [never] ? false : false extends M[keyof M]["nullable"] ? false : true;

/**
 * Common type of two names where at least one may be branded (`CommonLit`'s fallback): the
 * same base type merges the shapes (a branch is either one), a plain value of that type drops
 * the shape (it could hold anything), different base types have no common type.
 */
export type ShapedCommon<A extends string, B extends string> =
  [BaseOf<A>] extends [BaseOf<B>]
    ? [BaseOf<B>] extends [BaseOf<A>]
      ? A extends Shaped<string, infer SA> ? (B extends Shaped<string, infer SB> ? Shaped<BaseOf<A>, SA | SB> : BaseOf<A>) : BaseOf<A>
      : "unknown"
    : "unknown";
