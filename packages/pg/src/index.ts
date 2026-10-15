import { createSql as createCoreSql, type Sql } from "@typesql/core";
import { executor, type PgQueryable } from "./client.js";
import type { PgTypeMap } from "./type-map.js";

export { NoResultError, type Executor } from "@typesql/core";
export type { PgInterval, PgTypeMap } from "./type-map.js";
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
 */
export function createSql<DB>(client?: PgQueryable): Sql<DB, PgTypeMap> {
  return createCoreSql<DB, PgTypeMap>(client && executor(client));
}
