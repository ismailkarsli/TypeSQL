import type { Table, View } from "../../schema/column.js";
import type { TableRef } from "../ast.js";
import type { SqlError } from "../errors.js";
import type { ColInfo, ColMap, CteMap, Scope, ScopeItem, ScopeLevel } from "../types.js";

/**
 * Resolve a table reference to its column map.
 * Order: CTEs (unqualified only) → `DB[name]` (unqualified or `public.`) → `DB[schema][name]`.
 * Views (`{ $view: cols }`) unwrap to their columns.
 */
export type ResolveTable<DB, Ref extends TableRef, Ctes extends CteMap> =
  Ref["schema"] extends null
    ? Ref["name"] extends keyof Ctes ? Ctes[Ref["name"]]
    : LookupTable<DB, Ref["name"]>
  : Ref["schema"] extends "public" ? LookupTable<DB, Ref["name"]>
  : Ref["schema"] extends keyof DB ? LookupTable<DB[Ref["schema"]], Ref["name"], `${Ref["schema"]}.${Ref["name"]}`>
  : SqlError<`relation "${Ref["schema"]}.${Ref["name"]}" does not exist`, null>;

type LookupTable<NS, Name extends string, Display extends string = Name> =
  Name extends keyof NS
    ? NS[Name] extends View<infer Cols extends Table> ? TableCols<Cols>
    : NS[Name] extends Table ? TableCols<NS[Name]>
    : SqlError<`"${Display}" is not a table`, null>
    : SqlError<`relation "${Display}" does not exist`, null>;

/** Strip `hasDefault` so column infos are plain `{ type, nullable }`. */
export type TableCols<T extends Table> = { readonly [K in keyof T]: { readonly type: T[K]["type"]; readonly nullable: T[K]["nullable"] } };

/** Is the table (not view) writable? Used by DML. */
export type ResolveWritableTable<DB, Ref extends TableRef> =
  Ref["schema"] extends null | "public"
    ? Ref["name"] extends keyof DB
      ? DB[Ref["name"]] extends View<Table> ? SqlError<`cannot modify view "${Ref["name"]}"`, null>
      : DB[Ref["name"]] extends Table ? DB[Ref["name"]]
      : SqlError<`"${Ref["name"]}" is not a table`, null>
      : SqlError<`relation "${Ref["name"]}" does not exist`, null>
    : Ref["schema"] extends keyof DB
      ? Ref["name"] extends keyof DB[Ref["schema"]]
        ? DB[Ref["schema"]][Ref["name"]] extends View<Table> ? SqlError<`cannot modify view "${Ref["schema"]}.${Ref["name"]}"`, null>
        : DB[Ref["schema"]][Ref["name"]] extends Table ? DB[Ref["schema"]][Ref["name"]]
        : SqlError<`"${Ref["schema"]}.${Ref["name"]}" is not a table`, null>
        : SqlError<`relation "${Ref["schema"]}.${Ref["name"]}" does not exist`, null>
      : SqlError<`relation "${Ref["schema"]}.${Ref["name"]}" does not exist`, null>;

// ───────────────────────────── column resolution ─────────────────────────────

/**
 * Resolve `tbl.name` or bare `name` against the scope. Innermost level first; a bare
 * name must be unambiguous within the level where it is found.
 */
export type ResolveColumn<S extends Scope, Tbl extends string | null, Name extends string> =
  Tbl extends string ? ResolveQualified<S, Tbl, Name> : ResolveBare<S, Name>;

type ResolveQualified<S extends Scope, Tbl extends string, Name extends string> =
  S extends readonly [infer L extends ScopeLevel, ...infer Outer extends Scope]
    ? FindAlias<L, Tbl> extends infer Item
      ? Item extends ScopeItem
        ? Name extends keyof Item["cols"] ? Item["cols"][Name]
        : SqlError<`column ${Tbl}.${Name} does not exist`, null>
        : ResolveQualified<Outer, Tbl, Name>
      : never
    : SqlError<`missing FROM-clause entry for table "${Tbl}"`, null>;

type FindAlias<L extends ScopeLevel, Tbl extends string> =
  L extends readonly [infer I extends ScopeItem, ...infer R extends ScopeLevel]
    ? I["alias"] extends Tbl ? I : FindAlias<R, Tbl>
    : null;

type ResolveBare<S extends Scope, Name extends string> =
  S extends readonly [infer L extends ScopeLevel, ...infer Outer extends Scope]
    ? FindBare<L, Name, null> extends infer R
      ? R extends ColInfo ? R
      : R extends "ambiguous" ? SqlError<`column reference "${Name}" is ambiguous`, null>
      : ResolveBare<Outer, Name>
      : never
    : SqlError<`column "${Name}" does not exist`, null>;

/** Search a level for an unqualified name: info, `"ambiguous"`, or null. */
type FindBare<L extends ScopeLevel, Name extends string, Found extends ColInfo | null> =
  L extends readonly [infer I extends ScopeItem, ...infer R extends ScopeLevel]
    ? Name extends I["skip"][number] ? FindBare<R, Name, Found>
    : Name extends keyof I["cols"]
      ? Found extends ColInfo ? "ambiguous" : FindBare<R, Name, I["cols"][Name]>
      : FindBare<R, Name, Found>
    : Found;

/** Expand `*` (all items, in order, honoring `skip`) or `t.*` into a column map. */
export type ExpandStar<S extends Scope, Tbl extends string | null> =
  S extends readonly [infer L extends ScopeLevel, ...infer Outer extends Scope]
    ? Tbl extends string
      ? FindAlias<L, Tbl> extends infer Item
        ? Item extends ScopeItem ? Item["cols"] : ExpandStar<Outer, Tbl>
        : never
      : L extends readonly [] ? SqlError<"SELECT * with no tables specified is not valid", null>
      : L extends readonly [{ readonly cols: infer M extends ColMap; readonly skip: readonly [] }] ? M
      : ExpandAll<L, []>
    : Tbl extends string ? SqlError<`missing FROM-clause entry for table "${Tbl}"`, null> : SqlError<"SELECT * with no tables specified is not valid", null>;

/**
 * All visible columns of a level in FROM order. Duplicate names collapse like the row
 * object the drivers build: the last column of a name wins (`SELECT * FROM a, b` with an
 * `id` in both gives `b.id`).
 */
type ExpandAll<L extends ScopeLevel, Maps extends readonly ColMap[]> =
  L extends readonly [infer I extends ScopeItem, ...infer R extends ScopeLevel]
    ? ExpandAll<R, [...Maps, I["skip"] extends readonly [] ? I["cols"] : Omit<I["cols"], I["skip"][number]>]>
    : { readonly [K in AllKeys<Maps[number]>]: LastWith<Maps, K> };
type AllKeys<M> = M extends ColMap ? keyof M : never;
type LastWith<Maps extends readonly ColMap[], K> =
  Maps extends readonly [...infer R extends readonly ColMap[], infer M extends ColMap] ? (K extends keyof M ? M[K] : LastWith<R, K>) : never;

/** Names visible as output-column aliases (ORDER BY alias, GROUP BY alias). */
export type { ColMap, Scope, ScopeItem, ScopeLevel };
