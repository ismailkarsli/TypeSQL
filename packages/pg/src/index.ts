import { createSql as createCoreSql, type Sql } from "typesql";
import type { PgTypeMap } from "./type-map.js";

export type { PgInterval, PgTypeMap } from "./type-map.js";
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
  type PgQueryable,
  type PgResult,
  type PgTransactionClient,
  type PgPoolLike,
} from "./client.js";

/** `createSql<DB>()` from core, pre-bound to `PgTypeMap` (`count(*)` is `string`, `int8` is `string`, dates are `Date`). */
export function createSql<DB>(): Sql<DB, PgTypeMap> {
  return createCoreSql<DB, PgTypeMap>();
}
