import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		balance: Col<"int4">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, display_name text, balance int NOT NULL);
  INSERT INTO users VALUES (1, 'Ada', 100), (2, NULL, 50)`);
const find = sql.prepare("SELECT id, display_name FROM users WHERE id = :id");
export const rows = await find({ id: 1 }).execute();
export const second = await find({ id: 2 }).executeTakeFirstOrThrow();
console.log({ rows, second });
await pool.end();
