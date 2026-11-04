import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
	"CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL, bio text); INSERT INTO users VALUES (1, 'Ada', NULL), (2, 'Grace', 'Compiler')",
);
const sql = createSql<DB>(pool);

const selected = sql.prepare(
	"WITH ids AS (SELECT id FROM users WHERE id >= $1), names AS (SELECT name FROM users WHERE name = $2) SELECT ids.id, names.name FROM ids CROSS JOIN names ORDER BY ids.id + $3 LIMIT $4",
);
export type SelectParams = Parameters<typeof selected>;
export const rows = await selected(1, "Ada", null, 1).execute();

const values = sql.prepare(
	"SELECT * FROM (VALUES ($1::int4, upper($2)), ($3::int4, lower($4))) AS v(id, name) ORDER BY id",
);
export type ValuesParams = Parameters<typeof values>;
export const pairs = await values(3, "ada", 4, "GRACE").execute();

const written = sql.prepare(
	"INSERT INTO users (id, name, bio) VALUES ($1, $2, $3), ($4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = upper($7), bio = $8 WHERE users.id > $9 RETURNING id, name, bio",
);
export type WriteParams = Parameters<typeof written>;
export const inserted = await written(
	3,
	"Lin",
	null,
	4,
	"Ken",
	"Unix",
	"updated",
	null,
	0,
).execute();

const conditional = sql.prepare(
	"SELECT CASE WHEN $1 THEN $2 ELSE id END AS value FROM users WHERE id = $3",
);
export type CaseParams = Parameters<typeof conditional>;
export const chosen = await conditional(true, 7, 1).execute();
console.log({ rows, pairs, inserted, chosen });
await pool.end();
