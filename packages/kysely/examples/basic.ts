import type { ParamsType, RowType } from "@typesql/core";
import { type DefaultTypeMap, postgres } from "@typesql/core/postgres";
import { createSql } from "@typesql/kysely";
import type { ColumnType, Generated, GeneratedAlways, Kysely } from "kysely";

type Int8 = ColumnType<
	string,
	bigint | number | string,
	bigint | number | string
>;
type Numeric = ColumnType<string, number | string, number | string>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type Mood = "happy" | "sad";

interface DB {
	users: {
		id: Generated<number>;
		email: string;
		display_name: string | null;
		mood: Mood | null;
		balance: Numeric;
		created_at: Generated<Timestamp>;
	};
	posts: {
		id: GeneratedAlways<Int8>;
		author_id: number;
		title: string;
		tags: string[];
		published: Generated<boolean>;
		score: number | null;
	};
	"auth.sessions": {
		id: Generated<Int8>;
		user_id: number;
		expires_at: Timestamp;
	};
}

declare const db: Kysely<DB>;
const sql = createSql(postgres, db);

export const q1 = sql(
	`SELECT u.id, u.email, u.balance, p.id AS post_id, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1 AND p.published = $2`,
	1,
	true,
);
export type Q1Row = RowType<typeof q1>;

export const q2 = sql(`SELECT id, mood FROM users WHERE mood = $1`, "happy");
export type Q2Row = RowType<typeof q2>;
export type Q2Params = ParamsType<typeof q2>;

export const q3 = sql(
	`SELECT s.expires_at, u.email FROM auth.sessions s JOIN users u ON u.id = s.user_id`,
);
export type Q3Row = RowType<typeof q3>;

export const q4 = sql(
	`INSERT INTO posts (author_id, title, tags) VALUES ($1, $2, $3) RETURNING id, published`,
	1,
	"Hello",
	["intro"],
);
export type Q4Row = RowType<typeof q4>;

const sqlx = createSql<
	DB,
	DefaultTypeMap,
	{ posts: { score: "float8" }; $types: { mood: Mood } }
>(postgres);
export const q5a = sql(
	`SELECT author_id, avg(score) FROM posts GROUP BY author_id`,
);
export type Q5aRow = RowType<typeof q5a>;
export const q5b = sqlx(
	`SELECT author_id, avg(score) FROM posts GROUP BY author_id`,
);
export type Q5bRow = RowType<typeof q5b>;

interface CamelDB {
	blogPosts: {
		id: Generated<number>;
		authorId: number;
		createdAt: Generated<Timestamp>;
	};
}
const camel = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>(
	postgres,
);
export const q6 = camel(
	`SELECT author_id, created_at FROM blog_posts WHERE id = $1`,
	1,
);
export type Q6Row = RowType<typeof q6>;

export async function publishAll(authorId: number) {
	const drafts = await sql(
		`SELECT id, title FROM posts WHERE author_id = $1 AND NOT published`,
		authorId,
	).execute();
	const updated = await sql.transaction((tx) =>
		tx(
			`UPDATE posts SET published = true WHERE author_id = $1`,
			authorId,
		).executeCount(),
	);
	return { drafts, updated };
}
