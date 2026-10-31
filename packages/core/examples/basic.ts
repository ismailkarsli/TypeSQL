import { createSql, type RowType } from "@typesql/core";
import { type ApplyDdl, type Col, postgres } from "@typesql/core/postgres";

interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
		created_at: Col<"timestamptz", { hasDefault: true }>;
	};
	posts: {
		id: Col<"int8", { hasDefault: true }>;
		author_id: Col<"int4">;
		title: Col<"text">;
		body: Col<"text", { nullable: true }>;
		tags: Col<"text[]">;
	};
}

const sql = createSql<DB>(postgres);

export const q1 = sql(
	`SELECT u.id, u.email, p.title
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
	7,
);
export type Q1Row = RowType<typeof q1>;

export const q2 = sql(
	`SELECT author_id, count(*) AS n, max(title) FROM posts GROUP BY author_id`,
);
export type Q2Row = RowType<typeof q2>;

export const q3 = sql(
	`SELECT 1 + 1, lower(email), id::text, CASE WHEN id > 1 THEN 'a' END FROM users`,
);
export type Q3Row = RowType<typeof q3>;

export const q4 = sql(
	`SELECT id FROM users WHERE email = :email AND id > :min`,
	{ email: "a@b.c", min: 10 },
);

declare const email: string;
export const q4b = sql(
	`SELECT id, display_name FROM users WHERE email = ${sql.param(email)} AND id > ${sql.param(10)}`,
);

const where = sql.fragment(
	`WHERE u.display_name IS NOT NULL AND u.id > $1`,
	100,
);
export const q5 = sql(
	`SELECT u.id, u.display_name FROM users u {where} ORDER BY u.id`,
	{ where },
);

export type DB2 = ApplyDdl<
	DB,
	`ALTER TABLE users ADD COLUMN age int NOT NULL DEFAULT 0`
>;
const sql2 = createSql<DB2>(postgres);
export const q6 = sql2(`SELECT age FROM users`);

export const q8 = sql.as<{ n: number }>(
	`SELECT 1 AS n FROM some_extension_function()`,
);
