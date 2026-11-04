import { typesqlAdapter } from "@typesql/better-auth";
import { CasePlugin } from "@typesql/core";
import type { Col } from "@typesql/core/postgres";
import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createSqliteSql } from "@typesql/sqlite";

interface DB {
	user: { id: Col<"text">; name: Col<"text"> };
}

const pg = createPgSql<DB>();
const sqlite = createSqliteSql<DB>();

// Each `sql` with the dialect it runs on.
export const postgresAdapter = typesqlAdapter(pg, { dialect: "postgres" });
export const sqliteAdapter = typesqlAdapter(sqlite, { dialect: "sqlite" });

// A PostgreSQL `sql` declared as SQLite, and the other way round.
export const pgAsSqlite = typesqlAdapter(pg, { dialect: "sqlite" });
export const sqliteAsPostgres = typesqlAdapter(sqlite, { dialect: "postgres" });

// Better Auth reads its own column names, so a plugin that renames them is rejected.
export const withPlugin = typesqlAdapter(pg.withPlugin(new CasePlugin()), {
	dialect: "postgres",
});
