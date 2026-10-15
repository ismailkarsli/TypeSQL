import { createSql as createCoreSql, type Sql } from "@typesql/core";
import { executor, type PostgresJsQueryable } from "./client.js";
import type { PostgresJsBigIntTypeMap, PostgresJsTypeMap } from "./type-map.js";

export { NoResultError, type Executor } from "@typesql/core";
export type { PostgresJsTypeMap, PostgresJsBigIntTypeMap } from "./type-map.js";
export {
  query,
  one,
  maybeOne,
  many,
  execute,
  executor,
  transaction,
  migrate,
  type MigrationSource,
  RowCountError,
  type PostgresJsQueryable,
  type PostgresJsRows,
  type PostgresJsTransactable,
} from "./client.js";

/**
 * `createSql<DB>()` from core, pre-bound to `PostgresJsTypeMap` (default parsers: `int8` and `count(*)` are `string`).
 * With a postgres.js `sql` instance, the queries' `execute*` methods run on it.
 */
export function createSql<DB>(sql?: PostgresJsQueryable): Sql<DB, PostgresJsTypeMap> {
  return createCoreSql<DB, PostgresJsTypeMap>(sql && executor(sql));
}

/** For `postgres({ types: { bigint: postgres.BigInt } })` connections: `int8` and `count(*)` are `bigint`. */
export function createBigIntSql<DB>(sql?: PostgresJsQueryable): Sql<DB, PostgresJsBigIntTypeMap> {
  return createCoreSql<DB, PostgresJsBigIntTypeMap>(sql && executor(sql));
}
