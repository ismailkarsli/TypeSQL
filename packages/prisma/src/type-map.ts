import type { Decimal, JsonValue } from "@prisma/client/runtime/client";

/**
 * Canonical Postgres type name → TS type as Prisma's `$queryRaw`/`$queryRawUnsafe` return it
 * with `@prisma/adapter-pg` (Prisma 7). Verified against `@prisma/adapter-pg` 7.10
 * (`fieldToColumnType`, its custom parsers), `client-engine-runtime`'s `serializeRawSql` and
 * `@prisma/client`'s `deserializeRawResult`:
 *
 *   number      int2, int4, float4, float8
 *   bigint      int8, oid
 *   Decimal     numeric, money (the currency symbol is stripped)
 *   Date        date, timestamp (read as UTC), timestamptz, and time/timetz (on 1970-01-01 UTC)
 *   Uint8Array  bytea
 *   JsonValue   json, jsonb
 *   string      text, varchar, bpchar, name, uuid, xml, inet, cidr, bit, varbit, enums and other
 *               user-defined types (`oid >= 16384`, e.g. citext)
 *
 * Arrays map element-wise. Types without an entry here (interval, macaddr, point and the other
 * geometric types, tsvector/tsquery, ranges, regclass, record, void, "char", ...) make the
 * adapter throw "Unsupported column type": cast them in SQL (`dur::text`). Arrays of enums and
 * other user-defined types arrive as the raw `{a,b}` text; cast them (`roles::text[]`).
 */
export interface PrismaTypeMap {
  bool: boolean;
  int2: number;
  int4: number;
  int8: bigint;
  oid: bigint;
  float4: number;
  float8: number;
  numeric: Decimal;
  money: Decimal;
  text: string;
  varchar: string;
  bpchar: string;
  name: string;
  uuid: string;
  xml: string;
  inet: string;
  cidr: string;
  bit: string;
  varbit: string;
  bytea: Uint8Array;
  date: Date;
  time: Date;
  timetz: Date;
  timestamp: Date;
  timestamptz: Date;
  json: JsonValue;
  jsonb: JsonValue;
}
