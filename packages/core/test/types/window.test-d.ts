import { expectTypeOf, test } from "vitest";
import type { Row } from "./_schema.js";

// Window functions, verified against PostgreSQL 17.

test("ranking functions are int8 / float8 and never null", () => {
  expectTypeOf<Row<"SELECT row_number() OVER () AS a, rank() OVER (ORDER BY id) AS b, dense_rank() OVER (PARTITION BY flag ORDER BY id) AS c, percent_rank() OVER (ORDER BY id) AS d, cume_dist() OVER (ORDER BY id) AS e, ntile(4) OVER (ORDER BY id) AS f FROM things">>()
    .toEqualTypeOf<{ a: string; b: string; c: string; d: number; e: number; f: number }>();
  // ntile is strict in its argument
  expectTypeOf<Row<"SELECT ntile(n_id) OVER () AS a FROM things">>().toEqualTypeOf<{ a: number | null }>();
});

test("lag / lead / first_value / last_value / nth_value", () => {
  // lag/lead have no row to look at on the first/last row → nullable, unless a non-null default is given
  expectTypeOf<Row<"SELECT lag(id) OVER (ORDER BY id) AS a, lead(label, 1) OVER (ORDER BY id) AS b, lag(id, 1, 0) OVER (ORDER BY id) AS c, lag(id, 1, n_id) OVER (ORDER BY id) AS d, lead(n_text) OVER () AS e, lag(mood) OVER () AS f FROM things">>()
    .toEqualTypeOf<{ a: number | null; b: string | null; c: number; d: number | null; e: string | null; f: "happy" | "sad" | null }>();
  expectTypeOf<Row<"SELECT first_value(id) OVER (ORDER BY id) AS a, last_value(label) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS b, nth_value(day, 2) OVER (ORDER BY id) AS c FROM things">>()
    .toEqualTypeOf<{ a: number | null; b: string | null; c: Date | null }>();
});

test("aggregates as window functions: the frame is never empty, so nullability follows the argument", () => {
  expectTypeOf<Row<"SELECT sum(id) OVER () AS a, sum(n_big) OVER (PARTITION BY flag) AS b, count(*) OVER () AS c, max(label) OVER (ORDER BY id) AS d, avg(price) OVER () AS e, array_agg(id) OVER () AS f, string_agg(label, ',') OVER () AS g, bool_and(flag) OVER () AS h FROM things">>()
    .toEqualTypeOf<{ a: string; b: string | null; c: string; d: string; e: string; f: number[]; g: string; h: boolean }>();
  // FILTER can empty the frame
  expectTypeOf<Row<"SELECT sum(id) FILTER (WHERE flag) OVER () AS a, count(id) FILTER (WHERE flag) OVER () AS b FROM things">>()
    .toEqualTypeOf<{ a: string | null; b: string }>();
  // the window form is not affected by the absence of GROUP BY elsewhere
  expectTypeOf<Row<"SELECT sum(id) OVER (ORDER BY id ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS running, sum(id) AS total FROM things">>()
    .toEqualTypeOf<{ running: string; total: string | null }>();
});

test("window functions over outer-joined columns and expressions", () => {
  expectTypeOf<Row<"SELECT row_number() OVER (PARTITION BY u.id ORDER BY p.id) AS rn, lag(p.title) OVER (ORDER BY p.id) AS prev, sum(p.author_id) OVER () AS s FROM users u LEFT JOIN posts p ON p.author_id = u.id">>()
    .toEqualTypeOf<{ rn: string; prev: string | null; s: string | null }>();
  expectTypeOf<Row<"SELECT (row_number() OVER ())::int4 AS rn, rank() OVER (ORDER BY id) = 1 AS first FROM things">>()
    .toEqualTypeOf<{ rn: number; first: boolean }>();
});

test("window function column names", () => {
  expectTypeOf<Row<"SELECT row_number() OVER (), lag(id) OVER (ORDER BY id), sum(id) OVER () FROM things">>()
    .toEqualTypeOf<{ row_number: string; lag: number | null; sum: string }>();
});

// Named windows (`OVER w ... WINDOW w AS (...)`) are parsed by `ParseOver`, but the WINDOW
// clause itself is not yet supported by the SELECT parser; see the final report.
// test("named windows", () => {
//   expectTypeOf<Row<"SELECT sum(id) OVER w AS s FROM things WINDOW w AS (PARTITION BY flag)">>().toEqualTypeOf<{ s: string }>();
// });
