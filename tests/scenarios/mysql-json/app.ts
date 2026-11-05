import type { Col, Enum, Json } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

interface DB {
	users: {
		id: Col<"int">;
		settings: Json<{ theme: "dark" | "light"; tags: string[] }>;
		items: Json<string[]>;
		role: Enum<"admin" | "member", { hasDefault: true }>;
	};
}
const pool = createPool(process.env.DATABASE_URL!);
await pool.query(
	"CREATE TABLE users (id INT PRIMARY KEY, settings JSON NOT NULL, items JSON NOT NULL, role ENUM('admin', 'member') NOT NULL DEFAULT 'member')",
);
const sql = createSql<DB>(pool);
export const inserted = await sql(
	`INSERT INTO users (id, settings, items) VALUES ($1, ${sql.json({ theme: "dark", tags: ["sql"] })}, ${sql.json(["one", "two"])})`,
	1,
).executeCount();
export const rows = await sql(
	"SELECT id, settings, items, role, settings ->> '$.theme' AS theme, settings -> '$.tags' AS tags, JSON_EXTRACT(items, '$[0]') AS first FROM users ORDER BY id",
).execute();
export const admins = await sql(
	"SELECT id FROM users WHERE role = $1",
	"admin",
).execute();
console.dir({ inserted, rows, admins }, { depth: null });
await pool.end();
