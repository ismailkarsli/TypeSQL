import { createSql as createCoreSql, type RowKeys, type Sql, type SqlOptions } from "@typesql/core";
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
 * `{ rowKeys: "camelCase" }` camelCases the rows' keys, in the types and at runtime.
 */
export function createSql<DB>(sql: PostgresJsQueryable | undefined, options: { readonly rowKeys: "camelCase" }): Sql<DB, PostgresJsTypeMap, "camelCase">;
export function createSql<DB>(sql?: PostgresJsQueryable, options?: { readonly rowKeys?: "preserve" }): Sql<DB, PostgresJsTypeMap>;
export function createSql<DB>(sql?: PostgresJsQueryable, options?: SqlOptions): Sql<DB, PostgresJsTypeMap, RowKeys> {
  return createCoreSql<DB, PostgresJsTypeMap>(sql && executor(sql), options as { readonly rowKeys: "camelCase" });
}

/** For `postgres({ types: { bigint: postgres.BigInt } })` connections: `int8` and `count(*)` are `bigint`. */
export function createBigIntSql<DB>(sql: PostgresJsQueryable | undefined, options: { readonly rowKeys: "camelCase" }): Sql<DB, PostgresJsBigIntTypeMap, "camelCase">;
export function createBigIntSql<DB>(sql?: PostgresJsQueryable, options?: { readonly rowKeys?: "preserve" }): Sql<DB, PostgresJsBigIntTypeMap>;
export function createBigIntSql<DB>(sql?: PostgresJsQueryable, options?: SqlOptions): Sql<DB, PostgresJsBigIntTypeMap, RowKeys> {
  return createCoreSql<DB, PostgresJsBigIntTypeMap>(sql && executor(sql), options as { readonly rowKeys: "camelCase" });
}
