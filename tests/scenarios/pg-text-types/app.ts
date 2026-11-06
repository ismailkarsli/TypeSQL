import { createSql } from "@typesql/pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<Record<never, never>>(pool);
// node-postgres has no parser for these types and returns their text.
export const row = await sql(`
	SELECT '$.a'::jsonpath AS path, NULL::jsonpath AS no_path,
		'english'::regconfig AS config, NULL::regconfig AS no_config,
		'c'::refcursor AS cursor, NULL::refcursor AS no_cursor,
		'10:20:10,14,15'::pg_snapshot AS snapshot, NULL::pg_snapshot AS no_snapshot,
		'10:20:10,14,15'::txid_snapshot AS txid_snapshot, NULL::txid_snapshot AS no_txid_snapshot
`).executeTakeFirstOrThrow();
console.log(row);
await pool.end();
