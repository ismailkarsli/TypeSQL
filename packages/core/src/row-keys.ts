/**
 * Row key casing: `createSql(executor, { rowKeys: "camelCase" })` renames the top-level keys of
 * every row, in the row type and at runtime, the way Kysely's `CamelCasePlugin` does by default
 * (and so the way `kysely-codegen --camel-case` names columns). Values, including JSON objects,
 * are left as they are.
 */

/** `"preserve"` (the default): rows keep the names Postgres gives the columns. `"camelCase"`: see `CamelCase`. */
export type RowKeys = "preserve" | "camelCase";

/** Options for `createSql(executor, options)`. */
export interface SqlOptions {
  readonly rowKeys?: RowKeys;
}

/**
 * snake_case → camelCase as Kysely's `createCamelCaseMapper()` does it: the first character is
 * kept, every other `_` is dropped, and a character that follows a `_` is upper-cased. Nothing
 * else changes, so `created_at` → `createdAt`, `address_line_1` → `addressLine1`,
 * `_private` → `_Private`, `a__b` → `aB`, `trailing_` → `trailing`, `HTTP_CODE` → `HTTPCODE`,
 * `fooBar` and `?column?` stay.
 */
export type CamelCase<S extends string> =
  S extends `${string}_${string}`
    ? S extends `${infer H}${infer R}` ? `${H}${CamelRest<R, H extends "_" ? true : false>}` : S
    : S;
type CamelRest<S extends string, Up extends boolean> =
  S extends `${infer A}_${infer B}`
    ? `${Up extends true ? Capitalize<A> : A}${CamelRest<B, true>}`
    : Up extends true ? Capitalize<S> : S;

/**
 * A row with its top-level keys camelCased. Two keys that map to the same name (`user_id` and
 * `userId`) become one key typed as the union of both; at runtime the later column wins.
 */
export type CamelCaseKeys<Row> = Row extends object ? { [K in keyof Row as K extends string ? CamelCase<K> : K]: Row[K] } : Row;

/** The row type a query has under a `rowKeys` option. */
export type KeyedRow<Row, K extends RowKeys> = K extends "camelCase" ? CamelCaseKeys<Row> : Row;

const cache = new Map<string, string>();

/** The runtime twin of `CamelCase<S>`. */
export function camelCase(key: string): string {
  if (!key.includes("_")) return key;
  let mapped = cache.get(key);
  if (mapped === undefined) {
    mapped = key[0]!;
    for (let i = 1; i < key.length; i++) {
      const c = key[i]!;
      if (c !== "_") mapped += key[i - 1] === "_" ? c.toUpperCase() : c;
    }
    if (cache.size >= 10_000) cache.clear();
    cache.set(key, mapped);
  }
  return mapped;
}

function camelCaseRow(row: unknown): unknown {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[camelCase(key)] = (row as Record<string, unknown>)[key];
  return out;
}

/** Rename the top-level keys of `rows` (a fresh array) as `rowKeys` says. */
export function applyRowKeys(rows: readonly unknown[], rowKeys: RowKeys | undefined): unknown[] {
  return rowKeys === "camelCase" ? rows.map(camelCaseRow) : Array.from(rows);
}
