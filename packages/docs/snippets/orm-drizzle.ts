import type { DefaultTypeMap, ParamsType, RowType } from "typesql";
import { check, type Equal } from "./_check.js";

// #region query
import { createSql } from "@typesql/drizzle";
import type * as schema from "./orm-drizzle-schema.js";

const sql = createSql<typeof schema>();

const q = sql(
  `SELECT u.email, u.display_name, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.mood = $1`,
  "happy",
);
// Query<{ email: string; display_name: string | null; title: string }, ["happy" | "sad"]>

sql("SELECT h.email FROM happy_users h JOIN auth.sessions s ON s.user_id = h.id"); // views, pgSchema
sql("INSERT INTO posts (author_id, title, slug) VALUES ($1, $2, $3) RETURNING id, created_at", 1, "Hello", "hello");
// id and created_at have SQL defaults; slug's $defaultFn runs in Drizzle, so raw SQL must set it
// #endregion query
check<Equal<RowType<typeof q>, { email: string; display_name: string | null; title: string }>>();
check<Equal<ParamsType<typeof q>, ["happy" | "sad"]>>();
// @ts-expect-error -- slug has no SQL default
sql("INSERT INTO posts (author_id, title) VALUES ($1, $2)", 1, "Hello");
// @ts-expect-error -- views are read-only
sql("DELETE FROM happy_users");

// #region options
createSql<typeof schema, DefaultTypeMap, {
  casing: "snake_case"; // drizzle(client, { casing: "snake_case" })
  timestamp: "timestamptz"; // type of timestamp() columns not pinned with pgType
}>();
// #endregion options

declare const pool: import("@typesql/pg").PgQueryable;
// #region adapter
import * as pg from "@typesql/pg";
import type { FromDrizzle } from "@typesql/drizzle";

const pgSql = pg.createSql<FromDrizzle<typeof schema>>(); // PgTypeMap
const rows = await pg.query(pool, pgSql("SELECT id, title FROM posts WHERE author_id = $1", 1));
// { id: number; title: string }[]
// #endregion adapter
check<Equal<typeof rows, { id: number; title: string }[]>>();
