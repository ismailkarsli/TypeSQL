import type { Col, Generated, Nullable } from "../../src/index.js";

/** `typeof` of a returned value, with SQL NULL reported as `"null"`. */
export type TypeofName = "number" | "string" | "boolean" | "object" | "bigint" | "null";

export interface ConformanceCase {
  readonly name: string;
  /** Statements run before `sql`, at runtime only (not type-checked). */
  readonly setup: readonly string[];
  readonly sql: string;
  readonly params: readonly unknown[];
  /** Column names of the returned row object, in order. */
  readonly expectKeys: readonly string[];
  /** `typeof` of each column of the first returned row. */
  readonly expectTypes: Readonly<Record<string, TypeofName>>;
}

/** The schema used by the type-level side of every case. Must mirror `schema` below. */
export interface ConformanceDB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
    is_admin: Generated<"bool">;
    created_at: Generated<"timestamptz">;
    birthday: Nullable<"date">;
    balance: Generated<"numeric">;
    score: Generated<"float8">;
    meta: Nullable<"jsonb">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    body: Nullable<"text">;
    tags: Generated<"text[]">;
    views: Generated<"int4">;
    published_at: Nullable<"timestamptz">;
  };
  settings: {
    key: Col<"text">;
    value: Nullable<"text">;
  };
}

/** Shared DDL + seed data, run once before the corpus. Destructive: drops the three tables. */
export const schema: readonly string[] = [
  "DROP TABLE IF EXISTS settings",
  "DROP TABLE IF EXISTS posts",
  "DROP TABLE IF EXISTS users",
  `CREATE TABLE users (
     id serial PRIMARY KEY,
     email text NOT NULL,
     display_name text,
     is_admin boolean NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now(),
     birthday date,
     balance numeric(10, 2) NOT NULL DEFAULT 0,
     score double precision NOT NULL DEFAULT 0,
     meta jsonb
   )`,
  `CREATE TABLE posts (
     id bigserial PRIMARY KEY,
     author_id int NOT NULL REFERENCES users (id),
     title text NOT NULL,
     body text,
     tags text[] NOT NULL DEFAULT '{}',
     views int NOT NULL DEFAULT 0,
     published_at timestamptz
   )`,
  `INSERT INTO users (email, display_name, is_admin, birthday, balance, score, meta) VALUES
     ('ada@example.com', 'Ada', true, '1815-12-10', 12.50, 1.5, '{"k": 1}'),
     ('bob@example.com', NULL, false, NULL, 0, 2.25, NULL)`,
  `INSERT INTO posts (author_id, title, body, tags, views, published_at) VALUES
     (1, 'Hello', 'first post', '{"a","b"}', 10, '2024-01-02T03:04:05Z'),
     (1, 'Second', NULL, '{}', 5, NULL)`,
];

/**
 * SELECT-only corpus. Every entry is checked twice: at compile time (`conformance.test-d.ts`
 * asserts `keyof Row` and the typeof-category of each inferred column) and at runtime
 * (`conformance.test.ts` runs it against Postgres through `pg` and `postgres.js`).
 */
export const corpus = [
  {
    name: "plain columns",
    setup: [],
    sql: "SELECT id, email, display_name FROM users ORDER BY id",
    params: [],
    expectKeys: ["id", "email", "display_name"],
    expectTypes: { id: "number", email: "string", display_name: "string" },
  },
  {
    name: "aliases with and without AS, qualified refs, LIMIT",
    setup: [],
    sql: "SELECT u.id AS user_id, u.email mail FROM users u ORDER BY u.id LIMIT 1",
    params: [],
    expectKeys: ["user_id", "mail"],
    expectTypes: { user_id: "number", mail: "string" },
  },
  {
    name: "inner join, int8 key is a string",
    setup: [],
    sql: "SELECT p.id, p.title, u.email FROM posts p JOIN users u ON u.id = p.author_id ORDER BY p.id",
    params: [],
    expectKeys: ["id", "title", "email"],
    expectTypes: { id: "string", title: "string", email: "string" },
  },
  {
    name: "left join makes the right side nullable",
    setup: [],
    sql: "SELECT u.email, p.title FROM users u LEFT JOIN posts p ON p.author_id = u.id ORDER BY u.id DESC, p.id",
    params: [],
    expectKeys: ["email", "title"],
    expectTypes: { email: "string", title: "null" },
  },
  {
    name: "count(*) is int8 → string",
    setup: [],
    sql: "SELECT count(*) FROM users",
    params: [],
    expectKeys: ["count"],
    expectTypes: { count: "string" },
  },
  {
    name: "GROUP BY with count/max/sum aliases",
    setup: [],
    sql: "SELECT author_id, count(*) AS n, max(views) AS top, sum(views) AS total FROM posts GROUP BY author_id ORDER BY author_id",
    params: [],
    expectKeys: ["author_id", "n", "top", "total"],
    expectTypes: { author_id: "number", n: "string", top: "number", total: "string" },
  },
  {
    name: "casts keep the source name, CAST(...) too",
    setup: [],
    sql: "SELECT id::text, balance::float8 AS bal, '42'::int4 AS answer, created_at::date AS d, CAST(score AS text) AS s FROM users ORDER BY id LIMIT 1",
    params: [],
    expectKeys: ["id", "bal", "answer", "d", "s"],
    expectTypes: { id: "string", bal: "number", answer: "number", d: "object", s: "string" },
  },
  {
    name: "CASE with and without ELSE, unaliased CASE is named case",
    setup: [],
    sql: "SELECT id, CASE WHEN is_admin THEN 'admin' ELSE 'user' END AS role, CASE WHEN display_name IS NULL THEN 1 END AS anon, CASE WHEN score > 1 THEN 'high' ELSE 'low' END FROM users ORDER BY id",
    params: [],
    expectKeys: ["id", "role", "anon", "case"],
    expectTypes: { id: "number", role: "string", anon: "null", case: "string" },
  },
  {
    name: "COALESCE and NULLIF",
    setup: [],
    sql: "SELECT coalesce(display_name, 'anonymous') AS name, coalesce(birthday, '2000-01-01'::date) AS bday, nullif(score, 2.25) AS score FROM users ORDER BY id DESC LIMIT 1",
    params: [],
    expectKeys: ["name", "bday", "score"],
    expectTypes: { name: "string", bday: "object", score: "null" },
  },
  {
    name: "string concatenation",
    setup: [],
    sql: "SELECT email || '!' AS shout, display_name || ' <' || email || '>' AS label, 'x' || 'y' AS xy FROM users ORDER BY id",
    params: [],
    expectKeys: ["shout", "label", "xy"],
    expectTypes: { shout: "string", label: "string", xy: "string" },
  },
  {
    name: "NULL literals, bare and cast",
    setup: [],
    sql: "SELECT NULL AS nothing, id, NULL::text AS typed_null FROM users ORDER BY id LIMIT 1",
    params: [],
    expectKeys: ["nothing", "id", "typed_null"],
    expectTypes: { nothing: "null", id: "number", typed_null: "null" },
  },
  {
    name: "ORDER BY DESC with LIMIT/OFFSET params",
    setup: [],
    sql: "SELECT id, title FROM posts ORDER BY views DESC LIMIT $1 OFFSET $2",
    params: [1, 1],
    expectKeys: ["id", "title"],
    expectTypes: { id: "string", title: "string" },
  },
  {
    name: "WHERE with typed params",
    setup: [],
    sql: "SELECT id, email FROM users WHERE id = $1 AND is_admin = $2",
    params: [1, true],
    expectKeys: ["id", "email"],
    expectTypes: { id: "number", email: "string" },
  },
  {
    name: "arithmetic, comparison and numeric promotion",
    setup: [],
    sql: "SELECT views * 2 AS doubled, views > 7 AS popular, views::float8 / 4 AS quarter, views + 0.5 AS plus_half FROM posts ORDER BY id",
    params: [],
    expectKeys: ["doubled", "popular", "quarter", "plus_half"],
    expectTypes: { doubled: "number", popular: "boolean", quarter: "number", plus_half: "string" },
  },
  {
    name: "IS NULL, IS NOT NULL, NOT",
    setup: [],
    sql: "SELECT display_name IS NULL AS anon, NOT is_admin AS regular, birthday IS NOT NULL AS has_bday FROM users ORDER BY id",
    params: [],
    expectKeys: ["anon", "regular", "has_bday"],
    expectTypes: { anon: "boolean", regular: "boolean", has_bday: "boolean" },
  },
  {
    name: "SELECT * expands in column order; arrays and timestamps are objects",
    setup: [],
    sql: "SELECT * FROM posts ORDER BY id",
    params: [],
    expectKeys: ["id", "author_id", "title", "body", "tags", "views", "published_at"],
    expectTypes: { id: "string", author_id: "number", title: "string", body: "string", tags: "object", views: "number", published_at: "object" },
  },
  {
    name: "t.* plus an aliased column; numeric is a string, jsonb is parsed",
    setup: [],
    sql: "SELECT u.*, p.title AS post_title FROM users u JOIN posts p ON p.author_id = u.id ORDER BY p.id LIMIT 1",
    params: [],
    expectKeys: ["id", "email", "display_name", "is_admin", "created_at", "birthday", "balance", "score", "meta", "post_title"],
    expectTypes: {
      id: "number",
      email: "string",
      display_name: "string",
      is_admin: "boolean",
      created_at: "object",
      birthday: "object",
      balance: "string",
      score: "number",
      meta: "object",
      post_title: "string",
    },
  },
  {
    name: "literals: bool, numeric, text, int",
    setup: [],
    sql: "SELECT true AS t, 1.5 AS n, 'a' AS s, 1 AS i, tags FROM posts ORDER BY id LIMIT 1",
    params: [],
    expectKeys: ["t", "n", "s", "i", "tags"],
    expectTypes: { t: "boolean", n: "string", s: "string", i: "number", tags: "object" },
  },
  {
    name: "scalar functions; unaliased call is named after the function",
    setup: [],
    sql: "SELECT lower(u.email) AS lower_email, length(u.email) AS len, upper(p.title) FROM posts p JOIN users u ON u.id = p.author_id ORDER BY p.id LIMIT 1",
    params: [],
    expectKeys: ["lower_email", "len", "upper"],
    expectTypes: { lower_email: "string", len: "number", upper: "string" },
  },
  {
    name: "DISTINCT",
    setup: [],
    sql: "SELECT DISTINCT author_id FROM posts ORDER BY author_id",
    params: [],
    expectKeys: ["author_id"],
    expectTypes: { author_id: "number" },
  },
  {
    name: "duplicate column names: the last one wins",
    setup: [],
    sql: "SELECT u.id, p.id FROM users u JOIN posts p ON p.author_id = u.id ORDER BY p.id LIMIT 1",
    params: [],
    expectKeys: ["id"],
    expectTypes: { id: "string" },
  },
  {
    name: "per-case setup creates its own table",
    setup: [
      "CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text)",
      "INSERT INTO settings (key, value) VALUES ('theme', 'dark'), ('motd', NULL) ON CONFLICT (key) DO NOTHING",
    ],
    sql: "SELECT key, value FROM settings WHERE key = $1",
    params: ["theme"],
    expectKeys: ["key", "value"],
    expectTypes: { key: "string", value: "string" },
  },
  {
    name: "INSERT ... RETURNING: generated columns are present, omitted nullable column is NULL",
    setup: [],
    sql: "INSERT INTO users (email) VALUES ($1) RETURNING id, email, display_name, created_at, is_admin",
    params: ["conformance-insert@example.com"],
    expectKeys: ["id", "email", "display_name", "created_at", "is_admin"],
    expectTypes: { id: "number", email: "string", display_name: "null", created_at: "object", is_admin: "boolean" },
  },
  {
    name: "UPDATE ... RETURNING with a numeric column",
    setup: [],
    sql: "UPDATE users SET display_name = $1 WHERE email = $2 RETURNING id, display_name, balance",
    params: ["Conformance", "conformance-insert@example.com"],
    expectKeys: ["id", "display_name", "balance"],
    expectTypes: { id: "number", display_name: "string", balance: "string" },
  },
  {
    name: "INSERT ... SELECT ... RETURNING int8 and array columns",
    setup: [],
    sql: "INSERT INTO posts (author_id, title, tags, views) SELECT id, 'conformance-tmp', ARRAY['x'], 0 FROM users WHERE email = $1 RETURNING id, tags, views",
    params: ["conformance-insert@example.com"],
    expectKeys: ["id", "tags", "views"],
    expectTypes: { id: "string", tags: "object", views: "number" },
  },
  {
    name: "upsert: ON CONFLICT DO UPDATE with EXCLUDED",
    setup: ["CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text)"],
    sql: "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value RETURNING key, value",
    params: ["theme", "light"],
    expectKeys: ["key", "value"],
    expectTypes: { key: "string", value: "string" },
  },
  {
    name: "data-modifying CTE feeding an aggregate",
    setup: [],
    sql: "WITH moved AS (UPDATE posts SET views = views + 1 WHERE title = $1 RETURNING id, views) SELECT count(*) AS n, max(views) AS top FROM moved",
    params: ["conformance-tmp"],
    expectKeys: ["n", "top"],
    expectTypes: { n: "string", top: "number" },
  },
  {
    name: "DELETE ... USING ... RETURNING",
    setup: [],
    sql: "DELETE FROM posts p USING users u WHERE u.id = p.author_id AND u.email = $1 RETURNING p.id, u.email",
    params: ["conformance-insert@example.com"],
    expectKeys: ["id", "email"],
    expectTypes: { id: "string", email: "string" },
  },
  {
    // Keep last: removes the row the DML cases inserted, so the second driver's run sees the seed data.
    name: "DELETE ... RETURNING * (cleanup of the DML cases)",
    setup: [],
    sql: "DELETE FROM users WHERE email = $1 RETURNING *",
    params: ["conformance-insert@example.com"],
    expectKeys: ["id", "email", "display_name", "is_admin", "created_at", "birthday", "balance", "score", "meta"],
    expectTypes: { id: "number", email: "string", display_name: "string", is_admin: "boolean", created_at: "object", birthday: "null", balance: "string", score: "number", meta: "null" },
  },
] as const satisfies readonly ConformanceCase[];
