import { typesqlAdapter } from "@typesql/better-auth";
import { CasePlugin } from "@typesql/core/plugins";
import type { Col } from "@typesql/core/postgres";
import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createSqliteSql } from "@typesql/sqlite";

interface DB {
	user: { id: Col<"text">; name: Col<"text"> };
}

const pg = createPgSql<DB>();

// The adapter reads the database from sql.dialect.
export const postgresAdapter = typesqlAdapter(pg);
export const sqliteAdapter = typesqlAdapter(createSqliteSql<DB>(), {
	transaction: true,
});

// Better Auth reads its own column names, so a plugin that renames them is rejected.
export const withPlugin = typesqlAdapter(pg.withPlugin(new CasePlugin()));
