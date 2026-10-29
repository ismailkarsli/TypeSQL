import {
	type Col,
	type Generated,
	type Nullable,
	postgres,
} from "@typesql/core/postgres";
import { createSql, type PrismaRawClient } from "@typesql/prisma";

interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"varchar">;
		display_name: Nullable<"text">;
		role: Generated<"Role">;
		updatedAt: Col<"timestamp">;
	};
	posts: {
		id: Col<"uuid">;
		author_id: Col<"int4">;
		title: Col<"text">;
		views: Generated<"int8">;
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
