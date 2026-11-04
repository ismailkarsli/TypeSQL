import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

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
export const rows = await sql(
	"SELECT id, name, bio FROM users WHERE id = $1",
	1,
).execute();
export const first = await sql(
	"SELECT id FROM users ORDER BY id",
).executeTakeFirst();
export const missing = await sql(
	"SELECT id FROM users WHERE id = $1",
	99,
).executeTakeFirst();
console.log({ rows, first, missing });
await pool.end();
