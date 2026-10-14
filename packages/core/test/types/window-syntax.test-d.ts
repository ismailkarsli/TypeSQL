import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// Window clause syntax and name resolution (window function typing: window.test-d.ts).
// Verified against PostgreSQL 17.

test("OVER (), PARTITION BY, ORDER BY and frame clauses", () => {
  expectTypeOf<Row<"SELECT row_number() OVER () AS rn FROM things">>().toEqualTypeOf<{ rn: string }>();
  expectTypeOf<Row<"SELECT rank() OVER (PARTITION BY flag, label ORDER BY id DESC NULLS LAST, big) AS r FROM things">>().toEqualTypeOf<{ r: string }>();
  expectTypeOf<Row<"SELECT sum(id) OVER (ORDER BY id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING EXCLUDE CURRENT ROW) AS s FROM things">>().toEqualTypeOf<{ s: string }>();
  expectTypeOf<Row<"SELECT sum(id) OVER (ORDER BY id RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS s FROM things">>().toEqualTypeOf<{ s: string }>();
  expectTypeOf<Row<"SELECT sum(id) OVER (ORDER BY id GROUPS 2 PRECEDING EXCLUDE TIES) AS s FROM things">>().toEqualTypeOf<{ s: string }>();
  expectTypeOf<Row<"SELECT sum(id) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING EXCLUDE NO OTHERS) AS s FROM things">>().toEqualTypeOf<{ s: string }>();
  expectTypeOf<Row<"SELECT count(*) FILTER (WHERE flag) OVER (PARTITION BY label) AS c FROM things">>().toEqualTypeOf<{ c: string }>();
  // window functions inside expressions and in ORDER BY
  expectTypeOf<Row<"SELECT coalesce(lag(id) OVER (ORDER BY id), 0) AS prev FROM things ORDER BY rank() OVER (ORDER BY label)">>().toEqualTypeOf<{ prev: number }>();
});

test("named windows: WINDOW w AS (...), OVER w, OVER (w ...), chained definitions", () => {
  expectTypeOf<Row<"SELECT sum(id) OVER w AS s FROM things WINDOW w AS (PARTITION BY flag)">>().toEqualTypeOf<{ s: string }>();
  expectTypeOf<Row<"SELECT rank() OVER (w ORDER BY id) AS r FROM things WINDOW w AS (PARTITION BY flag)">>().toEqualTypeOf<{ r: string }>();
  expectTypeOf<Row<"SELECT rank() OVER (w) AS r FROM things WINDOW w AS (PARTITION BY flag)">>().toEqualTypeOf<{ r: string }>();
  expectTypeOf<Row<"SELECT sum(id) OVER (w ROWS 1 PRECEDING) AS s FROM things WINDOW w AS (ORDER BY id)">>().toEqualTypeOf<{ s: string }>();
  expectTypeOf<Row<"SELECT rank() OVER w2 AS r, lag(label) OVER w AS l FROM things WINDOW w AS (PARTITION BY flag), w2 AS (w ORDER BY id)">>()
    .toEqualTypeOf<{ r: string; l: string | null }>();
  // a WINDOW clause nobody uses is still checked, and ORDER BY / LIMIT follow it
  expectTypeOf<Row<"SELECT id FROM things WINDOW w AS (ORDER BY label) ORDER BY id LIMIT 1">>().toEqualTypeOf<{ id: number }>();
});

test("window errors", () => {
  expectTypeOf<V<"SELECT rank() OVER w FROM things">>().toEqualTypeOf<SqlError<'window "w" does not exist', 5>>();
  expectTypeOf<V<"SELECT rank() OVER (w ORDER BY id) FROM things">>().toEqualTypeOf<SqlError<'window "w" does not exist', 6>>();
  expectTypeOf<V<"SELECT rank() OVER w FROM things WINDOW w AS (w2), w2 AS (ORDER BY id)">>().toEqualTypeOf<SqlError<'window "w2" does not exist', 12>>();
  expectTypeOf<V<"SELECT rank() OVER w FROM things WINDOW w AS (PARTITION BY flag), w AS (ORDER BY id)">>().toEqualTypeOf<SqlError<'window "w" is already defined', 5>>();
  expectTypeOf<V<"SELECT rank() OVER (w PARTITION BY id) FROM things WINDOW w AS (ORDER BY id)">>().toEqualTypeOf<SqlError<'cannot override PARTITION BY clause of window "w"', 6>>();
  expectTypeOf<V<"SELECT rank() OVER (w ORDER BY id) FROM things WINDOW w AS (ORDER BY label)">>().toEqualTypeOf<SqlError<'cannot override ORDER BY clause of window "w"', 6>>();
  expectTypeOf<V<"SELECT rank() OVER (PARTITION BY nope) FROM things">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 8>>();
  expectTypeOf<V<"SELECT id FROM things WINDOW w AS (ORDER BY nope)">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 10>>();
  // output aliases are not visible in window definitions
  expectTypeOf<V<"SELECT id AS n, rank() OVER (ORDER BY n) FROM things">>().toEqualTypeOf<SqlError<'column "n" does not exist', 3>>();
  // a WINDOW clause belongs to its own query level
  expectTypeOf<V<"SELECT (SELECT rank() OVER w FROM users LIMIT 1) FROM things WINDOW w AS (ORDER BY id)">>().toEqualTypeOf<SqlError<'window "w" does not exist', 7>>();
});
