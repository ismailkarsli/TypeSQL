import type { Schema, TypeRegistry } from "../schema/column.js";

/**
 * A type map converts canonical Postgres type names into TS types at the projection
 * boundary. Adapters ship their own (`PgTypeMap`, `PostgresJsTypeMap`); this default
 * matches `pg` with no custom type parsers.
 */
export interface DefaultTypeMap {
  bool: boolean;
  int2: number;
  int4: number;
  int8: string;
  float4: number;
  float8: number;
  numeric: string;
  money: string;
  text: string;
  varchar: string;
  bpchar: string;
  char: string;
  name: string;
  bytea: Uint8Array;
  date: Date;
  time: string;
  timetz: string;
  timestamp: Date;
  timestamptz: Date;
  interval: { years?: number; months?: number; days?: number; hours?: number; minutes?: number; seconds?: number; milliseconds?: number };
  uuid: string;
  json: unknown;
  jsonb: unknown;
  xml: string;
  inet: string;
  cidr: string;
  macaddr: string;
  macaddr8: string;
  bit: string;
  varbit: string;
  oid: number;
  regclass: string;
  regtype: string;
  regproc: string;
  point: { x: number; y: number };
  line: string;
  lseg: string;
  box: string;
  path: string;
  polygon: string;
  circle: { x: number; y: number; radius: number };
  tsvector: string;
  tsquery: string;
  int4range: string;
  int8range: string;
  numrange: string;
  tsrange: string;
  tstzrange: string;
  daterange: string;
  record: unknown;
  void: void;
  unknown: unknown;
}

export type TypeMap = { readonly [pgType: string]: unknown };

/** Enum registry of a schema (`DB["$types"]`), or `{}`. */
export type EnumsOf<DB> = DB extends { readonly $types: infer R extends TypeRegistry } ? R : {};

/**
 * Convert a canonical Postgres type name into a TS type.
 * An exact entry in the map wins (so a map may declare `"numeric[]": number[]`); otherwise
 * arrays map element-wise; enum names resolve through `DB["$types"]`; anything else is `unknown`.
 */
export type TsTypeOf<TM, DB, T extends string> =
  T extends keyof TM ? TM[T]
  : T extends `${infer E}[]` ? TsTypeOf<TM, DB, E>[]
  : T extends keyof EnumsOf<DB> ? EnumsOf<DB>[T]
  : unknown;

/** `{ type, nullable }` → TS type with `| null` when nullable. */
export type TsOf<TM, DB, T extends { type: string; nullable: boolean }> =
  T["type"] extends "null" ? null
  : T["nullable"] extends true ? TsTypeOf<TM, DB, T["type"]> | null : TsTypeOf<TM, DB, T["type"]>;

/**
 * The TS type a parameter of Postgres type `T` accepts. Like `TsTypeOf`, except that array
 * elements also accept `null`: a Postgres array can always hold NULLs, whatever the
 * nullability of the array itself.
 */
export type TsParamTypeOf<TM, DB, T extends string> =
  T extends keyof TM ? TM[T]
  : T extends `${infer E}[]` ? (TsParamTypeOf<TM, DB, E> | null)[]
  : T extends keyof EnumsOf<DB> ? EnumsOf<DB>[T]
  : unknown;

export type { Schema };
