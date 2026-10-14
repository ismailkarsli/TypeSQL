import type { RowType } from "typesql";
import { check, type Equal, type Same } from "./_check.js";
import type { DB } from "./schema.js";

// #region pg
import { Pool } from "pg";
import { createSql, execute, many, maybeOne, migrate, one, query, transaction } from "@typesql/pg";

const pool = new Pool();
const sql = createSql<DB>();

const users = await query(pool, sql("SELECT id, email FROM users")); // { id: number; email: string }[]
const user = await one(pool, sql("SELECT id, email FROM users WHERE id = $1", 7)); // exactly one row, or throws
const maybe = await maybeOne(pool, sql("SELECT id FROM users WHERE email = $1", "x")); // row | null
const some = await many(pool, sql("SELECT id FROM posts")); // [Row, ...Row[]]: at least one row, or throws
const changed = await execute(pool, sql("UPDATE users SET display_name = NULL")); // row count

const id = await transaction(pool, async (client) => {
  const { id } = await one(client, sql("INSERT INTO users (email) VALUES ($1) RETURNING id", "a@b.c"));
  await execute(client, sql("INSERT INTO posts (author_id, title) VALUES ($1, $2)", id, "Hello"));
  return id;
});
// #endregion pg
check<Equal<typeof users, { id: number; email: string }[]>>();
check<Equal<typeof user, { id: number; email: string }>>();
check<Equal<typeof maybe, { id: number } | null>>();
check<Same<typeof some, [{ id: string }, ...{ id: string }[]]>>();
check<Equal<typeof changed, number>>();
check<Equal<typeof id, number>>();
void migrate;

// #region postgresjs
import postgres from "postgres";
import * as pgjs from "@typesql/postgres";

const db = postgres(process.env["DATABASE_URL"]!);
const sqlJs = pgjs.createSql<DB>(); // PostgresJsTypeMap
const posts = await pgjs.query(db, sqlJs("SELECT id, title FROM posts WHERE author_id = $1", 1));
// { id: string; title: string }[]   int8 is a string by default

// with bigint parsing enabled on the connection
const dbBig = postgres(process.env["DATABASE_URL"]!, { types: { bigint: postgres.BigInt } });
const big = pgjs.createBigIntSql<DB>(); // PostgresJsBigIntTypeMap
const counts = await pgjs.query(dbBig, big("SELECT author_id, count(*) AS n FROM posts GROUP BY author_id"));
// { author_id: number; n: bigint }[]

await pgjs.transaction(db, async (tx) => {
  await pgjs.execute(tx, sqlJs("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1));
});
// #endregion postgresjs
check<Equal<typeof posts, { id: string; title: string }[]>>();
check<Equal<typeof counts, { author_id: number; n: bigint }[]>>();
check<Equal<RowType<ReturnType<typeof sql<"SELECT count(*) AS n FROM posts">>>, { n: string }>>();
