import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

import type { DB } from "./db.js";

const pool = createPool(process.env.DATABASE_URL!);
const sql = createSql<DB>(pool);
export const inserted = await sql(
	"INSERT INTO posts (author_id, title) VALUES ($1, $2)",
	1,
	"SQL",
).executeCount();
export const rows = await sql(
	"SELECT u.id, u.name, u.role, u.bio, p.title FROM users u LEFT JOIN posts p ON p.author_id = u.id ORDER BY u.id",
).execute();
console.log({ inserted, rows });
await pool.end();
