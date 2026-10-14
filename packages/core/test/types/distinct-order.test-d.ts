import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// DISTINCT [ON], ORDER BY, GROUP BY references, LIMIT / OFFSET / FETCH, locking, TABLE.
// Verified against PostgreSQL 17.

test("DISTINCT and DISTINCT ON do not change the row type; DISTINCT ON is validated", () => {
  expectTypeOf<Row<"SELECT DISTINCT id FROM users">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT ALL id FROM users">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT DISTINCT ON (author_id) author_id, title FROM posts ORDER BY author_id, id DESC">>().toEqualTypeOf<{ author_id: number; title: string }>();
  expectTypeOf<Row<"SELECT DISTINCT ON (author_id, title) author_id, title FROM posts ORDER BY title, author_id, id">>().toEqualTypeOf<{ author_id: number; title: string }>();
  expectTypeOf<Row<"SELECT DISTINCT ON (p.author_id) author_id, title FROM posts p ORDER BY author_id">>().toEqualTypeOf<{ author_id: number; title: string }>();
  expectTypeOf<Row<"SELECT DISTINCT ON (1) author_id AS a, title FROM posts ORDER BY a">>().toEqualTypeOf<{ a: number; title: string }>();
  expectTypeOf<Row<"SELECT DISTINCT ON (lower(title)) title FROM posts ORDER BY lower(title)">>().toEqualTypeOf<{ title: string }>();
  expectTypeOf<Row<"SELECT DISTINCT ON (author_id) title FROM posts">>().toEqualTypeOf<{ title: string }>();
  expectTypeOf<V<"SELECT DISTINCT ON (nope) id FROM posts">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 4>>();
  expectTypeOf<V<"SELECT DISTINCT ON (author_id) author_id, title FROM posts ORDER BY title">>()
    .toEqualTypeOf<SqlError<"SELECT DISTINCT ON expressions must match initial ORDER BY expressions", 0>>();
  expectTypeOf<V<"SELECT DISTINCT ON (author_id, title) author_id, title FROM posts ORDER BY title, id">>()
    .toEqualTypeOf<SqlError<"SELECT DISTINCT ON expressions must match initial ORDER BY expressions", 0>>();
  // SELECT DISTINCT: ORDER BY expressions must be in the select list
  expectTypeOf<Row<"SELECT DISTINCT id, email FROM users ORDER BY email">>().toEqualTypeOf<{ id: number; email: string }>();
  expectTypeOf<Row<"SELECT DISTINCT id FROM users ORDER BY users.id">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<V<"SELECT DISTINCT id FROM users ORDER BY email">>().toEqualTypeOf<SqlError<"for SELECT DISTINCT, ORDER BY expressions must appear in select list", 0>>();
});

test("ORDER BY: output names, positions and input expressions", () => {
  expectTypeOf<Row<"SELECT id AS n FROM users ORDER BY n DESC">>().toEqualTypeOf<{ n: number }>();
  expectTypeOf<Row<"SELECT id FROM users ORDER BY 1 ASC NULLS FIRST">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id FROM users u ORDER BY u.email, created_at DESC">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT lower(email) FROM users ORDER BY lower">>().toEqualTypeOf<{ lower: string }>();
  expectTypeOf<Row<"SELECT author_id, count(*) AS n FROM posts GROUP BY author_id ORDER BY n DESC, count(*)">>().toEqualTypeOf<{ author_id: number; n: string }>();
  // an output name wins over an input column of the same name
  expectTypeOf<Row<"SELECT id AS email FROM users ORDER BY email">>().toEqualTypeOf<{ email: number }>();
  // the same expression twice is not ambiguous
  expectTypeOf<Row<"SELECT id, id FROM users ORDER BY id">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id, (SELECT 1) AS s FROM users ORDER BY s">>().toEqualTypeOf<{ id: number; s: number | null }>();
  expectTypeOf<V<"SELECT id FROM users ORDER BY 2">>().toEqualTypeOf<SqlError<"ORDER BY position 2 is not in select list", 0>>();
  expectTypeOf<V<"SELECT id FROM users ORDER BY 0">>().toEqualTypeOf<SqlError<"ORDER BY position 0 is not in select list", 0>>();
  expectTypeOf<V<"SELECT id FROM users ORDER BY -1">>().toEqualTypeOf<SqlError<"ORDER BY position -1 is not in select list", 0>>();
  expectTypeOf<V<"SELECT id, email FROM users ORDER BY 1.5">>().toEqualTypeOf<SqlError<"non-integer constant in ORDER BY", 0>>();
  expectTypeOf<V<"SELECT id, email FROM users ORDER BY 'x'">>().toEqualTypeOf<SqlError<"non-integer constant in ORDER BY", 0>>();
  expectTypeOf<V<"SELECT id FROM users ORDER BY nope">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 6>>();
  // output aliases are not visible inside expressions
  expectTypeOf<V<"SELECT id + 1 AS n FROM users ORDER BY n + 1">>().toEqualTypeOf<SqlError<'column "n" does not exist', 5>>();
  expectTypeOf<V<"SELECT u.id AS x FROM users u ORDER BY u.x">>().toEqualTypeOf<SqlError<"column u.x does not exist", 5>>();
  expectTypeOf<V<"SELECT u.id, p.id FROM users u, posts p ORDER BY id">>().toEqualTypeOf<SqlError<'ORDER BY "id" is ambiguous', 3>>();
  expectTypeOf<V<"SELECT id AS x, email AS x FROM users ORDER BY x">>().toEqualTypeOf<SqlError<'ORDER BY "x" is ambiguous', 3>>();
});

test("GROUP BY: input columns first, then output names and positions", () => {
  expectTypeOf<Row<"SELECT id FROM users GROUP BY 1">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id AS n FROM users GROUP BY n">>().toEqualTypeOf<{ n: number }>();
  expectTypeOf<Row<"SELECT id + 1 AS n FROM users GROUP BY n">>().toEqualTypeOf<{ n: number }>();
  expectTypeOf<Row<"SELECT lower(email) AS e, count(*) FROM users GROUP BY e">>().toEqualTypeOf<{ e: string; count: string }>();
  expectTypeOf<Row<"SELECT u.id FROM users u GROUP BY u.id, ROLLUP (email)">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<V<"SELECT id FROM users GROUP BY 2">>().toEqualTypeOf<SqlError<"GROUP BY position 2 is not in select list", 0>>();
  expectTypeOf<V<"SELECT id FROM users GROUP BY 'x'">>().toEqualTypeOf<SqlError<"non-integer constant in GROUP BY", 0>>();
  expectTypeOf<V<"SELECT id FROM users GROUP BY nope">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 6>>();
  expectTypeOf<V<"SELECT id AS x, email AS x FROM users GROUP BY x">>().toEqualTypeOf<SqlError<'GROUP BY "x" is ambiguous', 3>>();
  expectTypeOf<V<"SELECT 1 FROM users HAVING nope > 1">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 5>>();
});

test("LIMIT / OFFSET / FETCH and locking clauses do not change the row", () => {
  expectTypeOf<Row<"SELECT id FROM users LIMIT 10 OFFSET 5">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id FROM users OFFSET 5 LIMIT ALL">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id FROM users ORDER BY id OFFSET 5 ROWS FETCH FIRST 10 ROWS ONLY">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id FROM users ORDER BY id FETCH NEXT ROW WITH TIES">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT * FROM users ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1">>().toEqualTypeOf<{ id: number; email: string; display_name: string | null; created_at: Date }>();
  expectTypeOf<Row<"SELECT id FROM users u FOR SHARE OF u NOWAIT">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id FROM users FOR NO KEY UPDATE FOR KEY SHARE">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Row<"SELECT id FROM users LIMIT 1 FOR UPDATE">>().toEqualTypeOf<{ id: number }>();
});

test("TABLE t is SELECT * FROM t", () => {
  expectTypeOf<Row<"TABLE users">>().toEqualTypeOf<{ id: number; email: string; display_name: string | null; created_at: Date }>();
  expectTypeOf<Row<"TABLE ONLY users ORDER BY id LIMIT 1">>().toEqualTypeOf<{ id: number; email: string; display_name: string | null; created_at: Date }>();
  expectTypeOf<Row<"SELECT * FROM (TABLE users) t WHERE t.display_name IS NOT NULL">>().toEqualTypeOf<{ id: number; email: string; display_name: string; created_at: Date }>();
});
