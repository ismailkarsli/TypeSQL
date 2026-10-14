/**
 * typesql with a Drizzle ORM schema (@typesql/drizzle). The schema is in schema.ts.
 * Type-checked by this package's `pnpm typecheck`; hover the results in your editor. Nothing
 * here needs a database.
 */
import type { ParamsType, RowType } from "@typesql/core";
import { createSql, type FromDrizzle } from "@typesql/drizzle";
import * as pg from "@typesql/pg";
import type * as schema from "./schema.js";

// The whole module goes in as is: tables, views, enums and schemas are converted, relations
// and other exports are ignored.
const sql = createSql<typeof schema>();

// 1. Queries use SQL names (`display_name`, `author_id`), not the TS keys. Enum columns carry
//    the enum's values.
export const q1 = sql(
  `SELECT u.email, u.display_name, p.title, p.tags
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.mood = $1`,
  "happy",
);
export type Q1Row = RowType<typeof q1>; // { email: string; display_name: string | null; title: string; tags: string[] }
export type Q1Params = ParamsType<typeof q1>; // ["happy" | "sad"]

// 2. Row types come from the driver, not from Drizzle's `mode`: bigint({ mode: "number" }) is int8,
//    a string under node-postgres.
export const q2 = sql(`SELECT id, published_at FROM posts WHERE author_id = $1`, 1);
export type Q2Row = RowType<typeof q2>; // { id: string; published_at: Date | null }

// 3. SQL defaults (`defaultNow`, `default`, identity, serial) make a column optional in INSERT;
//    `$defaultFn` runs in Drizzle only, so `slug` must be supplied.
export const q3 = sql(`INSERT INTO posts (author_id, title, slug) VALUES ($1, $2, $3) RETURNING id, tags`, 1, "Hello", "hello");
export type Q3Row = RowType<typeof q3>; // { id: string; tags: string[] }
// sql(`INSERT INTO posts (author_id, title) VALUES ($1, $2)`, 1, "Hello");  // error: "slug" is NOT NULL and has no default

// 4. pgSchema tables are namespaced; views are readable but not writable.
export const q4 = sql(
  `SELECT h.email, s.expires_at
   FROM happy_users h JOIN auth.sessions s ON s.user_id = h.id`,
);
export type Q4Row = RowType<typeof q4>; // { email: string; expires_at: Date }
// sql(`DELETE FROM happy_users`);  // error: happy_users is a view

// 5. `pgType` pinned created_at to timestamptz, so timestamptz-only behaviour type-checks the
//    way Postgres runs it: AT TIME ZONE turns it into a timestamp.
export const q5 = sql(`SELECT created_at AT TIME ZONE 'UTC' AS created_utc FROM users`);
export type Q5Row = RowType<typeof q5>; // { created_utc: Date }

// 6. Run queries with a driver adapter on the same pool you pass to drizzle(): convert the schema
//    with FromDrizzle and use the adapter's createSql (here @typesql/pg and its PgTypeMap).
const pgSql = pg.createSql<FromDrizzle<typeof schema>>();
declare const pool: pg.PgQueryable; // the pg Pool given to drizzle(pool)

export async function postsByMood(m: "happy" | "sad") {
  return pg.query(pool, pgSql(`SELECT p.id, p.title FROM posts p JOIN users u ON u.id = p.author_id WHERE u.mood = $1`, m));
  // Promise<{ id: string; title: string }[]>
}
