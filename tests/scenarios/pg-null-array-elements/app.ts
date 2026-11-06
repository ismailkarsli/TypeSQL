import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	items: {
		id: Col<"int4">;
		tags: Col<"text[]">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`
	CREATE TABLE items (id integer NOT NULL, tags text[] NOT NULL);
	INSERT INTO items VALUES (1, ARRAY['a']);
`);

// An array with a NULL element in any row keeps NULL elements in the column.
export const values = await sql(
	"SELECT a FROM (VALUES (ARRAY[2]), (ARRAY[1, NULL])) AS v(a) ORDER BY a",
).execute();
export const valuesWithoutNull = await sql(
	"SELECT a FROM (VALUES (ARRAY[2]), (ARRAY[1])) AS v(a) ORDER BY a",
).execute();
export const union = await sql(
	"SELECT tags FROM items UNION ALL SELECT ARRAY['b', NULL]",
).execute();
export const recursive = await sql(`
	WITH RECURSIVE r(a, i) AS (
		SELECT ARRAY[1, NULL], 1
		UNION ALL
		SELECT a, i + 1 FROM r WHERE i < 2
	)
	SELECT a, i FROM r ORDER BY i
`).execute();
export const recursiveWithoutNull = await sql(`
	WITH RECURSIVE r(a, i) AS (
		SELECT tags, 1 FROM items
		UNION ALL
		SELECT a, i + 1 FROM r WHERE i < 2
	)
	SELECT a, i FROM r ORDER BY i
`).execute();
console.dir(
	{ values, valuesWithoutNull, union, recursive, recursiveWithoutNull },
	{ depth: null },
);
await pool.end();
