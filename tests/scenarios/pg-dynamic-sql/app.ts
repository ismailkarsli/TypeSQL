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
const byName = sql.or([
	sql.fragment("name = $1", "Ada"),
	sql.fragment("name = $1", "Grace"),
]);
const filters = sql.and([byName, sql.fragment("id > $1", 0)]);
const sort = [sql.fragment("name DESC"), sql.fragment("id")];
const order = sql.combine(sort);
export const rows = await sql(
	`SELECT id, name FROM users WHERE ${filters} ORDER BY ${order}`,
).execute();
const users = sql("SELECT id FROM users WHERE bio IS NOT NULL");
export const subquery = await sql(
	`SELECT name FROM users WHERE id IN (${users}) ORDER BY id`,
).execute();
const pattern: string | undefined = "A%";
export const conditional = await sql(
	`SELECT id FROM users WHERE true ${sql.if(pattern, (p) => sql.fragment("AND name LIKE $1", p))} ORDER BY id`,
).execute();
const raw = sql.raw("id, name");
export const asserted = await sql
	.as<{ id: number; name: string }>(`SELECT ${raw} FROM users ORDER BY id`)
	.execute();
console.log({
	rows,
	subquery,
	conditional,
	asserted,
	emptyAnd: sql.and([]).text,
	emptyOr: sql.or([]).text,
});
await pool.end();
