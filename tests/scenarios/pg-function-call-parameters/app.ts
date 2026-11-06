import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	items: {
		id: Col<"int4">;
		n: Col<"int4", { nullable: true }>;
		name: Col<"text", { nullable: true }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(
	"CREATE TABLE items (id integer NOT NULL, n integer, name text)",
);

// A function call holding a parameter, in the values of INSERT and MERGE.
export const coalesced = await sql(
	"INSERT INTO items (id, n) VALUES (1, COALESCE($1, 1)) RETURNING id, n",
	5,
).execute();
export const lowered = await sql(
	"INSERT INTO items (id, name) VALUES (2, lower($1)) RETURNING name",
	"ADA",
).execute();
export const casted = await sql(
	"INSERT INTO items (id, n) VALUES (3, abs($1::int4)) RETURNING n",
	-3,
).execute();
export const merged = await sql(
	"MERGE INTO items t USING (SELECT 4 AS id) s ON t.id = s.id WHEN NOT MATCHED THEN INSERT (id, n) VALUES (s.id, abs($1::int4))",
	-4,
).executeCount();
// The statements after those are still checked and typed.
export const after = await sql("SELECT id, n FROM items ORDER BY id").execute();
console.dir({ coalesced, lowered, casted, merged, after }, { depth: null });
await pool.end();
