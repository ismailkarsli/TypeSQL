import { createSql as createPgSql } from "@typesql/pg";
import { createSql as createPostgresSql } from "@typesql/postgres";
import { Pool } from "pg";
import postgres from "postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = postgres(process.env.DATABASE_URL!);
await pool.query(`
	CREATE TYPE mood AS ENUM ('happy', 'sad');
	CREATE TYPE label AS ENUM ('{sad}');
	CREATE DOMAIN score AS int4;
`);
const pgSql = createPgSql<{}>(pool);
const postgresSql = createPostgresSql<{}>(client);
const query = "SELECT ARRAY['happy']::mood[] AS a, '{sad}'::text AS a";
console.log("native pg", (await pool.query(query)).rows);
export const pgRow = await pgSql(query).executeTakeFirstOrThrow();
export const postgresRow = await postgresSql(query).executeTakeFirstOrThrow();
export const preparedRow = await pgSql
	.prepare(query)()
	.executeTakeFirstOrThrow();
console.log({ pgRow, postgresRow, preparedRow });

export const variants = await pgSql(`
	SELECT
		'{happy}'::text AS array, ARRAY['sad']::mood[] AS array,
		ARRAY['happy']::mood[] AS scalar, '{sad}'::label AS scalar,
		ARRAY['happy']::mood[] AS numbers, ARRAY[1, 2]::score[] AS numbers,
		ARRAY[3]::score[] AS words, ARRAY['sad']::mood[] AS words,
		ARRAY['happy']::mood[] AS absent, NULL::text AS absent,
		ARRAY['happy']::mood[] AS unique_array
`).executeTakeFirstOrThrow();
console.log(variants);
await client.end();
await pool.end();
