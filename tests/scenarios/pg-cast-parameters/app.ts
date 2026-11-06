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

// A cast parameter that accepts NULL is nullable, whatever the select list holds.
export const nested = await sql(
	"SELECT x FROM (SELECT ARRAY[$1::int4] AS x) s",
	null,
).execute();
export const nestedCommented = await sql(
	"SELECT x -- comment\n FROM (SELECT ARRAY[$1::int4] AS x) s",
	null,
).execute();
export const unnested = await sql(
	"SELECT x FROM unnest(ARRAY[$1::int4]) AS x",
	null,
).execute();
export const castCall = await sql(
	"SELECT x FROM unnest(ARRAY[CAST($1 AS int4)]) AS x",
	null,
).execute();

// A cast array parameter accepts NULL elements, and returns them.
export const arrayCast = await sql("SELECT $1::text[] AS x", [
	"a",
	null,
]).execute();
export const arrayRows = await sql("SELECT x FROM unnest($1::text[]) AS x", [
	"a",
	null,
]).execute();

// Not nullable: a column, a default, a comparison and a bulk insert.
export const column = await sql("SELECT tags FROM items").execute();
export const defaulted = await sql(
	"SELECT COALESCE($1::int4, 0) AS x",
	null,
).execute();
export const defaultedArray = await sql(
	"SELECT COALESCE($1::text[], ARRAY['b']) AS x",
	null,
).execute();
export const compared = await sql(
	"SELECT x FROM (SELECT id AS x FROM items WHERE id = $1::int4) s",
	1,
).execute();
export const inserted = await sql(
	"INSERT INTO items (id, tags) SELECT x, ARRAY['c'] FROM unnest($1::int4[]) AS x RETURNING id",
	[2],
).execute();
console.dir(
	{
		nested,
		nestedCommented,
		unnested,
		castCall,
		arrayCast,
		arrayRows,
		column,
		defaulted,
		defaultedArray,
		compared,
		inserted,
	},
	{ depth: null },
);
await pool.end();
