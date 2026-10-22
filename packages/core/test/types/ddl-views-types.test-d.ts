import { expectTypeOf, test } from "vitest";
import { createSql, type ApplyDdl, type Col, type Generated, type Nullable, type NullableGenerated, type RowType, type ParamsOf, type DefaultTypeMap, type RowOf, type SqlError, type Sig, type View } from "../../src/index.js";

interface DB {
  users: { id: Generated<"int4">; email: Col<"text">; name: Nullable<"text">; mood: Nullable<"mood"> };
  posts: { id: Generated<"int8">; author_id: Col<"int4">; title: Col<"text"> };
  $types: { mood: "happy" | "sad" };
}
type A<Q extends string> = ApplyDdl<DB, Q>;

test("CREATE VIEW: columns and nullability come from the query", () => {
  expectTypeOf<A<"CREATE VIEW v AS SELECT id, email, name FROM users">["v"]>().toEqualTypeOf<View<{ id: Col<"int4">; email: Col<"text">; name: Nullable<"text"> }>>();
  expectTypeOf<A<"CREATE VIEW v (a, b) AS SELECT id, name, email FROM users">["v"]>().toEqualTypeOf<View<{ a: Col<"int4">; b: Nullable<"text">; email: Col<"text"> }>>();
  expectTypeOf<A<"CREATE OR REPLACE VIEW counts AS SELECT u.id, count(p.id) AS n, max(p.title) AS last FROM users u LEFT JOIN posts p ON p.author_id = u.id GROUP BY u.id">["counts"]>().toEqualTypeOf<View<{
    id: Col<"int4">; n: Col<"int8">; last: Nullable<"text">;
  }>>();
  expectTypeOf<A<"CREATE TEMP VIEW v WITH (security_barrier = true) AS SELECT * FROM posts WHERE id > 10 WITH LOCAL CHECK OPTION">["v"]>().toEqualTypeOf<View<{ id: Col<"int8">; author_id: Col<"int4">; title: Col<"text"> }>>();
  expectTypeOf<A<"CREATE MATERIALIZED VIEW mv AS SELECT email FROM users WITH NO DATA">["mv"]>().toEqualTypeOf<View<{ email: Col<"text"> }>>();
  expectTypeOf<A<"CREATE SCHEMA rpt; CREATE VIEW rpt.emails AS SELECT email FROM public.users">["rpt"]>().toEqualTypeOf<{ emails: View<{ email: Col<"text"> }> }>();
});

test("CREATE OR REPLACE VIEW and IF NOT EXISTS", () => {
  type DB2 = A<"CREATE VIEW v AS SELECT id FROM users">;
  expectTypeOf<ApplyDdl<DB2, "CREATE OR REPLACE VIEW v AS SELECT id, email FROM users">["v"]>().toEqualTypeOf<View<{ id: Col<"int4">; email: Col<"text"> }>>();
  expectTypeOf<ApplyDdl<DB2, "CREATE OR REPLACE VIEW v AS SELECT email FROM users">>().toEqualTypeOf<SqlError<"cannot drop columns from view", 0>>();
  expectTypeOf<ApplyDdl<DB2, "CREATE OR REPLACE VIEW v AS SELECT id::int8 AS id FROM users">>().toEqualTypeOf<SqlError<'cannot change data type of view column "id" from integer to bigint', 7>>();
  type DB3 = A<"CREATE MATERIALIZED VIEW mv AS SELECT id FROM users">;
  expectTypeOf<ApplyDdl<DB3, "CREATE MATERIALIZED VIEW IF NOT EXISTS mv AS SELECT email FROM users">>().toEqualTypeOf<DB3>();
});

test("DROP VIEW", () => {
  type DB2 = A<"CREATE VIEW v AS SELECT id FROM users; CREATE MATERIALIZED VIEW mv AS SELECT email FROM users">;
  expectTypeOf<ApplyDdl<DB2, "DROP VIEW v">>().toEqualTypeOf<A<"CREATE MATERIALIZED VIEW mv AS SELECT email FROM users">>();
  expectTypeOf<ApplyDdl<DB2, "DROP VIEW IF EXISTS v, nope CASCADE; DROP MATERIALIZED VIEW mv">>().toEqualTypeOf<{ users: DB["users"]; posts: DB["posts"]; $types: DB["$types"] }>();
});

test("view errors", () => {
  expectTypeOf<A<"CREATE VIEW users AS SELECT 1 AS x">>().toEqualTypeOf<SqlError<'relation "users" already exists', 2>>();
  expectTypeOf<A<"CREATE OR REPLACE VIEW users AS SELECT 1 AS x">>().toEqualTypeOf<SqlError<'"users" is not a view', 4>>();
  expectTypeOf<A<"CREATE VIEW v AS SELECT nope FROM users">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 5>>();
  expectTypeOf<A<"CREATE VIEW v (a, b, c) AS SELECT 1, 2">>().toEqualTypeOf<SqlError<"CREATE VIEW specifies more column names than columns", 0>>();
  expectTypeOf<A<"CREATE VIEW v AS SELECT id, id FROM users">>().toEqualTypeOf<SqlError<'column "id" specified more than once', 7>>();
  expectTypeOf<A<"CREATE VIEW IF NOT EXISTS v AS SELECT 1">>().toEqualTypeOf<SqlError<"syntax error: expected AS at or near not", 3>>();
  expectTypeOf<A<"CREATE RECURSIVE VIEW v (n) AS SELECT 1">>().toEqualTypeOf<SqlError<"CREATE RECURSIVE VIEW is not supported; write the view as WITH RECURSIVE ... SELECT", 1>>();
  expectTypeOf<A<"CREATE OR REPLACE MATERIALIZED VIEW mv AS SELECT 1">>().toEqualTypeOf<SqlError<"syntax error at or near materialized", 3>>();
  expectTypeOf<A<"CREATE VIEW v (x) AS SELECT * FROM users">>().toEqualTypeOf<SqlError<"a column name list cannot rename the columns of a * projection (TypeSQL limitation): list the columns explicitly", 0>>();
  expectTypeOf<A<"DROP VIEW users">>().toEqualTypeOf<SqlError<'"users" is not a view', 2>>();
  expectTypeOf<A<"DROP VIEW nope">>().toEqualTypeOf<SqlError<'view "nope" does not exist', 2>>();
  expectTypeOf<A<"DROP MATERIALIZED VIEW nope">>().toEqualTypeOf<SqlError<'materialized view "nope" does not exist', 3>>();
});

test("enums: CREATE / ALTER / DROP TYPE", () => {
  expectTypeOf<A<"CREATE TYPE status AS ENUM ('draft', 'published')">["$types"]>().toEqualTypeOf<{ mood: "happy" | "sad"; status: "draft" | "published" }>();
  expectTypeOf<ApplyDdl<{}, "CREATE TYPE app.kind AS ENUM ('a')">>().toEqualTypeOf<{ $types: { kind: "a" } }>();
  expectTypeOf<A<"ALTER TYPE mood ADD VALUE 'meh' BEFORE 'sad'">["$types"]>().toEqualTypeOf<{ mood: "happy" | "sad" | "meh" }>();
  expectTypeOf<A<"ALTER TYPE mood ADD VALUE IF NOT EXISTS 'happy'">["$types"]>().toEqualTypeOf<{ mood: "happy" | "sad" }>();
  expectTypeOf<A<"ALTER TYPE mood RENAME VALUE 'sad' TO 'blue'">["$types"]>().toEqualTypeOf<{ mood: "happy" | "blue" }>();
  expectTypeOf<A<"ALTER TYPE mood RENAME TO feeling">>().toEqualTypeOf<{
    users: { id: Generated<"int4">; email: Col<"text">; name: Nullable<"text">; mood: Nullable<"feeling"> };
    posts: DB["posts"];
    $types: { feeling: "happy" | "sad" };
  }>();
  expectTypeOf<A<"CREATE TYPE pair AS (a int, b text); CREATE TYPE r AS RANGE (subtype = int4); ALTER TYPE mood OWNER TO bob">>().toEqualTypeOf<DB>();
  expectTypeOf<ApplyDdl<{ $types: { a: "x"; b: "y" } }, "DROP TYPE a; DROP TYPE IF EXISTS nope, b">>().toEqualTypeOf<{ $types: {} }>();
  // CASCADE drops the dependent columns
  expectTypeOf<A<"DROP TYPE mood CASCADE">>().toEqualTypeOf<{
    users: { id: Generated<"int4">; email: Col<"text">; name: Nullable<"text"> };
    posts: DB["posts"];
    $types: {};
  }>();
});

test("enum errors", () => {
  expectTypeOf<A<"CREATE TYPE mood AS ENUM ('x')">>().toEqualTypeOf<SqlError<'type "mood" already exists', 2>>();
  expectTypeOf<A<"ALTER TYPE mood ADD VALUE 'happy'">>().toEqualTypeOf<SqlError<'enum label "happy" already exists', 5>>();
  expectTypeOf<A<"ALTER TYPE mood RENAME VALUE 'zz' TO 'y'">>().toEqualTypeOf<SqlError<'"zz" is not an existing enum label', 5>>();
  expectTypeOf<A<"ALTER TYPE mood RENAME VALUE 'happy' TO 'sad'">>().toEqualTypeOf<SqlError<'enum label "sad" already exists', 7>>();
  expectTypeOf<A<"ALTER TYPE nope ADD VALUE 'x'">>().toEqualTypeOf<SqlError<'type "nope" does not exist', 2>>();
  expectTypeOf<A<"DROP TYPE nope">>().toEqualTypeOf<SqlError<'type "nope" does not exist', 2>>();
  expectTypeOf<A<"DROP TYPE mood">>().toEqualTypeOf<SqlError<"cannot drop type mood because other objects depend on it", 2>>();
});

test("schemas", () => {
  expectTypeOf<ApplyDdl<{}, "CREATE SCHEMA app">>().toEqualTypeOf<{ app: {} }>();
  expectTypeOf<ApplyDdl<{}, "CREATE SCHEMA AUTHORIZATION bob; CREATE SCHEMA IF NOT EXISTS bob">>().toEqualTypeOf<{ bob: {} }>();
  expectTypeOf<ApplyDdl<{ app: {} }, "DROP SCHEMA app">>().toEqualTypeOf<{}>();
  expectTypeOf<ApplyDdl<{ app: { t: { id: Col<"int4"> } } }, "DROP SCHEMA IF EXISTS nope; DROP SCHEMA app CASCADE">>().toEqualTypeOf<{}>();
  expectTypeOf<ApplyDdl<{ app: { t: { id: Col<"int4"> } } }, "ALTER SCHEMA app RENAME TO core; ALTER SCHEMA core OWNER TO bob">>().toEqualTypeOf<{ core: { t: { id: Col<"int4"> } } }>();
  expectTypeOf<ApplyDdl<{}, "CREATE SCHEMA a; CREATE SCHEMA b; DROP SCHEMA a, b">>().toEqualTypeOf<{}>();
  expectTypeOf<ApplyDdl<{ app: {} }, "CREATE SCHEMA app">>().toEqualTypeOf<SqlError<'schema "app" already exists', 2>>();
  expectTypeOf<ApplyDdl<{}, "DROP SCHEMA nope">>().toEqualTypeOf<SqlError<'schema "nope" does not exist', 2>>();
  expectTypeOf<ApplyDdl<{ t: { id: Col<"int4"> } }, "CREATE SCHEMA t">>().toEqualTypeOf<SqlError<'cannot create schema "t": a relation with that name exists (TypeSQL keeps schemas and public relations in one object)', 2>>();
  expectTypeOf<ApplyDdl<{}, "CREATE SCHEMA s CREATE TABLE t (x int)">>().toEqualTypeOf<SqlError<"schema elements in CREATE SCHEMA are not supported; use separate statements", 3>>();
  expectTypeOf<ApplyDdl<{ app: { t: { id: Col<"int4"> } } }, "DROP SCHEMA app">>().toEqualTypeOf<SqlError<"cannot drop schema app because other objects depend on it", 2>>();
});

test("statements without schema effect leave the schema unchanged", () => {
  expectTypeOf<A<`
    BEGIN;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_email_idx ON users (lower(email)) WHERE name IS NOT NULL;
    CREATE INDEX ON posts USING btree (author_id);
    CREATE SEQUENCE IF NOT EXISTS seq START 1;
    CREATE PROCEDURE noop() LANGUAGE sql BEGIN ATOMIC SELECT 1; END;
    CREATE TRIGGER t BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch();
    DO $$ BEGIN RAISE NOTICE 'hi'; END $$;
    COMMENT ON TABLE users IS 'people; and things';
    COMMENT ON COLUMN users.email IS NULL;
    GRANT SELECT, INSERT ON users TO app_user;
    REVOKE ALL ON posts FROM PUBLIC;
    TRUNCATE posts RESTART IDENTITY CASCADE;
    SET search_path TO public;
    ALTER SEQUENCE seq RESTART WITH 10;
    DROP INDEX IF EXISTS users_email_idx;
    CREATE POLICY p ON users USING (id > 0);
    CREATE DOMAIN posint AS int CHECK (VALUE > 0);
    ANALYZE users;
    COMMIT;
  `>>().toEqualTypeOf<DB>();
});

test("CREATE FUNCTION registers the function's result type in $functions", () => {
  type S = A<`
    CREATE OR REPLACE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at := now(); RETURN NEW; END;
    $$;
    CREATE FUNCTION add(a int, b int) RETURNS int LANGUAGE sql IMMUTABLE BEGIN ATOMIC SELECT a + b; END;
    CREATE FUNCTION public.slugs(t text) RETURNS SETOF varchar(80) AS 'SELECT 1' LANGUAGE sql;
    CREATE FUNCTION pairs() RETURNS TABLE (a int, b text) AS 'SELECT 1, 2' LANGUAGE sql;
    CREATE FUNCTION outs(OUT a int) AS 'SELECT 1' LANGUAGE sql;
  `>;
  expectTypeOf<S["$functions"]>().toEqualTypeOf<{
    touch: Sig<["..."], "trigger">;
    add: Sig<["..."], "int4">;
    slugs: Sig<["..."], "varchar", { srf: true }>;
    pairs: Sig<["..."], "record", { srf: true }>;
    outs: Sig<["..."], "unknown">;
  }>();
  expectTypeOf<Omit<S, "$functions">>().toEqualTypeOf<DB>();
  // queries in the same script, views and later queries see the functions
  type S2 = A<"CREATE FUNCTION add(a int, b int) RETURNS int AS 'SELECT a + b' LANGUAGE sql; CREATE VIEW sums AS SELECT add(id, 1) AS n FROM users">;
  expectTypeOf<S2["sums"]>().toEqualTypeOf<View<{ n: Col<"int4"> }>>();
  expectTypeOf<RowOf<S, DefaultTypeMap, "SELECT add(id, 2) AS n, s FROM users, slugs('x') AS s">>().toEqualTypeOf<{ n: number; s: string }>();
  expectTypeOf<ApplyDdl<DB, "CREATE VIEW v AS SELECT nope(id) AS n FROM users">>()
    .toEqualTypeOf<SqlError<"function nope(int4) does not exist. Declare it in the schema's $functions or in FunctionCatalog", 5>>();
});

test("data statements in scripts are validated and leave the schema unchanged", () => {
  expectTypeOf<A<"INSERT INTO users (email) VALUES ('a'); UPDATE users SET name = 'x' WHERE id = 1; DELETE FROM posts; SELECT 1">>().toEqualTypeOf<DB>();
  expectTypeOf<A<"CREATE TABLE t (x int); INSERT INTO t (x) VALUES (1)">["t"]>().toEqualTypeOf<{ x: Nullable<"int4"> }>();
  expectTypeOf<A<"CREATE TABLE t (x int); INSERT INTO t (nope) VALUES (1)">>().toEqualTypeOf<SqlError<'column "nope" of relation "t" does not exist', 12>>();
});

test("multi-statement scripts: errors carry the token index in the whole script", () => {
  expectTypeOf<ApplyDdl<{}, "CREATE TABLE a (x int); CREATE TABLE a (y int)">>().toEqualTypeOf<SqlError<'relation "a" already exists', 10>>();
  expectTypeOf<ApplyDdl<{}, "CREATE TABLE a (x int);; CREATE TABLE b (y int);">>().toEqualTypeOf<{ a: { x: Nullable<"int4"> }; b: { y: Nullable<"int4"> } }>();
  expectTypeOf<ApplyDdl<{}, "CREATE TABLE a (x int) CREATE TABLE b (y int)">>().toEqualTypeOf<SqlError<"syntax error at or near create", 7>>();
  expectTypeOf<ApplyDdl<{}, "">>().toEqualTypeOf<{}>();
});

test("end to end: query the evolved schema", () => {
  type Schema = ApplyDdl<{}, `
    CREATE TYPE mood AS ENUM ('happy', 'sad');
    CREATE TABLE users (
      id serial PRIMARY KEY,
      email text NOT NULL UNIQUE,
      mood mood,
      moods mood[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE posts (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      author_id int NOT NULL REFERENCES users ON DELETE CASCADE,
      title text NOT NULL,
      body text
    );
    ALTER TABLE posts ADD COLUMN published boolean NOT NULL DEFAULT false;
    CREATE VIEW post_counts AS
      SELECT u.id, u.email, count(p.id) AS n FROM users u LEFT JOIN posts p ON p.author_id = u.id GROUP BY u.id, u.email;
  `>;
  const sql = createSql<Schema>();

  const q = sql("SELECT u.id, u.mood, u.moods, p.title, p.published FROM users u JOIN posts p ON p.author_id = u.id WHERE u.id = $1", 1);
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ id: number; mood: "happy" | "sad" | null; moods: ("happy" | "sad")[]; title: string; published: boolean }>();
  expectTypeOf<ParamsOf<Schema, DefaultTypeMap, "SELECT id FROM users WHERE mood = $1 AND created_at > $2">>().toEqualTypeOf<["happy" | "sad" | null, Date | string | null]>();

  const ins = sql("INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id, published", 1, "hello");
  expectTypeOf<RowType<typeof ins>>().toEqualTypeOf<{ id: string; published: boolean }>();

  const v = sql("SELECT email, n FROM post_counts WHERE id = $1", 1);
  expectTypeOf<RowType<typeof v>>().toEqualTypeOf<{ email: string; n: string }>();

  // @ts-expect-error views are read-only
  sql("INSERT INTO post_counts (id) VALUES (1)");
  // @ts-expect-error title is NOT NULL without default
  sql("INSERT INTO posts (author_id) VALUES (1)");
});
