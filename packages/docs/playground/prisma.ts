import { type Col, postgres } from "@typesql/core/postgres";
import { createSql, type PrismaRawClient } from "@typesql/prisma";

interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		email: Col<"varchar">;
		display_name: Col<"text", { nullable: true }>;
		role: Col<"Role", { hasDefault: true }>;
		updatedAt: Col<"timestamp">;
	};
	posts: {
		id: Col<"uuid">;
		author_id: Col<"int4">;
		title: Col<"text">;
		views: Col<"int8", { hasDefault: true }>;
	};
	$types: {
		Role: "ADMIN" | "USER";
	};
}

declare const prisma: PrismaRawClient;
const sql = createSql<DB>(postgres, prisma);

const admins = await sql(
	`SELECT id, display_name, "updatedAt" FROM users WHERE role = $1`,
	"ADMIN",
).execute();

const stats = await sql(
	`SELECT author_id, count(*) AS posts, sum(views) AS views FROM posts GROUP BY author_id`,
).execute();

const deleted = await sql.transaction((tx) =>
	tx(`DELETE FROM posts WHERE author_id = $1`, 1).executeCount(),
);

sql(`INSERT INTO posts (author_id, title) VALUES ($1, $2)`, 1, "Hello");
