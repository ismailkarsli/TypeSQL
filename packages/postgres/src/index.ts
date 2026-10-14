import { createSql as createCoreSql, type Sql } from "@typesql/core";
import type { PostgresJsBigIntTypeMap, PostgresJsTypeMap } from "./type-map.js";

export type { PostgresJsTypeMap, PostgresJsBigIntTypeMap } from "./type-map.js";
export {
  query,
  one,
  maybeOne,
  many,
  execute,
  transaction,
  migrate,
  type MigrationSource,
  RowCountError,
  type PostgresJsQueryable,
  type PostgresJsRows,
  type PostgresJsTransactable,
} from "./client.js";

/** `createSql<DB>()` from core, pre-bound to `PostgresJsTypeMap` (default parsers: `int8` and `count(*)` are `string`). */
export function createSql<DB>(): Sql<DB, PostgresJsTypeMap> {
  return createCoreSql<DB, PostgresJsTypeMap>();
}

/** For `postgres({ types: { bigint: postgres.BigInt } })` connections: `int8` and `count(*)` are `bigint`. */
export function createBigIntSql<DB>(): Sql<DB, PostgresJsBigIntTypeMap> {
  return createCoreSql<DB, PostgresJsBigIntTypeMap>();
}
