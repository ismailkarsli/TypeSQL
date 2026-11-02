import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { Col } from "@typesql/core/postgres";
interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
	posts: { id: Col<"int4">; author_id: Col<"int4">; title: Col<"text"> };
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL, bio text);
  CREATE TABLE posts (id int PRIMARY KEY, author_id int NOT NULL REFERENCES users, title text NOT NULL);
  INSERT INTO users VALUES (1, 'Ada', NULL), (2, 'Grace', 'Compiler');
  INSERT INTO posts VALUES (1, 1, 'SQL');`);
export const rows = await sql(`SELECT u.id, u.name, p.title FROM users u
  LEFT JOIN posts p ON p.author_id = u.id ORDER BY u.id`).execute();
export const narrowed = await sql(`SELECT u.id, p.title FROM users u
  LEFT JOIN posts p ON p.author_id = u.id WHERE p.title IS NOT NULL ORDER BY u.id`).execute();
console.log({ rows, narrowed });
await pool.end();
