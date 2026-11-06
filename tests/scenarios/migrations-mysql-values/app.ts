import { createMigrator, migration } from "@typesql/core/migration";
import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

// The migrator binds a value as @typesql/mysql does: a plain object is not a
// MySQL value (sql.json() writes JSON), and never becomes SQL text. Typed
// statements reject it; `.as()` statements are not checked.
const settings = { theme: "dark" };

const first = migration("mysql", {
	name: "001-settings",
	up: async (db) => {
		const next = await db.ddl(
			"CREATE TABLE settings (id INT PRIMARY KEY, data JSON NOT NULL)",
		);
		await next(
			"INSERT INTO settings VALUES (1, $1)",
			db.json(settings),
		).execute();
		await next
			.as("UPDATE settings SET data = $1 WHERE id = 1", settings)
			.execute();
		return next;
	},
	down: async (db) => {
		await db.ddl("DROP TABLE settings");
	},
});
const migrator = createMigrator({
	dialect: "mysql",
	url: process.env.DATABASE_URL,
	migrations: [first],
});
try {
	await migrator.latest();
} catch (error) {
	console.log("migrator:", error instanceof Error ? error.message : error);
}

interface DB {
	settings: { id: Col<"int">; data: Col<"json"> };
}
const pool = createPool(process.env.DATABASE_URL!);
const sql = createSql<DB>(pool);
try {
	await sql
		.as("UPDATE settings SET data = $1 WHERE id = 1", settings)
		.execute();
} catch (error) {
	console.log("adapter:", error instanceof Error ? error.message : error);
}
export const rows = await sql("SELECT id, data FROM settings").execute();
console.log(rows);
await pool.end();
