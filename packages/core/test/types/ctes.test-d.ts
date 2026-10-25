import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// WITH / WITH RECURSIVE, verified against PostgreSQL 18.

test("CTEs see earlier CTEs, column lists rename positionally", () => {
	expectTypeOf<
		Row<"WITH a AS (SELECT id, email FROM users), b AS (SELECT id + 1 AS n, email FROM a) SELECT * FROM b">
	>().toEqualTypeOf<{ n: number; email: string }>();
	expectTypeOf<
		Row<"WITH a(x, y) AS (SELECT id, email FROM users) SELECT * FROM a">
	>().toEqualTypeOf<{ x: number; y: string }>();
	expectTypeOf<
		Row<"WITH a(x) AS (SELECT id, email FROM users) SELECT * FROM a">
	>().toEqualTypeOf<{ x: number; email: string }>();
	expectTypeOf<
		Row<"WITH a AS (SELECT 1 AS x) SELECT a1.x, a2.x AS y FROM a a1, a a2">
	>().toEqualTypeOf<{ x: number; y: number }>();
	// visible inside scalar subqueries and nested statements
	expectTypeOf<
		Row<"WITH a AS (SELECT 1 AS x) SELECT (SELECT x FROM a) AS v">
	>().toEqualTypeOf<{ v: number | null }>();
	// an inner WITH shadows an outer CTE of the same name
	expectTypeOf<
		Row<"WITH a AS (SELECT 1 AS x) SELECT * FROM a, (WITH a AS (SELECT 2 AS y) SELECT * FROM a) s">
	>().toEqualTypeOf<{ x: number; y: number }>();
	expectTypeOf<
		Row<"SELECT * FROM (WITH c AS (SELECT email FROM users) SELECT * FROM c) s">
	>().toEqualTypeOf<{ email: string }>();
	// nullability is preserved through the CTE
	expectTypeOf<
		Row<"WITH j AS (SELECT u.id, p.title FROM users u LEFT JOIN posts p ON p.author_id = u.id) SELECT title FROM j">
	>().toEqualTypeOf<{ title: string | null }>();
});

test("a CTE shadows a table; [NOT] MATERIALIZED is accepted", () => {
	expectTypeOf<
		Row<"WITH users AS (SELECT 1 AS one) SELECT * FROM users">
	>().toEqualTypeOf<{ one: number }>();
	// a non-recursive CTE's own body still refers to the table
	expectTypeOf<
		Row<"WITH users AS (SELECT id FROM users) SELECT * FROM users">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"WITH a AS MATERIALIZED (SELECT 1 AS x), b AS NOT MATERIALIZED (SELECT 2 AS y) SELECT * FROM a, b">
	>().toEqualTypeOf<{ x: number; y: number }>();
	// an inner WITH shadows an outer CTE: only its columns
	expectTypeOf<
		Row<"WITH a AS (SELECT 1 AS x) SELECT * FROM (WITH a AS (SELECT display_name AS y FROM users) SELECT * FROM a) s">
	>().toEqualTypeOf<{ y: string | null }>();
});

test("WITH RECURSIVE: typed from the non-recursive term, nullability over both terms", () => {
	expectTypeOf<
		Row<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 10) SELECT n FROM t">
	>().toEqualTypeOf<{ n: number }>();
	expectTypeOf<
		Row<"WITH RECURSIVE t AS (SELECT 1 AS n, NULL::text AS s UNION ALL SELECT n + 1, 'x' FROM t WHERE n < 3) SELECT * FROM t">
	>().toEqualTypeOf<{ n: number; s: string | null }>();
	// the recursive term feeds a NULL back into another column (fixpoint)
	expectTypeOf<
		Row<"WITH RECURSIVE t(n, m) AS (SELECT 1, 2 UNION ALL SELECT m, NULL::int4 FROM t WHERE n IS NOT NULL) SELECT * FROM t">
	>().toEqualTypeOf<{ n: number | null; m: number | null }>();
	expectTypeOf<
		Row<"WITH RECURSIVE tree AS (SELECT id, author_id, 0 AS depth FROM posts WHERE author_id = 1 UNION ALL SELECT p.id, p.author_id, t.depth + 1 FROM posts p JOIN tree t ON p.author_id = t.id) SELECT * FROM tree">
	>().toEqualTypeOf<{ id: string; author_id: number; depth: number }>();
	// a NULL that takes three steps to reach the last column
	expectTypeOf<
		Row<"WITH RECURSIVE t(n, a, b, c) AS (SELECT 1, 1, 1, 1 UNION ALL SELECT n + 1, NULL::int4, a, b FROM t WHERE n < 9) SELECT * FROM t">
	>().toEqualTypeOf<{
		n: number;
		a: number | null;
		b: number | null;
		c: number | null;
	}>();
	// one that takes four: after four steps every column is typed nullable
	expectTypeOf<
		Row<"WITH RECURSIVE t(n, a, b, c, d) AS (SELECT 1, 1, 1, 1, 1 UNION ALL SELECT n + 1, NULL::int4, a, b, c FROM t WHERE n < 9) SELECT * FROM t">
	>().toEqualTypeOf<{
		n: number | null;
		a: number | null;
		b: number | null;
		c: number | null;
		d: number | null;
	}>();
	expectTypeOf<
		Row<"WITH RECURSIVE t(n, a, b, c, d) AS (SELECT 1, 1, 1, 1, 1 UNION ALL SELECT n + 1, NULL::int4, a, b, c FROM t WHERE n < 9) CYCLE n SET m USING p SELECT n, m FROM t">
	>().toEqualTypeOf<{ n: number | null; m: boolean }>();
	// a string literal in the non-recursive term is text
	expectTypeOf<
		Row<"WITH RECURSIVE t(x) AS (SELECT 'a' UNION ALL SELECT x || 'b' FROM t WHERE length(x) < 3) SELECT x FROM t">
	>().toEqualTypeOf<{ x: string }>();
	// the query's own WITH, and a non-recursive term that is itself a UNION
	expectTypeOf<
		Row<"WITH RECURSIVE t(n) AS (WITH s AS (SELECT 1 AS x) SELECT x FROM s UNION ALL SELECT n + 1 FROM t WHERE n < 3) SELECT * FROM t">
	>().toEqualTypeOf<{ n: number }>();
	expectTypeOf<
		Row<"WITH RECURSIVE t(n) AS (SELECT 1 UNION SELECT 2 UNION ALL SELECT n + 1 FROM t WHERE n < 3) SELECT * FROM t">
	>().toEqualTypeOf<{ n: number }>();
	// RECURSIVE without a self reference, and a later CTE using a recursive one
	expectTypeOf<
		Row<"WITH RECURSIVE t AS (SELECT 1 AS n) SELECT * FROM t">
	>().toEqualTypeOf<{ n: number }>();
	expectTypeOf<
		Row<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3), u AS (SELECT n * 2 AS m FROM t) SELECT * FROM u">
	>().toEqualTypeOf<{ m: number }>();
	// SEARCH / CYCLE (the columns they add: see cte-search-cycle.test-d.ts)
	expectTypeOf<
		Row<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) SEARCH DEPTH FIRST BY n SET ord SELECT n FROM t">
	>().toEqualTypeOf<{ n: number }>();
	expectTypeOf<
		Row<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) CYCLE n SET is_cycle USING path SELECT n FROM t">
	>().toEqualTypeOf<{ n: number }>();
});

test("CTE errors", () => {
	expectTypeOf<
		V<"WITH a AS (SELECT id FROM users) SELECT nope FROM a">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 10>>();
	expectTypeOf<
		V<"WITH a AS (SELECT id FROM users) SELECT a.title FROM a">
	>().toEqualTypeOf<SqlError<"column a.title does not exist", 12>>();
	expectTypeOf<
		V<"WITH a(x, y, z) AS (SELECT id, email FROM users) SELECT * FROM a">
	>().toEqualTypeOf<
		SqlError<
			'WITH query "a" has 2 columns available but 3 columns specified',
			1
		>
	>();
	expectTypeOf<
		V<"WITH a AS (SELECT id FROM users), a AS (SELECT 1) SELECT * FROM a">
	>().toEqualTypeOf<
		SqlError<'WITH query name "a" specified more than once', 1>
	>();
	// without RECURSIVE a CTE does not see itself
	expectTypeOf<
		V<"WITH t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) SELECT * FROM t">
	>().toEqualTypeOf<SqlError<'relation "t" does not exist', 1>>();
	// errors in either term of a recursive CTE, in its own WITH, in its column list
	expectTypeOf<
		V<"WITH RECURSIVE t(n) AS (SELECT nope UNION ALL SELECT n + 1 FROM t WHERE n < 3) SELECT * FROM t">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 9>>();
	expectTypeOf<
		V<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT nope FROM t) SELECT * FROM t">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 13>>();
	expectTypeOf<
		V<"WITH RECURSIVE t(n) AS (WITH s AS (SELECT nope) SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) SELECT * FROM t">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 13>>();
	expectTypeOf<
		V<"WITH RECURSIVE t(n, m) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) SELECT * FROM t">
	>().toEqualTypeOf<
		SqlError<
			'WITH query "t" has 1 columns available but 2 columns specified',
			2
		>
	>();
	// a CTE cannot see a later one (here: no such table either)
	expectTypeOf<
		V<"WITH a AS (SELECT * FROM zz), zz AS (SELECT 1 AS x) SELECT * FROM a">
	>().toEqualTypeOf<SqlError<'relation "zz" does not exist', 7>>();
});
