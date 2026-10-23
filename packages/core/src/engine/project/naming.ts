import type { Expr, SelectStmt } from "../ast.js";
import type { Cols, Ctx } from "../types.js";
import type { ProjectSelect } from "./select.js";

/**
 * Postgres output column naming (`FigureColnameInternal`), verified against PostgreSQL 17.
 *
 * Postgres ranks a candidate name by strength: 2 for a "real" name, 1 for a fallback that
 * an enclosing cast or CASE may replace, 0 for none (`?column?`). Here `Fig<E>` returns a
 * string for strength 2, `{ weak: name }` for strength 1 and `null` for 0.
 *
 *   strength 2: t.col, col → col | f(...) → f (incl. count(*), current_date, coalesce,
 *     nullif, greatest, least) | EXISTS → exists | ARRAY[...] / ARRAY(SELECT) → array |
 *     ROW(...) / (a, b) → row | (SELECT c ...) → c, or ?column? when that column is unnamed
 *     | EXTRACT → extract | POSITION → position | SUBSTRING → substring | TRIM → btrim / ltrim / rtrim (by side) |
 *     OVERLAY → overlay | AT TIME ZONE → timezone | (e).f → f | XMLELEMENT → xmlelement (and
 *     xmlconcat, xmlforest, xmlpi, xmlroot, xmlparse, xmlserialize; XMLEXISTS is a call) | SQL/JSON functions
 *     (JSON_OBJECT(…), JSON_VALUE(…), JSON_ARRAYAGG(…), …) → their lowercase name
 *   e[i], e[lo:hi], e COLLATE c → name of e (any strength)
 *   e::T / CAST(e AS T) → name of e if strong, else T's canonical name with any array
 *     suffix stripped, weak (`1::int4::int8` → int8, `now()::date::text` → now)
 *   typed literal `T 'x'` → T, weak (it is a cast of a constant: `interval '1 day'::text` → text)
 *   CASE → the ELSE branch's name if strong (`CASE ... ELSE id END` → id), else case, weak
 *     (`(CASE WHEN x THEN 1 END)::text` → text)
 *   literals, params, operators (incl. -1, NOT x, x IS NULL, x IN (...)) → ?column?
 *
 */
export type ColumnName<E extends Expr, Alias extends string | null, C extends Ctx> =
  Alias extends string ? Alias
  : Fig<E, C> extends infer N ? (N extends string ? N : N extends { readonly weak: infer W extends string } ? W : "?column?") : never;

type Weak<N extends string> = { readonly weak: N };

type Fig<E extends Expr, C extends Ctx> =
  E extends { readonly t: "col" } ? E["name"]
  : E extends { readonly t: "call" } ? E["name"]
  : E extends { readonly t: "cast" } ? (Fig<E["e"], C> extends infer N ? (N extends string ? N : Weak<StripArray<E["to"]>>) : never)
  : E extends { readonly t: "typed" } ? Weak<E["type"]>
  : E extends { readonly t: "case" } ? (E["else"] extends Expr ? (Fig<E["else"], C> extends infer N ? (N extends string ? N : Weak<"case">) : never) : Weak<"case">)
  : E extends { readonly t: "exists" } ? "exists"
  : E extends { readonly t: "array" | "arraysub" } ? "array"
  : E extends { readonly t: "row" } ? "row"
  : E extends { readonly t: "sub" } ? SubName<E["q"], C>
  : E extends { readonly t: "extract" } ? "extract"
  : E extends { readonly t: "position" } ? "position"
  : E extends { readonly t: "substring" } ? "substring"
  : E extends { readonly t: "trim" } ? (E["side"] extends "leading" ? "ltrim" : E["side"] extends "trailing" ? "rtrim" : "btrim")
  : E extends { readonly t: "overlay" } ? "overlay"
  : E extends { readonly t: "attz" } ? "timezone"
  : E extends { readonly t: "idx" | "slice" | "collate" } ? Fig<E["e"], C>
  : E extends { readonly t: "field" } ? E["name"]
  : E extends { readonly t: "xml" } ? (E["op"] extends "document" ? null : `xml${E["op"]}`)
  : E extends { readonly t: "jsonfn" | "jsonagg" } ? E["fn"]
  : null;

type StripArray<T extends string> = T extends `${infer B}[]` ? B : T;

/** A scalar subquery is named after its single column, which is `?column?` when unnamed (still strong). */
type SubName<Q extends SelectStmt, C extends Ctx> =
  ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
    ? R extends Cols ? (R extends readonly [{ readonly n: infer N extends string }, ...unknown[]] ? N : "?column?") : "?column?"
    : never;
