import { createSql } from "@typesql/pg";
import { Pool } from "pg";
import type { DB } from "./db.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);

export const rows = await sql(
	"INSERT INTO settings (id, value) VALUES ($1, $2) RETURNING value, backup",
	1,
	sql.json({ theme: "dark" }),
).execute();
console.log(rows);
await pool.end();
