import { createSql as createCoreSql, type DefaultTypeMap, type Sql } from "@typesql/core";
import { executor, type KyselyExecutor } from "./client.js";
import type { FromKysely, KyselyOptions, KyselyOverrides } from "./from-kysely.js";

export { NoResultError, type Executor } from "@typesql/core";
export type { FromKysely, KyselyOverrides, KyselyOptions, TableOverride, ColumnOverride, InferColumn, SnakeCase } from "./from-kysely.js";
export { query, execute, executor, type KyselyExecutor } from "./client.js";

/**
 * `createSql` from core with a Kysely `DB` interface as the schema:
 * `createSql<DB>()` is `createSql<FromKysely<DB>, DefaultTypeMap>()`.
 *
 *   const sql = createSql<DB>();
 *   const sql = createSql<DB, PgTypeMap, { users: { id: "int8" } }>();
 *   const sql = createSql<DB, DefaultTypeMap, {}, { camelCase: true }>();
 *
 * With a `db` (a `Kysely` instance or transaction), the queries' `execute*` methods run on it.
 */
export function createSql<
  DB,
  TM = DefaultTypeMap,
  Overrides extends KyselyOverrides = {},
  Options extends KyselyOptions = {},
>(db?: KyselyExecutor): Sql<FromKysely<DB, Overrides, Options>, TM> {
  return createCoreSql<FromKysely<DB, Overrides, Options>, TM>(db && executor(db));
}
