import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/postgres";
import type { Sql } from "postgres";

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
		tags: Col<"text[]">;
	};
}

declare const db: Sql;
const sql = createSql<DB>(db);

const posts = await sql(
	`SELECT id, title, tags FROM posts WHERE $1 = ANY (tags)`,
	"sql",
).execute();

declare const dbBig: Sql<{ bigint: bigint }>;
const big = createSql<DB>(dbBig, { bigint: true });
const counts = await big(
	`SELECT author_id, count(*) AS n FROM posts GROUP BY author_id`,
).execute();

await sql.transaction(async (tx) => {
	await tx(
		`UPDATE posts SET title = upper(title) WHERE author_id = $1`,
		7,
	).execute();
	const n = await tx(
		`DELETE FROM posts WHERE cardinality(tags) = 0`,
	).executeCount();
});

sql(`SELECT id FROM posts WHERE tags @> $1`, "sql");
