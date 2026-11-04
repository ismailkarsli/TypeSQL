import { DatabaseSync } from "node:sqlite";
import { CasePlugin, createSql } from "@typesql/core";
import { postgres } from "@typesql/core/postgres";
import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createSqliteSql } from "@typesql/sqlite";

type DB = Record<string, never>;

export const core = createSql<DB>(postgres).dialect;
export const pg = createPgSql<DB>().dialect;

const sqlite = createSqliteSql<DB>(new DatabaseSync(":memory:"));
export const sqliteDialect = sqlite.dialect;
export const withPlugin = sqlite.withPlugin(new CasePlugin()).dialect;
export const inTransaction = await sqlite.transaction(async (tx) => tx.dialect);

console.log({ core, pg, sqliteDialect, withPlugin, inTransaction });
console.log(Object.getOwnPropertyDescriptor(sqlite, "dialect"));
