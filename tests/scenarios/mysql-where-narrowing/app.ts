import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

interface DB {
	users: {
		id: Col<"int">;
		name: Col<"varchar">;
		bio: Col<"varchar", { nullable: true }>;
	};
	posts: {
		id: Col<"int">;
		author_id: Col<"int">;
		title: Col<"varchar">;
		body: Col<"varchar", { nullable: true }>;
	};
}
const pool = createPool({
	uri: process.env.DATABASE_URL!,
	multipleStatements: true,
});
await pool.query(`CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, bio VARCHAR(100));
  CREATE TABLE posts (id INT PRIMARY KEY, author_id INT NOT NULL, title VARCHAR(100) NOT NULL, body VARCHAR(100));
  INSERT INTO users VALUES (1, 'Ada', NULL), (2, 'Grace', 'SQL'), (3, 'Lin', 'Lisp');
  INSERT INTO posts VALUES (1, 1, 'SQL', NULL);`);
const sql = createSql<DB>(pool);
export const any = await sql(
	"SELECT id, bio FROM users WHERE bio = ANY (SELECT title FROM posts) ORDER BY id",
).execute();
export const all = await sql(
	"SELECT id, bio FROM users WHERE bio <> ALL (SELECT title FROM posts WHERE id > 1) ORDER BY id",
).execute();
export const some = await sql(
	"SELECT id, bio FROM users WHERE bio <> SOME (SELECT title FROM posts) ORDER BY id",
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
console.log({ any, some, all, notIn, notInList, joined, matched, right });
await pool.end();
