import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		settings: Json<{ theme: "dark" | "light" }>;
		items: Json<string[]>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
	"CREATE TABLE users (id int PRIMARY KEY, settings jsonb NOT NULL, items jsonb NOT NULL)",
);
const sql = createSql<DB>(pool);
await sql(
	`INSERT INTO users (id, settings, items) VALUES ($1, ${sql.json({ theme: "dark" })}, ${sql.json(["one", "two"])})`,
	1,
).execute();
export const rows = await sql(
	"SELECT id, settings, items, settings ->> 'theme' AS theme FROM users ORDER BY id",
).execute();
export const shaped = await sql(
	"SELECT json_build_object('id', id, 'settings', settings) AS profile FROM users ORDER BY id",
).execute();
console.dir({ rows, shaped }, { depth: null });
await pool.end();
