import type { RowType } from "@typesql/core";
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
// #region execute
import { executor } from "@typesql/pg";

const bound = createSql<DB>(pool); // queries run on `pool`

const all = await bound("SELECT id, email FROM users").execute(); // { id: number; email: string }[]
const first = await bound("SELECT id FROM users WHERE email = $1", "x").executeTakeFirst(); // row | undefined
const me = await bound("SELECT id, email FROM users WHERE id = $1", 7).executeTakeFirstOrThrow(); // row, or NoResultError

await transaction(pool, async (client) => {
  await bound("UPDATE users SET display_name = NULL WHERE id = $1", 7).execute(executor(client)); // on the transaction's client
});

const deleted = await bound("DELETE FROM posts WHERE author_id = $1", 7).executeCount(); // rows deleted
// #endregion execute
// #region custom-executor
import { createSql as createCoreSql, type Executor } from "@typesql/core";
import type { PgTypeMap } from "@typesql/pg";

const onPool = executor(pool);
const logged: Executor = async (text, values) => {
  const started = performance.now();
  try {
    return await onPool(text, values); // { rows, rowCount }: executeCount keeps working
  } finally {
    console.debug(`${Math.round(performance.now() - started)} ms`, text);
  }
};
const sqlLogged = createCoreSql<DB, PgTypeMap>(logged);
// #endregion custom-executor
check<Equal<Awaited<ReturnType<ReturnType<typeof sqlLogged<"SELECT id FROM users">>["executeCount"]>>, number>>();
check<Equal<typeof deleted, number>>();
check<Equal<typeof all, { id: number; email: string }[]>>();
check<Equal<typeof first, { id: number } | undefined>>();
check<Equal<typeof me, { id: number; email: string }>>();
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
