import type { DefaultTypeMap } from "typesql";

/**
 * Canonical Postgres type name → TS type as postgres.js 3.x returns it with its default
 * parsers. Verified against `postgres/src/types.js` (3.4.9), which parses only:
 *
 *   number   int2 (21), int4 (23), oid (26), float4 (700), float8 (701)
 *   boolean  bool (16)
 *   Date     date (1082), timestamp (1114), timestamptz (1184) — all three via `new Date(x)`
 *   unknown  json (114), jsonb (3802): `JSON.parse`d
 *   Buffer   bytea (17)
 *
 * Everything else — including int8 (20) and numeric (1700) — is left as the text Postgres
 * sent, so it is `string`. Unlike `pg`, postgres.js has no parsers for interval, point and
 * circle, so those are strings here.
 *
 * This settles PLAN.md open question 3: postgres.js does return `Date` for `date` (and for
 * `timestamp`), the same as `pg`. Note that `date` has no time zone, and `new Date("2024-01-02")`
 * is parsed as UTC midnight (pg's `postgres-date` yields local midnight instead).
 *
 * Arrays: postgres.js fetches `pg_type` on connect (`fetch_types: true`, the default) and
 * registers an element-wise array parser for every array type, so core's `T[]` →
 * element-type[] mapping is exact (int8[] → string[], timestamptz[] → Date[], ...).
 */
export interface PostgresJsTypeMap extends Omit<DefaultTypeMap, "bytea" | "interval" | "point" | "circle" | "record" | "void"> {
  bytea: Buffer;
  /** No default parser: the Postgres text form, e.g. `"1 day 02:00:00"`. */
  interval: string;
  /** No default parser: `"(1,2)"`. */
  point: string;
  /** No default parser: `"<(1,2),3>"`. */
  circle: string;
  /** Anonymous `ROW(...)` results: raw text such as `"(1,foo)"`. */
  record: string;
  /** `void`-returning functions (`pg_sleep`) yield an empty string. */
  void: string;
}

/**
 * Type map for connections created with `postgres({ types: { bigint: postgres.BigInt } })`,
 * which registers a parser for int8 (20) that returns JS `bigint`. `count(*)`, `sum(int4)`
 * and `int8` columns become `bigint`; `int8[]` becomes `bigint[]`. Everything else is as in
 * `PostgresJsTypeMap`.
 */
export interface PostgresJsBigIntTypeMap extends Omit<PostgresJsTypeMap, "int8"> {
  int8: bigint;
}
