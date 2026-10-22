import type { DefaultParamTypeMap, DefaultTypeMap } from "@typesql/core";

/**
 * The object node-postgres returns for an `interval` column (package `postgres-interval` 1.x,
 * wired up by `pg-types`). Fields are only present when non-zero; `toPostgres()` renders the
 * value back to Postgres syntax and `toISO()`/`toISOString()` produce an ISO 8601 duration.
 */
export interface PgInterval {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
  toPostgres(): string;
  toISO(): string;
  toISOString(): string;
}

/**
 * Canonical Postgres type name → TS type as `pg` 8.x returns it with its default type
 * parsers (`pg-types` 2.x, text protocol). Verified against `pg-types/lib/textParsers.js`:
 *
 *   number   int2 (21), int4 (23), oid (26), float4 (700), float8 (701)
 *   string   int8 (20) — `parseBigInteger` keeps the digits as a string, numeric (1700),
 *            money, text, varchar, bpchar, char, name, uuid, time, timetz, inet, cidr,
 *            macaddr, macaddr8, xml, bit, varbit, tsvector, tsquery, every range type,
 *            regclass/regtype/regproc, line/lseg/box/path/polygon — anything without a
 *            registered parser comes back as the raw text representation
 *   boolean  bool (16)
 *   Date     date (1082), timestamp (1114), timestamptz (1184)
 *            (`'infinity'`/`'-infinity'` come back as the numbers Infinity/-Infinity)
 *   unknown  json (114), jsonb (3802): `JSON.parse`d
 *   Buffer   bytea (17)
 *   object   interval (1186) → PgInterval, point (600) → { x, y }, circle (718) → { x, y, radius }
 *
 * `DefaultTypeMap` in core already describes pg; this interface only narrows the entries
 * that differ in detail (`Buffer` instead of `Uint8Array`, the interval object's methods,
 * `record`/`void` as their raw text).
 *
 * Arrays: core maps `T[]` element-wise (`TsTypeOf` checks the `[]` suffix before the map),
 * which matches pg for the array types that `pg-types` registers: bool[], bytea[], int2[],
 * int4[], int8[] (string[]), oid[], float4[], float8[], point[], bpchar[], varchar[], text[],
 * macaddr[], inet[], cidr[], date[], timestamp[], timestamptz[], interval[], json[], jsonb[],
 * uuid[], money[], time[], timetz[], numrange[]. Two kinds of mismatch exist and cannot be
 * expressed in this map:
 *   - `numeric[]` (1231) is parsed with `parseFloat` → `number[]` at runtime, while the
 *     element-wise type says `string[]`.
 *   - Array types without a registered parser come back as the raw `{...}` string, not an
 *     array: name[], "char"[], xml[], bit[], varbit[], tsvector[], tsquery[], circle[],
 *     line[], lseg[], box[], path[], polygon[], int4range[], int8range[], tsrange[],
 *     tstzrange[], daterange[], macaddr8[], regclass[]/regtype[]/regproc[], record[].
 * Register your own parser (`pg.types.setTypeParser`) or cast in SQL if you depend on these.
 */
export interface PgTypeMap extends Omit<DefaultTypeMap, "bytea" | "interval" | "record" | "void"> {
  /** What parameters accept on top of the row types. */
  $params: PgParamTypeMap;
  bytea: Buffer;
  interval: PgInterval;
  /** Anonymous `ROW(...)` results have no parser: raw text such as `"(1,foo)"`. */
  record: string;
  /** `void`-returning functions (`pg_sleep`) yield an empty string. */
  void: string;
}

/**
 * TS types `pg` parameters accept on top of the row type (`PgTypeMap["$params"]`). Verified
 * against `pg/lib/utils.js` (`prepareValue`, 8.x): a `Date` is sent as a timestamp with the
 * local offset, `Buffer`/typed arrays as bytea, a `bigint` or number with `toString()`, and
 * objects with `toPostgres()` (such as `PgInterval`) through it; Postgres parses the text.
 *
 *   int8, numeric, money          number | bigint | string
 *   date, timestamp, timestamptz  Date | string
 *   interval                      string, besides the `PgInterval` row type
 *   bytea                         Uint8Array, besides `Buffer`
 *
 * Plain objects are `JSON.stringify`d and arrays become Postgres array literals, so neither is
 * listed for other types.
 */
export interface PgParamTypeMap extends DefaultParamTypeMap {}
