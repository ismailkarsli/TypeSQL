import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/core";
import { mariadbDialect, mysqlDialect } from "@typesql/core/mysql";
import { CasePlugin } from "@typesql/core/plugins";
import {
	type DefaultTypeMap,
	postgresDialect,
	type Sql,
} from "@typesql/core/postgres";
import { sqliteDialect as sqliteDialectObject } from "@typesql/core/sqlite";
import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createSqliteSql } from "@typesql/sqlite";

type DB = Record<string, never>;

export const core = createSql<DB>(postgresDialect).dialect;
export const pg = createPgSql<DB>().dialect;

const sqlite = createSqliteSql<DB>(new DatabaseSync(":memory:"));
export const sqliteDialect = sqlite.dialect;
export const withPlugin = sqlite.withPlugin(new CasePlugin()).dialect;
export const inTransaction = await sqlite.transaction(async (tx) => tx.dialect);

// An `sql` of createSql() keeps its dialect, and its type, with a plugin.
const camel: Sql<DB, DefaultTypeMap, [CasePlugin]> = createSql<DB>(
	postgresDialect,
).withPlugin(new CasePlugin());
export const corePostgresWithPlugin = camel.dialect;
export const coreSqliteWithPlugin = createSql<DB>(
	sqliteDialectObject,
).withPlugin(new CasePlugin()).dialect;
export const coreMysqlWithPlugin = createSql<DB>(mysqlDialect).withPlugin(
	new CasePlugin(),
).dialect;
export const coreMariadbWithPlugin = createSql<DB>(mariadbDialect).withPlugin(
	new CasePlugin(),
).dialect;

console.log({
	core,
	pg,
	sqliteDialect,
	withPlugin,
	inTransaction,
	corePostgresWithPlugin,
	coreSqliteWithPlugin,
	coreMysqlWithPlugin,
	coreMariadbWithPlugin,
});
console.log(Object.getOwnPropertyDescriptor(sqlite, "dialect"));
