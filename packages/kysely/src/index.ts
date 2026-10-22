import { createSql as createCoreSql, type DefaultTypeMap, type RowKeys, type Sql, type SqlOptions } from "@typesql/core";
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
 * With a `db` (a `Kysely` instance or transaction), the queries' `execute*` methods run on it,
 * bypassing its plugins. `{ rowKeys: "camelCase" }` camelCases the rows' top-level keys as
 * `CamelCasePlugin` does, in the types and at runtime, without touching JSON values:
 *
 *   const sql = createSql<DB, DefaultTypeMap, {}, { camelCase: true }>(db, { rowKeys: "camelCase" });
 */
export function createSql<DB, TM = DefaultTypeMap, Overrides extends KyselyOverrides = {}, Options extends KyselyOptions = {}>(
  db: KyselyExecutor | undefined,
  options: { readonly rowKeys: "camelCase" },
): Sql<FromKysely<DB, Overrides, Options>, TM, "camelCase">;
export function createSql<DB, TM = DefaultTypeMap, Overrides extends KyselyOverrides = {}, Options extends KyselyOptions = {}>(
  db?: KyselyExecutor,
  options?: { readonly rowKeys?: "preserve" },
): Sql<FromKysely<DB, Overrides, Options>, TM>;
export function createSql<DB, TM = DefaultTypeMap, Overrides extends KyselyOverrides = {}, Options extends KyselyOptions = {}>(
  db?: KyselyExecutor,
  options?: SqlOptions,
): Sql<FromKysely<DB, Overrides, Options>, TM, RowKeys> {
  return createCoreSql<FromKysely<DB, Overrides, Options>, TM>(db && executor(db), options as { readonly rowKeys: "camelCase" });
}
