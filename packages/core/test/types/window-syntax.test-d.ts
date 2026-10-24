import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// Window clause syntax and name resolution (window function typing: window.test-d.ts).
// Verified against PostgreSQL 18.

test("OVER (), PARTITION BY, ORDER BY and frame clauses", () => {
	expectTypeOf<
		Row<"SELECT row_number() OVER () AS rn FROM things">
	>().toEqualTypeOf<{ rn: string }>();
	expectTypeOf<
		Row<"SELECT rank() OVER (PARTITION BY flag, label ORDER BY id DESC NULLS LAST, big) AS r FROM things">
	>().toEqualTypeOf<{ r: string }>();
	expectTypeOf<
		Row<"SELECT sum(id) OVER (ORDER BY id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING EXCLUDE CURRENT ROW) AS s FROM things">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		Row<"SELECT sum(id) OVER (ORDER BY id RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS s FROM things">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		Row<"SELECT sum(id) OVER (ORDER BY id GROUPS 2 PRECEDING EXCLUDE TIES) AS s FROM things">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		Row<"SELECT sum(id) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING EXCLUDE NO OTHERS) AS s FROM things">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		Row<"SELECT count(*) FILTER (WHERE flag) OVER (PARTITION BY label) AS c FROM things">
	>().toEqualTypeOf<{ c: string }>();
	// window functions inside expressions and in ORDER BY
	expectTypeOf<
		Row<"SELECT coalesce(lag(id) OVER (ORDER BY id), 0) AS prev FROM things ORDER BY rank() OVER (ORDER BY label)">
	>().toEqualTypeOf<{ prev: number }>();
});

test("named windows: WINDOW w AS (...), OVER w, OVER (w ...), chained definitions", () => {
	expectTypeOf<
		Row<"SELECT sum(id) OVER w AS s FROM things WINDOW w AS (PARTITION BY flag)">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		Row<"SELECT rank() OVER (w ORDER BY id) AS r FROM things WINDOW w AS (PARTITION BY flag)">
	>().toEqualTypeOf<{ r: string }>();
	expectTypeOf<
		Row<"SELECT rank() OVER (w) AS r FROM things WINDOW w AS (PARTITION BY flag)">
	>().toEqualTypeOf<{ r: string }>();
	expectTypeOf<
		Row<"SELECT sum(id) OVER (w ROWS 1 PRECEDING) AS s FROM things WINDOW w AS (ORDER BY id)">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		Row<"SELECT rank() OVER w2 AS r, lag(label) OVER w AS l FROM things WINDOW w AS (PARTITION BY flag), w2 AS (w ORDER BY id)">
	>().toEqualTypeOf<{ r: string; l: string | null }>();
	// a WINDOW clause nobody uses is still checked, and ORDER BY / LIMIT follow it
	expectTypeOf<
		Row<"SELECT id FROM things WINDOW w AS (ORDER BY label) ORDER BY id LIMIT 1">
	>().toEqualTypeOf<{ id: number }>();
});

test("window references: inherited ORDER BY, windows inside expressions and subqueries", () => {
	expectTypeOf<
		V<"SELECT rank() OVER (w) FROM users WINDOW w AS (ORDER BY id)">
	>().toEqualTypeOf<"SELECT rank() OVER (w) FROM users WINDOW w AS (ORDER BY id)">();
	expectTypeOf<
		V<"SELECT rank() OVER (w ORDER BY id) FROM users WINDOW w AS (PARTITION BY email)">
	>().toEqualTypeOf<"SELECT rank() OVER (w ORDER BY id) FROM users WINDOW w AS (PARTITION BY email)">();
	expectTypeOf<V<"SELECT sum(id) OVER nope + 1 FROM users">>().toEqualTypeOf<
		SqlError<'window "nope" does not exist', 6>
	>();
	expectTypeOf<
		V<"SELECT rank() OVER w3 FROM users WINDOW w1 AS (ORDER BY id), w2 AS (w1), w3 AS (w2 ORDER BY email)">
	>().toEqualTypeOf<
		SqlError<'cannot override ORDER BY clause of window "w2"', 17>
	>();
	expectTypeOf<
		V<"SELECT rank() OVER w3 FROM users WINDOW w1 AS (PARTITION BY email), w2 AS (w1 ORDER BY id), w3 AS (w2 ORDER BY id)">
	>().toEqualTypeOf<
		SqlError<'cannot override ORDER BY clause of window "w2"', 17>
	>();
	expectTypeOf<
		V<"SELECT rank() OVER w3 FROM users WINDOW w1 AS (PARTITION BY email), w2 AS (w1), w3 AS (w2 ORDER BY id)">
	>().toEqualTypeOf<"SELECT rank() OVER w3 FROM users WINDOW w1 AS (PARTITION BY email), w2 AS (w1), w3 AS (w2 ORDER BY id)">();
	expectTypeOf<
		V<"SELECT (SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS a, EXISTS (SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS b, ARRAY(SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS c, 1 IN (SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS d FROM users">
	>().toEqualTypeOf<"SELECT (SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS a, EXISTS (SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS b, ARRAY(SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS c, 1 IN (SELECT sum(1) OVER w FROM users WINDOW w AS ()) AS d FROM users">();
});

test("windows anywhere in an expression are checked (not inside subqueries)", () => {
	expectTypeOf<
		V<"SELECT CASE WHEN sum(id) OVER nope > 0 THEN 1 END FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 8>>();
	expectTypeOf<
		V<"SELECT CASE sum(id) OVER nope WHEN 1 THEN 1 END FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT CASE WHEN true THEN 1 ELSE sum(id) OVER nope END FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 12>>();
	expectTypeOf<
		V<"SELECT CASE WHEN true THEN sum(id) OVER nope END FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 10>>();
	expectTypeOf<
		V<"SELECT ARRAY[1, sum(id) OVER nope] FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 10>>();
	expectTypeOf<
		V<"SELECT ROW(1, sum(id) OVER nope) FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 10>>();
	expectTypeOf<
		V<"SELECT 1 IS DISTINCT FROM sum(id) OVER nope FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 10>>();
	expectTypeOf<
		V<"SELECT sum(id) OVER nope BETWEEN 1 AND 2 FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 6>>();
	expectTypeOf<
		V<"SELECT 1 BETWEEN sum(id) OVER nope AND 2 FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 8>>();
	expectTypeOf<
		V<"SELECT 1 IN (2, sum(id) OVER nope) FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 11>>();
	expectTypeOf<
		V<"SELECT email LIKE email || (sum(id) OVER nope)::text FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 11>>();
	expectTypeOf<
		V<"SELECT (ARRAY[1])[sum(id) OVER nope] FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 13>>();
	expectTypeOf<
		V<"SELECT now() AT TIME ZONE (sum(id) OVER nope)::text FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 13>>();
	expectTypeOf<
		V<"SELECT 1 = ANY (ARRAY[sum(id) OVER nope]) FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 12>>();
	expectTypeOf<
		V<"SELECT 1 = ANY (SELECT sum(id) OVER w FROM users WINDOW w AS ()) FROM users">
	>().toEqualTypeOf<"SELECT 1 = ANY (SELECT sum(id) OVER w FROM users WINDOW w AS ()) FROM users">();
	expectTypeOf<
		V<"SELECT (sum(id) OVER nope)::text FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT 1 + 2 + sum(id) OVER nope FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 10>>();
	expectTypeOf<
		V<"SELECT coalesce(1, 2, sum(id) OVER nope) FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 12>>();
});

test("a window in the operand of IN (SELECT …) is checked", () => {
	expectTypeOf<
		V<"SELECT sum(id) OVER nope IN (SELECT 1) FROM users">
	>().toEqualTypeOf<SqlError<'window "nope" does not exist', 6>>();
});

test("window errors", () => {
	expectTypeOf<V<"SELECT rank() OVER w FROM things">>().toEqualTypeOf<
		SqlError<'window "w" does not exist', 5>
	>();
	expectTypeOf<
		V<"SELECT rank() OVER (w ORDER BY id) FROM things">
	>().toEqualTypeOf<SqlError<'window "w" does not exist', 6>>();
	expectTypeOf<
		V<"SELECT rank() OVER w FROM things WINDOW w AS (w2), w2 AS (ORDER BY id)">
	>().toEqualTypeOf<SqlError<'window "w2" does not exist', 12>>();
	expectTypeOf<
		V<"SELECT rank() OVER w FROM things WINDOW w AS (PARTITION BY flag), w AS (ORDER BY id)">
	>().toEqualTypeOf<SqlError<'window "w" is already defined', 5>>();
	expectTypeOf<
		V<"SELECT rank() OVER (w PARTITION BY id) FROM things WINDOW w AS (ORDER BY id)">
	>().toEqualTypeOf<
		SqlError<'cannot override PARTITION BY clause of window "w"', 6>
	>();
	expectTypeOf<
		V<"SELECT rank() OVER (w ORDER BY id) FROM things WINDOW w AS (ORDER BY label)">
	>().toEqualTypeOf<
		SqlError<'cannot override ORDER BY clause of window "w"', 6>
	>();
	expectTypeOf<
		V<"SELECT rank() OVER (PARTITION BY nope) FROM things">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 8>>();
	expectTypeOf<
		V<"SELECT id FROM things WINDOW w AS (ORDER BY nope)">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 10>>();
	// output aliases are not visible in window definitions
	expectTypeOf<
		V<"SELECT id AS n, rank() OVER (ORDER BY n) FROM things">
	>().toEqualTypeOf<SqlError<'column "n" does not exist', 3>>();
	// a WINDOW clause belongs to its own query level
	expectTypeOf<
		V<"SELECT (SELECT rank() OVER w FROM users LIMIT 1) FROM things WINDOW w AS (ORDER BY id)">
	>().toEqualTypeOf<SqlError<'window "w" does not exist', 7>>();
});
