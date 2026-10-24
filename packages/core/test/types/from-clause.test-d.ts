import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Params, Row, V } from "./_schema.js";

// FROM clause grammar: nested joins, parenthesized joins, TABLESAMPLE and ROWS FROM,
// verified against PostgreSQL 18.

test("a qualified join takes a whole joined table on its right", () => {
	// a JOIN (b LEFT JOIN c ON ...) ON ...
	expectTypeOf<
		Row<"SELECT u.id, p.title, t.label FROM users u JOIN posts p LEFT JOIN things t ON t.id = p.author_id ON p.author_id = u.id">
	>().toEqualTypeOf<{ id: number; title: string; label: string | null }>();
	// a LEFT JOIN (b JOIN c ON ...) ON ...: the whole right side is nullable
	expectTypeOf<
		Row<"SELECT u.id, p.title, t.label FROM users u LEFT JOIN posts p JOIN things t ON t.id = p.author_id ON p.author_id = u.id">
	>().toEqualTypeOf<{
		id: number;
		title: string | null;
		label: string | null;
	}>();
	// CROSS / NATURAL joins take a single item: (a CROSS JOIN b) JOIN c
	expectTypeOf<
		Row<"SELECT u.id, t.label FROM users u CROSS JOIN posts p LEFT JOIN things t ON t.id = u.id">
	>().toEqualTypeOf<{ id: number; label: string | null }>();
	expectTypeOf<
		V<"SELECT 1 FROM users u JOIN posts p LEFT JOIN things t ON t.id = p.author_id">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ON or USING at or near end of input", 20>
	>();
});

test("an ON condition sees the two sides of its join only", () => {
	expectTypeOf<
		V<"SELECT 1 FROM users u JOIN posts p JOIN things t ON t.id = u.id ON true">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "u"', 4>
	>();
	expectTypeOf<
		V<"SELECT 1 FROM users u, posts p JOIN things t ON t.id = u.id">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "u"', 4>
	>();
	// outer query levels stay visible
	expectTypeOf<
		Row<"SELECT (SELECT p.title FROM posts p JOIN things t ON t.id = p.author_id AND p.author_id = u.id LIMIT 1) AS t FROM users u">
	>().toEqualTypeOf<{ t: string | null }>();
});

test("parenthesized joins that start with a subquery", () => {
	expectTypeOf<
		Row<"SELECT * FROM ((SELECT 1 AS x) s1 LEFT JOIN (SELECT 2 AS x, 'a' AS y) s2 USING (x)) j">
	>().toEqualTypeOf<{ x: number; y: string | null }>();
	expectTypeOf<
		Row<"SELECT j.x, ss2.y FROM ((SELECT id / 2 AS x FROM users) ss1 JOIN things t ON x = t.id) j, LATERAL (SELECT x) ss2(y)">
	>().toEqualTypeOf<{ x: number; y: number }>();
	expectTypeOf<
		Row<"SELECT s1.n, s2.z FROM users u JOIN ((SELECT 42 AS n) AS s1 RIGHT JOIN (SELECT 1 AS z) AS s2 ON true) ON false">
	>().toEqualTypeOf<{ n: number | null; z: number }>();
	// the parentheses must hold a join
	expectTypeOf<V<"SELECT * FROM ((SELECT 1 AS x) s1) j">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 11>
	>();
	expectTypeOf<V<"SELECT * FROM (users)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
});

test("functions in FROM cannot be window calls", () => {
	expectTypeOf<
		V<"SELECT * FROM rank() OVER (ORDER BY random())">
	>().toEqualTypeOf<SqlError<"syntax error at or near order", 8>>();
	expectTypeOf<
		V<"SELECT * FROM generate_series(1, 2) FILTER (WHERE true)">
	>().toEqualTypeOf<SqlError<"syntax error at or near where", 11>>();
	expectTypeOf<V<"SELECT DISTINCT FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 2>
	>();
});

test("TABLESAMPLE", () => {
	expectTypeOf<
		Row<"SELECT id, email FROM users TABLESAMPLE SYSTEM (50) REPEATABLE (0)">
	>().toEqualTypeOf<{ id: number; email: string }>();
	expectTypeOf<
		Row<"SELECT t.id FROM things AS t TABLESAMPLE bernoulli ('5') REPEATABLE (1 + 2)">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT n FROM (VALUES (10)) v(pct), LATERAL (SELECT count(*) AS n FROM users TABLESAMPLE bernoulli (pct)) s">
	>().toEqualTypeOf<{ n: string }>();
	// parameters: the method's argument type (real) and double precision for REPEATABLE
	expectTypeOf<
		Params<"SELECT id FROM users TABLESAMPLE BERNOULLI ($1) REPEATABLE ($2)">
	>().toEqualTypeOf<[number, number]>();
	expectTypeOf<
		V<"SELECT id FROM users TABLESAMPLE foobar (1)">
	>().toEqualTypeOf<SqlError<"tablesample method foobar does not exist", 0>>();
	expectTypeOf<
		V<"SELECT id FROM users TABLESAMPLE system (1, 2)">
	>().toEqualTypeOf<
		SqlError<"tablesample method system requires 1 argument, not 2", 0>
	>();
	expectTypeOf<
		V<"SELECT id FROM users TABLESAMPLE system ('a'::text)">
	>().toEqualTypeOf<
		SqlError<"argument of TABLESAMPLE must be type real, not type text", 0>
	>();
	expectTypeOf<
		V<"SELECT id FROM users TABLESAMPLE system (5) REPEATABLE (true)">
	>().toEqualTypeOf<
		SqlError<
			"argument of REPEATABLE must be type double precision, not type boolean",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT id FROM users TABLESAMPLE system (NULL)">
	>().toEqualTypeOf<SqlError<"TABLESAMPLE parameter cannot be null", 0>>();
	expectTypeOf<
		V<"WITH q AS (SELECT * FROM users) SELECT * FROM q TABLESAMPLE BERNOULLI (5.5)">
	>().toEqualTypeOf<
		SqlError<
			"TABLESAMPLE clause can only be applied to tables and materialized views",
			0
		>
	>();
	// the arguments cannot see the other FROM items
	expectTypeOf<
		V<"SELECT 1 FROM users u, things t TABLESAMPLE system (u.id)">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "u"', 4>
	>();
});

test("ROWS FROM", () => {
	// functions zipped: every column nullable (shorter results are padded with NULLs)
	expectTypeOf<
		Row<"SELECT * FROM ROWS FROM (generate_series(1, 2), unnest(ARRAY['a', 'b'])) WITH ORDINALITY">
	>().toEqualTypeOf<{
		generate_series: number | null;
		unnest: string | null;
		ordinality: string;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM ROWS FROM (generate_series(1, 2), unnest(ARRAY['a', 'b'])) AS z">
	>().toEqualTypeOf<{
		generate_series: number | null;
		unnest: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM ROWS FROM (generate_series(1, 2), jsonb_to_recordset('[]') AS (a int, b text)) WITH ORDINALITY AS z(n, x, y, o)">
	>().toEqualTypeOf<{
		n: number | null;
		x: number | null;
		y: string | null;
		o: string;
	}>();
	// one function: like the function alone
	expectTypeOf<
		Row<"SELECT * FROM ROWS FROM (generate_series(1, 2)) AS g">
	>().toEqualTypeOf<{ g: number }>();
	expectTypeOf<
		Row<"SELECT * FROM ROWS FROM (jsonb_to_recordset('[]')) AS z(a int, b text)">
	>().toEqualTypeOf<{ a: number | null; b: string | null }>();
	expectTypeOf<
		Row<"SELECT * FROM ROWS FROM (unnest(ARRAY[1], ARRAY['a'])) WITH ORDINALITY AS z(a, b, o)">
	>().toEqualTypeOf<{ a: number | null; b: string | null; o: string }>();
	// implicitly LATERAL
	expectTypeOf<
		Row<"SELECT p.id, g FROM posts p, ROWS FROM (generate_series(1, p.author_id), unnest(p.tags)) AS r(g, t)">
	>().toEqualTypeOf<{ id: string; g: number | null }>();
	expectTypeOf<
		Params<"SELECT * FROM ROWS FROM (generate_series(1, $1), unnest($2::text[]))">
	>().toEqualTypeOf<[number | null, (string | null)[] | null]>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2), generate_series(1, 3)) AS (a int)">
	>().toEqualTypeOf<
		SqlError<
			"ROWS FROM() with multiple functions cannot have a column definition list",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2), generate_series(1, 3)) AS z(a, b, c)">
	>().toEqualTypeOf<
		SqlError<'table "z" has 2 columns available but 3 columns specified', 21>
	>();
});

test("WITHIN GROUP with several sort keys", () => {
	expectTypeOf<
		Row<"SELECT rank(1, 2) WITHIN GROUP (ORDER BY id, small) AS r FROM things">
	>().toEqualTypeOf<{ r: string }>();
	expectTypeOf<
		V<"SELECT rank(1, 2) WITHIN GROUP (ORDER BY id, nope) FROM things">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 14>>();
});
