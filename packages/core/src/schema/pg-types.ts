import type { DefaultTypeMap } from "../type-map/index.js";

/**
 * Canonical names of the PostgreSQL built-in types the engine has a TypeScript type for: the
 * keys of `DefaultTypeMap`, each the name of a `pg_catalog` type in `pg_type`. Everything the
 * user or the SQL text spells (`integer`, `bigint`, `timestamp with time zone`, `serial`, ...)
 * is normalized to one of these (or `${T}[]` for arrays, or a user type name).
 */
export type PgScalarName = keyof DefaultTypeMap;

/** A column type name: a built-in one (suggested by the editor), an array, or a user type. */
export type PgTypeName = PgScalarName | `${string}[]` | (string & {});
