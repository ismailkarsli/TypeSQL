import type { Col, DefaultTypeMap, Json } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

interface DB {
	posts: {
		id: Col<"int">;
		meta: Json<{ theme: string }>;
		extra: Json<{ tags: string[] }, { nullable: true }>;
	};
}
// With jsonStrings, mysql2 returns JSON documents as their text.
interface JsonStringsTypeMap extends Omit<DefaultTypeMap, "json"> {
	json: string;
}
const pool = createPool({
	uri: process.env.DATABASE_URL ?? "",
	jsonStrings: true,
});
await pool.query(
	"CREATE TABLE posts (id INT PRIMARY KEY, meta JSON NOT NULL, extra JSON)",
);
const sql = createSql<DB, JsonStringsTypeMap>(pool);
await sql(
	"INSERT INTO posts (id, meta, extra) VALUES (1, $1, $2), (2, $3, NULL)",
	sql.json({ theme: "dark" }),
	sql.json({ tags: ["a"] }),
	sql.json({ theme: "light" }),
).execute();
export const rows = await sql(
	"SELECT id, meta, extra, meta ->> '$.theme' AS theme FROM posts ORDER BY id",
).execute();
console.log(rows);
await pool.end();
