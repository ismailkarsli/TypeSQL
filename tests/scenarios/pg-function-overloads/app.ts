import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	items: {
		id: Col<"int4">;
		label: Col<"text">;
		optional_label: Col<"text", { nullable: true }>;
	};
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`
		CREATE TABLE items (id integer NOT NULL, label text NOT NULL, optional_label text);
		INSERT INTO items VALUES (1, 'Ada', NULL), (3, 'Grace', 'Grace');
	`);
export const rows = await sql(`
		SELECT upper(label) AS upper_label, upper(optional_label) AS upper_optional,
			rpad(label, 6) AS padded, rpad(optional_label, 6, '.') AS padded_optional,
			regexp_count(label, 'a') AS matches,
			regexp_count(optional_label, 'a', 1, 'i') AS matches_optional,
			regexp_instr(label, 'a', 1, 1, 0, 'i', 0) AS position,
			regexp_substr(label, 'z', 1, 1, 'i', 0) AS missing,
			lead(label, 1, 'none') OVER (ORDER BY id) AS following,
			lead(optional_label) OVER (ORDER BY id) AS following_optional,
			jsonb_path_match('true'::jsonb, '$'::jsonpath, '{}'::jsonb, true) AS path_match
		FROM items ORDER BY id
	`).execute();
export const statistics = await sql(`
		SELECT stddev_samp(id)::float8 AS deviation,
			variance(id)::float8 AS variance,
			var_samp(id)::float8 AS sample,
			var_pop(id)::float8 AS population
		FROM items
	`).executeTakeFirstOrThrow();
export const parameterized = await sql(
	"SELECT regexp_count(label, $1, $2, $3) AS matches FROM items ORDER BY id",
	"a",
	1,
	"i",
).execute();
console.dir({ rows, statistics, parameterized }, { depth: null });
await pool.end();
