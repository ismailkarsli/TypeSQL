import { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	users: {
		id: Col<"integer", { hasDefault: true }>;
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
		created_at: Col<"datetime", { hasDefault: true }>;
	};
	posts: {
		id: Col<"integer", { hasDefault: true }>;
		author_id: Col<"integer">;
		title: Col<"text">;
		body: Col<"text", { nullable: true }>;
	};
}

const sql = createSql<DB>(new DatabaseSync("app.db"));

const posts = await sql(
	`SELECT p.id, p.title, u.display_name
	 FROM posts p JOIN users u ON u.id = p.author_id
	 WHERE u.email = :email`,
	{ email: "ada@example.com" },
).execute();

const [post] = await sql(
	`INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id, title`,
	1,
	"Hello",
).execute();

await sql.transaction(async (tx) => {
	await tx(
		`UPDATE posts SET title = upper(title) WHERE author_id = $1`,
		1,
	).execute();
	const n = await tx(`DELETE FROM posts WHERE body IS NULL`).executeCount();
});

sql(`SELECT title FROM posts WHERE id = ?`);
