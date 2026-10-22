import type { PgTypeName } from "./pg-types.js";
import type { Shaped } from "../engine/shape.js";
import type { TsShape } from "../engine/json.js";

/**
 * Column descriptor. Columns are declared with Postgres type names, not TS types,
 * because expression typing needs SQL types; the type map converts at the boundary.
 */
export type ColDesc = {
  readonly type: string;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
};

export type Col<T extends PgTypeName | (string & {}), Flags extends Partial<ColDesc> = {}> = {
  readonly type: T;
  readonly nullable: Flags extends { nullable: true } ? true : false;
  readonly hasDefault: Flags extends { hasDefault: true } ? true : false;
};

/** Nullable column (no NOT NULL). */
export type Nullable<T extends PgTypeName | (string & {})> = Col<T, { nullable: true }>;
/** Column with a default / identity / serial: optional on INSERT. */
export type Generated<T extends PgTypeName | (string & {})> = Col<T, { hasDefault: true }>;
/** Nullable column that also has a default. */
export type NullableGenerated<T extends PgTypeName | (string & {})> = Col<T, { nullable: true; hasDefault: true }>;
/** Array column: `Arr<"int4">` is `int4[]`. */
export type Arr<T extends PgTypeName | (string & {}), Flags extends Partial<ColDesc> = {}> = Col<`${T}[]`, Flags>;
/**
 * JSON column holding values of the TS type `T` (jsonb unless `Base` is `"json"`). It is still
 * jsonb for operators and functions; rows read `T`, `->` / `#>` / subscripts index into `T`, and
 * parameters written to it take `T` (pass them with `sql.json(value)`).
 */
export type Json<T, Flags extends Partial<ColDesc> = {}, Base extends "json" | "jsonb" = "jsonb"> = Col<Shaped<Base, TsShape<T>>, Flags>;
/** Enum-typed column. The enum's values live in `DB["$types"][Name]`. */
export type Enum<Name extends string, Flags extends Partial<ColDesc> = {}> = Col<Name, Flags>;

/** A table: column name → descriptor. */
export type Table = { readonly [column: string]: ColDesc };

/** A view: read-only table. `INSERT INTO view` is an error. */
export type View<Cols extends Table> = { readonly $view: Cols };

/** Enum registry: `interface DB { $types: { mood: "happy" | "sad" } }`. */
export type TypeRegistry = { readonly [name: string]: string };

/**
 * A schema namespace (`DB["auth"]`) is a map of tables/views. Unqualified names and
 * `public.x` resolve against the top level of `DB`.
 */
export type Namespace = { readonly [table: string]: Table | View<Table> };

/** The user-declared database. Keys are tables, views, namespaces or `$types`. */
export type Schema = { readonly [key: string]: Table | View<Table> | Namespace | TypeRegistry };
