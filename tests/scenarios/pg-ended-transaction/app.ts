import { Pool } from "pg";
import { createSql } from "@typesql/pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<{}>(pool);
try {
	const ended = await sql.transaction(async (tx) => tx);
	await ended("SELECT 1 AS n").execute();
} finally {
	await pool.end();
}
