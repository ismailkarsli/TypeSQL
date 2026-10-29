import type { ParamsType, RowType } from "@typesql/core";
import { postgres } from "@typesql/core/postgres";
import { createSql } from "@typesql/drizzle";
import type { PgTypeMap } from "@typesql/pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema.js";

const sql = createSql<typeof schema>(postgres);

export const q1 = sql(
	`SELECT u.email, u.display_name, p.title, p.tags
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.mood = $1`,
	"happy",
);
export type Q1Row = RowType<typeof q1>;
export type Q1Params = ParamsType<typeof q1>;

export const q2 = sql(
	`SELECT id, published_at FROM posts WHERE author_id = $1`,
	1,
);
export type Q2Row = RowType<typeof q2>;

export const q3 = sql(
	`INSERT INTO posts (author_id, title, slug) VALUES ($1, $2, $3) RETURNING id, tags`,
	1,
	"Hello",
	"hello",
);
export type Q3Row = RowType<typeof q3>;

export const q4 = sql(
	`SELECT h.email, s.expires_at
   FROM happy_users h JOIN auth.sessions s ON s.user_id = h.id`,
);
export type Q4Row = RowType<typeof q4>;

export const q5 = sql(
	`SELECT created_at AT TIME ZONE 'UTC' AS created_utc FROM users`,
);
export type Q5Row = RowType<typeof q5>;

declare const db: NodePgDatabase<typeof schema>;
const dbSql = createSql<typeof schema, PgTypeMap>(postgres, db);

export async function postsByMood(m: "happy" | "sad") {
	return dbSql(
		`SELECT p.id, p.title FROM posts p JOIN users u ON u.id = p.author_id WHERE u.mood = $1`,
		m,
	).execute();
}

export async function publish(id: string) {
	return dbSql.transaction(async (tx) => {
		await tx(
			`UPDATE posts SET published_at = now() WHERE id = $1`,
			id,
		).execute();
		return tx(
			`SELECT title FROM posts WHERE id = $1`,
			id,
		).executeTakeFirstOrThrow();
	});
}
