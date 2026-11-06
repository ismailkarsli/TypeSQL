import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/core";
import { mariadb, mysql } from "@typesql/core/mysql";
import { CasePlugin } from "@typesql/core/plugins";
import {
	type DefaultTypeMap,
	postgres,
	type Sql,
} from "@typesql/core/postgres";
import { sqlite as sqliteDialectObject } from "@typesql/core/sqlite";
import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createSqliteSql } from "@typesql/sqlite";

type DB = Record<string, never>;

export const core = createSql<DB>(postgres).dialect;
export const pg = createPgSql<DB>().dialect;

const sqlite = createSqliteSql<DB>(new DatabaseSync(":memory:"));
export const sqliteDialect = sqlite.dialect;
export const withPlugin = sqlite.withPlugin(new CasePlugin()).dialect;
export const inTransaction = await sqlite.transaction(async (tx) => tx.dialect);

// An `sql` of createSql() keeps its dialect, and its type, with a plugin.
const camel: Sql<DB, DefaultTypeMap, [CasePlugin]> = createSql<DB>(
	postgres,
).withPlugin(new CasePlugin());
export const corePostgresWithPlugin = camel.dialect;
export const coreSqliteWithPlugin = createSql<DB>(
	sqliteDialectObject,
).withPlugin(new CasePlugin()).dialect;
export const coreMysqlWithPlugin = createSql<DB>(mysql).withPlugin(
	new CasePlugin(),
).dialect;
export const coreMariadbWithPlugin = createSql<DB>(mariadb).withPlugin(
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
