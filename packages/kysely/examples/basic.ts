/**
 * TypeSQL with a Kysely `DB` interface (@typesql/kysely). Type-checked by this package's
 * `pnpm typecheck`; hover the results in your editor. Nothing here needs a database.
 */

import type { DefaultTypeMap, ParamsType, RowType } from "@typesql/core";
import { createSql } from "@typesql/kysely";
import type { ColumnType, Generated, GeneratedAlways, Kysely } from "kysely";

// The interface kysely-codegen emits (trimmed), or the one you wrote by hand for Kysely.
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
		score: number | null; // float8 in the database; codegen emits `number`
	};
	"auth.sessions": {
		id: Generated<Int8>;
		user_id: number;
		expires_at: Timestamp;
	};
}

// Bind sql to your Kysely instance (or a transaction): queries run on it, with its plugins bypassed,
// so the rows have exactly the typed keys.
declare const db: Kysely<DB>;
const sql = createSql<DB>(db);

// 1. Columns are read back from their TS types: `Int8` is int8 (a string under pg), `Numeric` is
//    numeric, `Timestamp` is timestamptz.
export const q1 = sql(
	`SELECT u.id, u.email, u.balance, p.id AS post_id, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1 AND p.published = $2`,
	1,
	true,
);
export type Q1Row = RowType<typeof q1>; // { id: number; email: string; balance: string; post_id: string; title: string }

// 2. String-literal unions are enums: rows and parameters carry the values.
export const q2 = sql(`SELECT id, mood FROM users WHERE mood = $1`, "happy");
export type Q2Row = RowType<typeof q2>; // { id: number; mood: "happy" | "sad" }   (the WHERE rules out NULL)
export type Q2Params = ParamsType<typeof q2>; // ["happy" | "sad"]
// sql(`SELECT id FROM users WHERE mood = $1`, "angry");  // error: not one of the enum's values

// 3. "schema.table" keys are queried as schema.table.
export const q3 = sql(
	`SELECT s.expires_at, u.email FROM auth.sessions s JOIN users u ON u.id = s.user_id`,
);
export type Q3Row = RowType<typeof q3>; // { expires_at: Date; email: string }

// 4. Generated / GeneratedAlways columns may be left out of an INSERT; the others are required.
export const q4 = sql(
	`INSERT INTO posts (author_id, title, tags) VALUES ($1, $2, $3) RETURNING id, published`,
	1,
	"Hello",
	["intro"],
);
export type Q4Row = RowType<typeof q4>; // { id: string; published: boolean }
// sql(`INSERT INTO users (email) VALUES ($1)`, "a@b.c");  // error: "balance" is NOT NULL and has no default

// 5. `number` is read as int4. Override columns whose real type matters for expressions:
//    avg(int4) is numeric (a string), avg(float8) is float8 (a number). Naming the enum under
//    `$types` lets every column with exactly those values share one enum type.
const sqlx = createSql<
	DB,
	DefaultTypeMap,
	{ posts: { score: "float8" }; $types: { mood: Mood } }
>();
export const q5a = sql(
	`SELECT author_id, avg(score) FROM posts GROUP BY author_id`,
);
export type Q5aRow = RowType<typeof q5a>; // { author_id: number; avg: string | null }
export const q5b = sqlx(
	`SELECT author_id, avg(score) FROM posts GROUP BY author_id`,
);
export type Q5bRow = RowType<typeof q5b>; // { author_id: number; avg: number | null }

// 6. An interface generated with `kysely-codegen --camel-case` (used with CamelCasePlugin):
//    SQL and rows use the database's snake_case names.
interface CamelDB {
	blogPosts: {
		id: Generated<number>;
		authorId: number;
		createdAt: Generated<Timestamp>;
	};
}
const camel = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>();
export const q6 = camel(
	`SELECT author_id, created_at FROM blog_posts WHERE id = $1`,
	1,
);
export type Q6Row = RowType<typeof q6>; // { author_id: number; created_at: Date }

// 7. Run queries with execute*, and transactions with sql.transaction: `tx` is sql bound to the
//    transaction (a Kysely `Transaction`).
export async function publishAll(authorId: number) {
	const drafts = await sql(
		`SELECT id, title FROM posts WHERE author_id = $1 AND NOT published`,
		authorId,
	).execute();
	// drafts: { id: string; title: string }[]
	const updated = await sql.transaction((tx) =>
		tx(
			`UPDATE posts SET published = true WHERE author_id = $1`,
			authorId,
		).executeCount(),
	);
	// updated: number (affected rows)
	return { drafts, updated };
}
