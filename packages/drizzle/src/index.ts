import { createSql as createCoreSql, type DefaultTypeMap, type Sql } from "@typesql/core";
import type { FromDrizzle, FromDrizzleOptions } from "./from-drizzle.js";

export type { FromDrizzle, FromDrizzleOptions, DrizzleColumnTypes } from "./from-drizzle.js";
export { pgType } from "./pg-type.js";
export type { Sql, Query, RowType, ParamsType, DefaultTypeMap, TypeMap } from "@typesql/core";

/**
 * `createSql` from core with the schema converted from Drizzle definitions:
 * `createSql<typeof schema>()`, or `createSql<typeof schema, PgTypeMap>()` for a driver's type map.
 */
export function createSql<Schema, TM = DefaultTypeMap, Opts extends FromDrizzleOptions = {}>(): Sql<FromDrizzle<Schema, Opts>, TM> {
  return createCoreSql<FromDrizzle<Schema, Opts>, TM>();
}
