import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
		balance: Col<"numeric">;
		created_at: Col<"timestamptz", { hasDefault: true }>;
	};
	posts: {
		id: Col<"int8", { hasDefault: true }>;
		author_id: Col<"int4">;
		title: Col<"text">;
		published_at: Col<"timestamptz", { nullable: true }>;
	};
}

const pool = new Pool({ connectionString: "postgres://localhost/app" });
const sql = createSql<DB>(pool);

const byAuthor = sql(
	`SELECT p.id, p.title, p.published_at, u.email
                      FROM posts p JOIN users u ON u.id = p.author_id
                      WHERE p.author_id = $1`,
	7,
);
const posts = await byAuthor.execute();

const user = await sql(
	`SELECT id, balance, created_at FROM users WHERE email = $1`,
	"ada@example.com",
).executeTakeFirstOrThrow();

const counts = await sql(
	`SELECT author_id, count(*) AS n FROM posts GROUP BY author_id`,
).execute();

const postId = await sql.transaction(async (tx) => {
	const { id } = await tx(
		`INSERT INTO users (email, balance) VALUES ($1, $2) RETURNING id`,
		"grace@example.com",
		0,
	).executeTakeFirstOrThrow();
	const post = await tx(
		`INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id`,
		id,
		"Hello",
	).executeTakeFirstOrThrow();
	return post.id;
});

await sql(`DELETE FROM posts WHERE author_id = $1`, "7").execute();
