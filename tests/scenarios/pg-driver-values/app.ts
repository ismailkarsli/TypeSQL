import { Pool } from "pg";
import { createSql } from "@typesql/pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<{}>(pool);
export const rows = await sql(
	"SELECT 9007199254740993::int8 AS big, '2020-01-02T03:04:05Z'::timestamptz AS at, 1.25::numeric AS decimal, NULL::text AS absent",
).execute();
console.log(rows);
await pool.end();
