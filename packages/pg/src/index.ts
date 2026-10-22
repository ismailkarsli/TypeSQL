import { createSql as createCoreSql, type RowKeys, type Sql, type SqlOptions } from "@typesql/core";
import { executor, type PgQueryable } from "./client.js";
import type { PgTypeMap } from "./type-map.js";

export { NoResultError, type Executor } from "@typesql/core";
export type { PgInterval, PgParamTypeMap, PgTypeMap } from "./type-map.js";
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
  type PgQueryable,
  type PgResult,
  type PgTransactionClient,
  type PgPoolLike,
} from "./client.js";

/**
 * `createSql<DB>()` from core, pre-bound to `PgTypeMap` (`count(*)` is `string`, `int8` is `string`, dates are `Date`).
 * With a `client` (a `Pool`, `Client` or `PoolClient`), the queries' `execute*` methods run on it.
 * `{ rowKeys: "camelCase" }` camelCases the rows' keys, in the types and at runtime.
 */
export function createSql<DB>(client: PgQueryable | undefined, options: { readonly rowKeys: "camelCase" }): Sql<DB, PgTypeMap, "camelCase">;
export function createSql<DB>(client?: PgQueryable, options?: { readonly rowKeys?: "preserve" }): Sql<DB, PgTypeMap>;
export function createSql<DB>(client?: PgQueryable, options?: SqlOptions): Sql<DB, PgTypeMap, RowKeys> {
  return createCoreSql<DB, PgTypeMap>(client && executor(client), options as { readonly rowKeys: "camelCase" });
}
