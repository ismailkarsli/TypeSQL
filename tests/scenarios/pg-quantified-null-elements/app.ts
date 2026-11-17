import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	items: {
		id: Col<"int4">;
		n: Col<"int4", { nullable: true }>;
		tags: Col<"text[]">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`
	CREATE TABLE items (id integer NOT NULL, n integer, tags text[] NOT NULL);
	INSERT INTO items VALUES (1, NULL, ARRAY['a']);
`);

// A NULL element makes `x = ANY(…)` NULL when no other element matches.
export const parameter = await sql(
	"SELECT 2 = ANY(ARRAY[$1::int4]) AS x",
	null,
).exec();
export const castArray = await sql(
	"SELECT 2 = ANY(COALESCE($1::int4[], ARRAY[1])) AS x",
	[1, null],
).exec();
export const column = await sql(
	"SELECT 1 = ANY(ARRAY[n]) AS x FROM items",
).exec();
export const literal = await sql("SELECT 2 = ANY(ARRAY[1, NULL]) AS x").exec();
export const subquery = await sql(
	"SELECT 2 = ANY(ARRAY(SELECT n FROM items)) AS x",
).exec();
export const aggregated = await sql(
	"SELECT 2 = ANY(array_agg(n)) AS x FROM items",
).exec();
export const all = await sql("SELECT 1 = ALL(ARRAY[1, NULL]) AS x").exec();

// Without NULL elements it is true or false.
export const elements = await sql("SELECT 1 = ANY(ARRAY[1, 2]) AS x").exec();
export const arrayColumn = await sql(
	"SELECT 'a' = ANY(tags) AS x FROM items",
).exec();
export const allElements = await sql("SELECT 1 = ALL(ARRAY[1, 2]) AS x").exec();
// WHERE only keeps true rows, whatever the array holds.
export const filtered = await sql(
	"SELECT id FROM items WHERE 1 = ANY(ARRAY[n, 1])",
).exec();
console.dir(
	{
		parameter,
		castArray,
		column,
		literal,
		subquery,
		aggregated,
		all,
		elements,
		arrayColumn,
		allElements,
		filtered,
	},
	{ depth: null },
);
await pool.end();
