import { createSql, type ParamsType, type RowType } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";

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
	};
}

const sql = createSql<DB>(postgres);

// Exported queries show their row and parameter types under Types (.d.ts).
export const q = sql(
	`SELECT u.id, u.email, p.title
               FROM users u LEFT JOIN posts p ON p.author_id = u.id
               WHERE u.id = $1`,
	7,
);
export type Row = RowType<typeof q>;
export type Params = ParamsType<typeof q>;

export const stats = sql(
	`SELECT author_id, count(*), max(title) AS latest FROM posts GROUP BY author_id`,
);
export type Stats = RowType<typeof stats>;

const email = "ada@example.com";
export const created = sql(
	`INSERT INTO users (email) VALUES (${sql.param(email)}) RETURNING id, created_at`,
);
export type Created = RowType<typeof created>;

// Errors: a misspelled column, and an insert without the NOT NULL author_id.
sql(`SELECT nme FROM users`);
sql(`INSERT INTO posts (title) VALUES ($1)`, "Hello");
