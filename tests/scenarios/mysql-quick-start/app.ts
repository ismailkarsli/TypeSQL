import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

interface DB {
	users: {
		id: Col<"int">;
		name: Col<"varchar">;
		bio: Col<"varchar", { nullable: true }>;
	};
	posts: { id: Col<"int">; author_id: Col<"int">; title: Col<"varchar"> };
}
const pool = createPool({
	uri: process.env.DATABASE_URL!,
	multipleStatements: true,
});
const sql = createSql<DB>(pool);
export const dialect = sql.dialect;
await pool.query(`CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, bio VARCHAR(100));
  CREATE TABLE posts (id INT PRIMARY KEY, author_id INT NOT NULL REFERENCES users (id), title VARCHAR(100) NOT NULL);
  INSERT INTO users VALUES (1, 'Ada', NULL), (2, 'Grace', 'Compiler');
  INSERT INTO posts VALUES (1, 1, 'SQL');`);
export const rows = await sql(`SELECT u.id, u.name, p.title FROM users u
  LEFT JOIN posts p ON p.author_id = u.id ORDER BY u.id`).execute();
export const narrowed = await sql(`SELECT u.id, p.title FROM users u
  LEFT JOIN posts p ON p.author_id = u.id WHERE p.title IS NOT NULL ORDER BY u.id`).execute();
export const named = await sql("SELECT name FROM users WHERE id = :id", {
	id: 1,
}).executeTakeFirstOrThrow();
export const counted = await sql(
	"SELECT COUNT(*) AS n, SUM(id) AS total, 7 / $1 AS divided FROM users",
	2,
).executeTakeFirstOrThrow();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM posts WHERE id = $1", 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM posts ORDER BY id").execute();
export const changed = await sql(
	"UPDATE users SET bio = $1 WHERE id = $2",
	"Engineer",
	1,
).executeCount();
const prepared = sql.prepare("SELECT id, name FROM users WHERE id = $1");
export const reused = await prepared(2).execute();
const insert = sql(
	`INSERT INTO users ${sql.values("users", [{ id: 3, name: "Lin", bio: null }])}`,
);
export const insertText = insert.text;
export const inserted = await insert.executeCount();
export const updateText = sql(
	`UPDATE users SET ${sql.set("users", { bio: "Unix" })} WHERE ${sql.id("id")} = $1`,
	3,
).text;
console.log({
	dialect,
	rows,
	narrowed,
	named,
	counted,
	after,
	changed,
	reused,
	insertText,
	inserted,
	updateText,
});
await pool.end();
