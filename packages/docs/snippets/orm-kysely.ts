import type { DefaultTypeMap, ParamsType, RowType } from "@typesql/core";
import { check, type Equal, type Same } from "./_check.js";

// #region db
// db.ts: kysely-codegen output (trimmed), or the interface you wrote for Kysely
import type { ColumnType, Generated, GeneratedAlways } from "kysely";

export type Int8 = ColumnType<string, bigint | number | string, bigint | number | string>;
export type Numeric = ColumnType<string, number | string, number | string>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type Mood = "happy" | "sad";

export interface DB {
  users: {
    id: Generated<number>;
    email: string;
    mood: Mood | null;
    balance: Numeric;
    created_at: Generated<Timestamp>;
  };
  posts: {
    id: GeneratedAlways<Int8>;
    author_id: number;
    title: string;
    published: Generated<boolean>;
    score: number | null;
  };
  "auth.sessions": { id: Generated<Int8>; user_id: number; expires_at: Timestamp };
}
// #endregion db

// #region query
import { createSql } from "@typesql/kysely";

const sql = createSql<DB>();

const q = sql(
  `SELECT u.email, u.mood, p.id, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.mood = $1 AND p.published`,
  "happy",
);
// Query<{ email: string; mood: "happy" | "sad"; id: string; title: string }, ["happy" | "sad"]>

sql("SELECT s.expires_at FROM auth.sessions s WHERE s.user_id = $1", 1); // "auth.sessions" key
sql("INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id", 1, "Hello"); // Generated: optional
// #endregion query
check<Same<RowType<typeof q>, { email: string; mood: "happy" | "sad"; id: string; title: string }>>();
check<Equal<ParamsType<typeof q>, ["happy" | "sad"]>>();

// #region overrides
const sqlx = createSql<DB, DefaultTypeMap, {
  posts: { score: "float8" }; // codegen emits `number` for float8; inferred as int4
  $types: { mood: Mood }; // name the enum: columns with exactly these values share it
}>();

sql("SELECT avg(score) FROM posts"); // avg(int4) is numeric: { avg: string | null }
sqlx("SELECT avg(score) FROM posts"); // avg(float8) is float8: { avg: number | null }
// #endregion overrides
check<Equal<RowType<ReturnType<typeof sql<"SELECT avg(score) FROM posts">>>, { avg: string | null }>>();
check<Equal<RowType<ReturnType<typeof sqlx<"SELECT avg(score) FROM posts">>>, { avg: number | null }>>();

// #region camel
interface CamelDB {
  blogPosts: { id: Generated<number>; authorId: number; createdAt: Generated<Timestamp> };
}

const camel = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>();
camel("SELECT author_id, created_at FROM blog_posts WHERE id = $1", 1);
// Query<{ author_id: number; created_at: Date }, [number]>
// #endregion camel
check<Equal<RowType<ReturnType<typeof camel<"SELECT author_id, created_at FROM blog_posts WHERE id = $1">>>, { author_id: number; created_at: Date }>>();

import type { Kysely } from "kysely";
declare const db: Kysely<DB>;
declare const camelDb: Kysely<CamelDB>; // created with plugins: [new CamelCasePlugin()]
// #region camel-rows
const camelRows = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>(camelDb, { rowKeys: "camelCase" });
const post = await camelRows("SELECT author_id, created_at FROM blog_posts WHERE id = $1", 1).executeTakeFirstOrThrow();
// { authorId: number; createdAt: Date }
// #endregion camel-rows
check<Equal<typeof post, { authorId: number; createdAt: Date }>>();
// #region run
import { execute, query } from "@typesql/kysely";

const drafts = await query(db, sql("SELECT id, title FROM posts WHERE NOT published"));
// { id: string; title: string }[]

const published = await db.transaction().execute((trx) =>
  execute(trx, sql("UPDATE posts SET published = true WHERE author_id = $1", 1)),
); // number of affected rows
// #endregion run
check<Equal<typeof drafts, { id: string; title: string }[]>>();
check<Equal<typeof published, number>>();
