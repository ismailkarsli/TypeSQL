import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";
import migrator from "./typesql.config.js";

interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		type: Col<"text", { nullable: true }>;
	};
	posts: {
		id: Col<"int4">;
		author_id: Col<"int4">;
		title: Col<"text", { nullable: true }>;
	};
}

await migrator.latest();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);

// TypeSQL's own functions, under any name.
const query = sql;
const repo = { run: sql, fragment: sql.fragment };
await query(
	"INSERT INTO users (id,name,type) VALUES ($1,$2,$3),(2,'Grace',NULL)",
	1,
	"Ada",
	"Admin",
).execute();
await repo
	.run("INSERT INTO posts VALUES (1, 1, 'SELECT * FROM users')")
	.execute();

const titled = repo.fragment("P.Title IS NOT NULL");
export const joined = await sql(
	`SELECT U.Name,P.Title AS "Select"
	FROM users U   LEFT JOIN posts P ON P.author_id=U.id   -- the author's posts
	WHERE ${sql.and([titled, sql.fragment("U.id >= $1", 1)])}
	ORDER BY U.id   DESC NULLS LAST`,
).execute();
const byId = sql.prepare(
	"SELECT name, type FROM users WHERE id=$1 OR name = 'where'",
);
export const prepared = await byId(2).execute();
export const typed = await sql.transaction(async (tx) =>
	tx(
		"SELECT type, count(*) AS n FROM users GROUP BY type ORDER BY type",
	).execute(),
);
export const escaped = await sql(
	"SELECT id\nFROM users WHERE id = 1",
).execute();

// SQL that TypeSQL doesn't check stays as written.
export const raw = await sql.as<{ one: number }>("SELECT 1 AS one").execute();
const other = await pool.query("SELECT 2 AS two");
const echo = (text: string) => text;
console.log({
	joined,
	prepared,
	typed,
	escaped,
	raw,
	other: other.rows,
	echo: echo("SELECT 3"),
});
await pool.end();
