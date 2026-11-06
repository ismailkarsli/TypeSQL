import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
	posts: {
		id: Col<"int4">;
		author_id: Col<"int4">;
		title: Col<"text">;
		body: Col<"text", { nullable: true }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL, bio text);
  CREATE TABLE posts (id int PRIMARY KEY, author_id int NOT NULL, title text NOT NULL, body text);
  INSERT INTO users VALUES (1, 'Ada', NULL), (2, 'Grace', 'SQL'), (3, 'Lin', 'Lisp');
  INSERT INTO posts VALUES (1, 1, 'SQL', NULL);`);
const sql = createSql<DB>(pool);
export const any = await sql(
	"SELECT id, bio FROM users WHERE bio = ANY (SELECT title FROM posts) ORDER BY id",
).execute();
export const all = await sql(
	"SELECT id, bio FROM users WHERE bio <> ALL (SELECT title FROM posts WHERE id > 1) ORDER BY id",
).execute();
export const allArray = await sql(
	"SELECT id, bio FROM users WHERE bio <> ALL ($1::text[]) ORDER BY id",
	[],
).execute();
export const notIn = await sql(
	"SELECT id, bio FROM users WHERE bio NOT IN (SELECT title FROM posts WHERE id > 1) ORDER BY id",
).execute();
export const notInList = await sql(
	"SELECT id, bio FROM users WHERE bio NOT IN ('SQL') ORDER BY id",
).execute();
export const joined =
	await sql(`SELECT u.name, p.id, p.title, p.body FROM users u
  LEFT JOIN posts p ON p.author_id = u.id ORDER BY u.id`).execute();
export const matched =
	await sql(`SELECT u.name, p.id, p.title, p.body FROM users u
  LEFT JOIN posts p ON p.author_id = u.id WHERE p.title = 'SQL' ORDER BY u.id`).execute();
export const right = await sql(`SELECT u.id, u.name, p.title FROM posts p
  RIGHT JOIN users u ON p.author_id = u.id WHERE p.id IS NOT NULL`).execute();
console.log({ any, all, allArray, notIn, notInList, joined, matched, right });
await pool.end();
