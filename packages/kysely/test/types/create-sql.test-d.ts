import { expectTypeOf, test } from "vitest";
import type { Kysely, Transaction } from "kysely";
import type { DefaultTypeMap, ParamsType, RowType, SqlError } from "@typesql/core";
import { createSql, type KyselyExecutor, type KyselySql } from "../../src/index.js";
import type { AuthRole, DB, Mood } from "../fixtures/kysely-codegen.js";

const sql = createSql<DB>();
type Interval = DefaultTypeMap["interval"];

test("SELECT with JOIN: rows and params", () => {
  const q = sql(
    "SELECT u.id, u.email, u.display_name, u.mood, p.title, p.tags, p.views, p.edited_at FROM users u JOIN posts p ON p.author_id = u.id WHERE u.id = $1 AND p.published = $2",
    1,
    true,
  );
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{
    id: number;
    email: string;
    display_name: string | null;
    mood: "happy" | "sad" | null;
    title: string;
    tags: string[];
    views: string;
    edited_at: Date[] | null;
  }>();
  expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<[number | null, boolean | null]>();

  const r = sql("SELECT balance, created_at, session_length, location, avatar, moods FROM users WHERE mood = $1", "happy");
  expectTypeOf<RowType<typeof r>>().toEqualTypeOf<{
    balance: string;
    created_at: Date;
    session_length: Interval | null;
    location: { x: number; y: number } | null;
    avatar: Uint8Array | null;
    moods: ("happy" | "sad")[];
  }>();
  expectTypeOf<ParamsType<typeof r>>().toEqualTypeOf<["happy" | "sad" | null]>();
});

test("schema-qualified tables", () => {
  const q = sql("SELECT a.role, s.expires_at FROM auth.users a JOIN auth.sessions s ON s.auth_user_id = a.id WHERE a.user_id = $1", 1);
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ role: "admin" | "member"; expires_at: Date }>();
  expectTypeOf<Parameters<typeof sql<"SELECT id FROM sessions">>[0]>().toEqualTypeOf<SqlError<'relation "sessions" does not exist', 3> & "SELECT id FROM sessions">();
});

test("INSERT may omit Generated / GeneratedAlways columns, not required ones", () => {
  const q = sql("INSERT INTO posts (author_id, title, tags) VALUES ($1, $2, $3) RETURNING id, published, views", 1, "t", ["a"]);
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ id: string; published: boolean; views: string }>();
  expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<[number, string, (string | null)[]]>();
  const u = sql("INSERT INTO users (email, balance) VALUES ($1, $2) RETURNING id, created_at", "a@b.c", "1.5");
  expectTypeOf<RowType<typeof u>>().toEqualTypeOf<{ id: number; created_at: Date }>();
  expectTypeOf<Parameters<typeof sql<"INSERT INTO users (email) VALUES ('a')">>[0]>()
    .toEqualTypeOf<SqlError<'null value in column "balance" of relation "users" violates not-null constraint', 2> & "INSERT INTO users (email) VALUES ('a')">();
});

test("overrides change inference end to end", () => {
  const s = createSql<DB, DefaultTypeMap, {
    users: { id: "int8"; balance: "float8" };
    "auth.users": { id: "uuid" };
    "auth.sessions": { auth_user_id: "uuid" };
    $types: { mood: Mood; "auth.role": AuthRole };
  }>();
  const q = s("SELECT id, balance FROM users WHERE id = $1", "1");
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ id: string; balance: number }>();
  expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<[string | number | bigint | null]>();
  const j = s("SELECT a.id, a.role FROM auth.users a JOIN auth.sessions s ON s.auth_user_id = a.id");
  expectTypeOf<RowType<typeof j>>().toEqualTypeOf<{ id: string; role: "admin" | "member" }>();
  // one shared enum name: comparable and UNION-able across columns
  const e = s("SELECT mood FROM users UNION SELECT unnest(moods) FROM users");
  expectTypeOf<RowType<typeof e>>().toEqualTypeOf<{ mood: "happy" | "sad" | null }>();
});

test("derived enum names are distinct types (as distinct Postgres enums would be)", () => {
  const e = sql("SELECT mood FROM users UNION SELECT mood FROM users");
  expectTypeOf<RowType<typeof e>>().toEqualTypeOf<{ mood: "happy" | "sad" | null }>();
  type Err = Parameters<typeof sql<"SELECT mood FROM users UNION SELECT role FROM auth.users">>[0];
  expectTypeOf<Err>().toEqualTypeOf<SqlError<"UNION types users.mood and auth.users.role cannot be matched", 4> & "SELECT mood FROM users UNION SELECT role FROM auth.users">();
});

test("camelCase option: SQL uses snake_case names", () => {
  interface CamelDB {
    blogPosts: { id: GeneratedId; authorId: number; createdAt: Date };
  }
  type GeneratedId = import("kysely").Generated<number>;
  const s = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>();
  const q = s("SELECT author_id, created_at FROM blog_posts WHERE id = $1", 1);
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ author_id: number; created_at: Date }>();
});

test("Record<string, …> json columns select as jsonb, not interval", () => {
  interface JsonDB {
    events: { id: number; payload: import("kysely").JSONColumnType<Record<string, number>> };
  }
  const q = createSql<JsonDB>()("SELECT payload FROM events");
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ payload: unknown }>();
});

test("createSql accepts Kysely and Transaction; execute* and transaction type rows from the query", () => {
  expectTypeOf<Kysely<DB>>().toExtend<KyselyExecutor>();
  expectTypeOf<Transaction<DB>>().toExtend<KyselyExecutor>();
  const db = {} as Kysely<DB>;
  const bound = createSql<DB>(db);
  createSql<DB>({} as Transaction<DB>);
  expectTypeOf(bound).toEqualTypeOf<KyselySql<DB>>();
  const q = bound("SELECT id, email FROM users");
  expectTypeOf(q.execute()).toEqualTypeOf<Promise<{ id: number; email: string }[]>>();
  expectTypeOf(q.executeCount()).toEqualTypeOf<Promise<number>>();
  const result = bound.transaction(async (tx) => {
    expectTypeOf(tx).toEqualTypeOf<KyselySql<DB>>();
    return tx("SELECT id FROM users").executeTakeFirstOrThrow();
  });
  expectTypeOf(result).toEqualTypeOf<Promise<{ id: number }>>();
});

test("rowKeys: camelCase gives rows the keys CamelCasePlugin would", () => {
  interface CamelDB {
    blogPosts: { id: import("kysely").Generated<number>; authorId: number; createdAt: Date };
  }
  const s = createSql<CamelDB, DefaultTypeMap, {}, { camelCase: true }>(undefined, { rowKeys: "camelCase" });
  const q = s("SELECT author_id, created_at FROM blog_posts WHERE id = $1", 1);
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ authorId: number; createdAt: Date }>();
  expectTypeOf(q.execute()).toEqualTypeOf<Promise<{ authorId: number; createdAt: Date }[]>>();
  const plain = createSql<DB>(undefined, { rowKeys: "preserve" });
  expectTypeOf(plain).toEqualTypeOf(sql);
});
