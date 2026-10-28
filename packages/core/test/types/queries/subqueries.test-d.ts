import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../../src/index.js";
import type { Row, V } from "../_schema.js";

// Subqueries, derived tables and LATERAL, verified against PostgreSQL 18.

test("scalar subqueries are nullable and named after the inner first target", () => {
	expectTypeOf<Row<"SELECT (SELECT max(id) FROM users) AS m">>().toEqualTypeOf<{
		m: number | null;
	}>();
	expectTypeOf<
		Row<"SELECT (SELECT title FROM posts LIMIT 1) FROM users">
	>().toEqualTypeOf<{ title: string | null }>();
	expectTypeOf<
		Row<"SELECT (SELECT title AS tt FROM posts LIMIT 1) FROM users">
	>().toEqualTypeOf<{ tt: string | null }>();
	expectTypeOf<
		Row<"SELECT (SELECT count(*) FROM posts) FROM users">
	>().toEqualTypeOf<{ count: string | null }>();
	expectTypeOf<Row<"SELECT (SELECT 1) FROM users">>().toEqualTypeOf<{
		"?column?": number | null;
	}>();
	expectTypeOf<Row<"SELECT ((SELECT 1)) AS x">>().toEqualTypeOf<{
		x: number | null;
	}>();
	expectTypeOf<
		Row<"SELECT ((SELECT title FROM posts LIMIT 1)) FROM users">
	>().toEqualTypeOf<{ title: string | null }>();
	expectTypeOf<
		Row<"SELECT (SELECT id FROM users LIMIT 1)::text FROM users">
	>().toEqualTypeOf<{ id: string | null }>();
	expectTypeOf<Row<"SELECT (VALUES (1)) FROM users">>().toEqualTypeOf<{
		column1: number | null;
	}>();
	// a set operation inside: names from its first branch, common type int4 ∪ int8
	expectTypeOf<
		Row<"SELECT (SELECT id FROM users UNION SELECT id FROM posts LIMIT 1) AS x">
	>().toEqualTypeOf<{ x: string | null }>();
});

test("EXISTS, IN (SELECT ...), = ANY / ALL / SOME (SELECT ...)", () => {
	expectTypeOf<
		Row<"SELECT EXISTS (SELECT 1 FROM posts p WHERE p.author_id = u.id) AS e FROM users u">
	>().toEqualTypeOf<{ e: boolean }>();
	// an empty target list is valid (and idiomatic in EXISTS)
	expectTypeOf<
		Row<"SELECT EXISTS (SELECT FROM posts WHERE author_id = u.id) AS e FROM users u">
	>().toEqualTypeOf<{ e: boolean }>();
	expectTypeOf<Row<"SELECT FROM users">>().toEqualTypeOf<{}>();
	// whatever clause follows; not after DISTINCT
	type Empty<Q extends string> = [V<Q>] extends [never]
		? "never"
		: V<Q> extends Q
			? true
			: V<Q>;
	expectTypeOf<
		[
			Empty<"SELECT ALL FROM users">,
			Empty<"SELECT WHERE true">,
			Empty<"SELECT GROUP BY ()">,
			Empty<"SELECT HAVING true">,
			Empty<"SELECT WINDOW w AS ()">,
			Empty<"SELECT LIMIT 1">,
			Empty<"SELECT OFFSET 1">,
			Empty<"SELECT FETCH FIRST ROW ONLY">,
			Empty<"SELECT FOR UPDATE">,
			Empty<"SELECT UNION SELECT">,
			Empty<"SELECT INTERSECT SELECT">,
			Empty<"SELECT EXCEPT SELECT">,
			Empty<"SELECT EXISTS (SELECT)">,
			Empty<"SELECT;">,
			Empty<"SELECT">,
		]
	>().toEqualTypeOf<
		[
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
		]
	>();
	expectTypeOf<
		V<"SELECT INTO e0 FROM users">
	>().toEqualTypeOf<"SELECT INTO e0 FROM users">();
	expectTypeOf<V<"SELECT ORDER BY 1">>().toEqualTypeOf<
		SqlError<"ORDER BY position 1 is not in select list", 3>
	>();
	expectTypeOf<V<"SELECT DISTINCT FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 2>
	>();
	expectTypeOf<
		V<"SELECT DISTINCT ON (id email) id FROM users">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near email', 5>
	>();
	expectTypeOf<V<"SELECT DISTINCT ON (,) id FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 4>
	>();
	expectTypeOf<
		Row<"SELECT id FROM users WHERE id IN (SELECT author_id FROM posts)">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT id IN (SELECT author_id FROM posts) AS a, id NOT IN (SELECT n_id FROM things) AS b FROM users">
	>().toEqualTypeOf<{ a: boolean; b: boolean | null }>();
	expectTypeOf<
		Row<"SELECT id = ANY (SELECT author_id FROM posts) AS a, id > ALL (SELECT author_id FROM posts) AS b, id = SOME (SELECT n_id FROM things) AS c FROM users">
	>().toEqualTypeOf<{ a: boolean; b: boolean; c: boolean | null }>();
	// row comparison against a two-column subquery
	expectTypeOf<
		Row<"SELECT id FROM users WHERE (id, email) IN (SELECT author_id, title FROM posts)">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT ARRAY(SELECT id FROM users) AS ids">
	>().toEqualTypeOf<{ ids: number[] }>();
});

test("correlated subqueries see the outer scope; ambiguity is per query level", () => {
	expectTypeOf<
		Row<"SELECT (SELECT email FROM users WHERE id = p.author_id) AS e FROM posts p">
	>().toEqualTypeOf<{ e: string | null }>();
	expectTypeOf<
		Row<"SELECT (SELECT title FROM posts WHERE author_id = u.id LIMIT 1) FROM users u">
	>().toEqualTypeOf<{ title: string | null }>();
	// unqualified outer reference
	expectTypeOf<
		Row<"SELECT (SELECT display_name) AS d FROM users">
	>().toEqualTypeOf<{ d: string | null }>();
	// the inner `id` (posts.id, int8) shadows the outer users.id: not ambiguous
	expectTypeOf<
		Row<"SELECT (SELECT id FROM posts LIMIT 1) AS x FROM users">
	>().toEqualTypeOf<{ x: string | null }>();
	// two levels down
	expectTypeOf<
		Row<"SELECT (SELECT (SELECT u.email) FROM posts LIMIT 1) AS e FROM users u">
	>().toEqualTypeOf<{ e: string | null }>();
	expectTypeOf<
		V<"SELECT (SELECT id FROM users, posts) FROM posts">
	>().toEqualTypeOf<SqlError<'column reference "id" is ambiguous', 3>>();
	expectTypeOf<V<"SELECT (SELECT nope FROM posts) FROM users">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 3>
	>();
	expectTypeOf<
		V<"SELECT (SELECT x.title FROM posts) FROM users u">
	>().toEqualTypeOf<SqlError<'missing FROM-clause entry for table "x"', 3>>();
});

test("derived tables, with and without an alias, with column aliases", () => {
	expectTypeOf<
		Row<"SELECT * FROM (SELECT id, email FROM users) t">
	>().toEqualTypeOf<{ id: number; email: string }>();
	expectTypeOf<
		Row<"SELECT t.id FROM (SELECT id FROM users) AS t">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT id FROM (SELECT id FROM users)">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM (SELECT id, email FROM users) AS t(a, b)">
	>().toEqualTypeOf<{ a: number; b: string }>();
	// fewer names than columns: the rest keep their names
	expectTypeOf<
		Row<"SELECT t.a, t.email FROM (SELECT id, email FROM users) AS t(a)">
	>().toEqualTypeOf<{ a: number; email: string }>();
	// outer-join nullability flows through a derived table
	expectTypeOf<
		Row<"SELECT t.title FROM users u LEFT JOIN (SELECT author_id, title FROM posts) t ON t.author_id = u.id">
	>().toEqualTypeOf<{ title: string | null }>();
	expectTypeOf<
		Row<"SELECT x FROM (SELECT 1 AS x UNION SELECT 2 ORDER BY x) t">
	>().toEqualTypeOf<{ x: number }>();
	expectTypeOf<
		V<"SELECT * FROM (SELECT id FROM users) AS t(a, b)">
	>().toEqualTypeOf<
		SqlError<'table "t" has 1 columns available but 2 columns specified', 10>
	>();
	// the renamed column is no longer reachable under its old name
	expectTypeOf<
		V<"SELECT t.id FROM (SELECT id FROM users) AS t(a)">
	>().toEqualTypeOf<SqlError<"column t.id does not exist", 3>>();
	expectTypeOf<V<"SELECT * FROM users u, (SELECT 1) u">>().toEqualTypeOf<
		SqlError<'table name "u" specified more than once', 4>
	>();
});

test("LATERAL sees earlier FROM items; a plain subquery does not", () => {
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u, LATERAL (SELECT title FROM posts WHERE author_id = u.id LIMIT 1) p">
	>().toEqualTypeOf<{ id: number; title: string }>();
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u JOIN LATERAL (SELECT title FROM posts WHERE author_id = u.id) p ON true">
	>().toEqualTypeOf<{ id: number; title: string }>();
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u LEFT JOIN LATERAL (SELECT title FROM posts WHERE author_id = u.id) p ON true">
	>().toEqualTypeOf<{ id: number; title: string | null }>();
	expectTypeOf<
		Row<"SELECT * FROM LATERAL (SELECT 1 AS a) s, LATERAL (SELECT s.a + 1 AS b) s2">
	>().toEqualTypeOf<{ a: number; b: number }>();
	expectTypeOf<
		Row<"SELECT * FROM (SELECT 1 AS a) s CROSS JOIN LATERAL (SELECT a + 1 AS b) s2">
	>().toEqualTypeOf<{ a: number; b: number }>();
	expectTypeOf<
		V<"SELECT * FROM users u, (SELECT title FROM posts WHERE author_id = u.id) p">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "u"', 4>
	>();
	// RIGHT / FULL joins cannot reference their left side, even with LATERAL
	expectTypeOf<
		V<"SELECT * FROM (SELECT 1 AS a) s RIGHT JOIN LATERAL (SELECT s.a + 1 AS b) s2 ON true">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "s"', 9>
	>();
});

test("subqueries with the wrong number of columns (Postgres messages)", () => {
	type E<Q extends string> =
		V<Q> extends SqlError<infer M extends string, unknown> ? M : "ok";
	expectTypeOf<
		E<"SELECT (SELECT id, email FROM users LIMIT 1)">
	>().toEqualTypeOf<"subquery must return only one column">();
	expectTypeOf<
		E<"SELECT ARRAY(SELECT id, email FROM users)">
	>().toEqualTypeOf<"subquery must return only one column">();
	expectTypeOf<
		E<"SELECT 1 IN (SELECT id, email FROM users)">
	>().toEqualTypeOf<"subquery has too many columns">();
	expectTypeOf<
		E<"SELECT 1 = ANY (SELECT id, email FROM users)">
	>().toEqualTypeOf<"subquery has too many columns">();
	expectTypeOf<
		E<"SELECT (SELECT * FROM users LIMIT 1)">
	>().toEqualTypeOf<"subquery must return only one column">();
	expectTypeOf<
		E<"SELECT EXISTS (SELECT id, email FROM users)">
	>().toEqualTypeOf<"ok">();
	expectTypeOf<
		E<"SELECT (id, email) IN (SELECT author_id, title FROM posts) FROM users">
	>().toEqualTypeOf<"ok">();
	expectTypeOf<
		E<"SELECT (id, email) IN (SELECT author_id FROM posts) FROM users">
	>().toEqualTypeOf<"subquery has too few columns">();
	expectTypeOf<
		E<"SELECT (id, email) = ANY (SELECT author_id, title, id FROM posts) FROM users">
	>().toEqualTypeOf<"subquery has too many columns">();
	// no columns at all; a star of one column is one column
	expectTypeOf<
		E<"SELECT (SELECT)">
	>().toEqualTypeOf<"subquery must return only one column">();
	expectTypeOf<
		E<"SELECT 1 IN (SELECT FROM users)">
	>().toEqualTypeOf<"subquery has too few columns">();
	expectTypeOf<
		E<"SELECT 1 = ANY (SELECT s.* FROM (SELECT) s)">
	>().toEqualTypeOf<"subquery has too few columns">();
	expectTypeOf<
		E<"SELECT ARRAY(SELECT s.* FROM (SELECT) s)">
	>().toEqualTypeOf<"subquery must return only one column">();
	expectTypeOf<
		Row<"SELECT (SELECT s.* FROM (SELECT 1 AS a) s) AS v">
	>().toEqualTypeOf<{ v: number | null }>();
	// a star's width is not counted
	expectTypeOf<
		E<"SELECT (id, email, display_name, created_at) IN (SELECT users.* FROM users) FROM users">
	>().toEqualTypeOf<"ok">();
	// errors inside the subquery
	expectTypeOf<
		E<"SELECT EXISTS (SELECT nope FROM users)">
	>().toEqualTypeOf<'column "nope" does not exist'>();
});

test("a row compared with a subquery compares with its single row; no row gives NULL", () => {
	type E<Q extends string> =
		V<Q> extends SqlError<infer M extends string, unknown> ? M : "ok";
	expectTypeOf<
		Row<"SELECT (id, email) = (SELECT author_id, title FROM posts LIMIT 1) AS a, (id, email) < (SELECT 1, 'a') AS b FROM users">
	>().toEqualTypeOf<{ a: boolean | null; b: boolean | null }>();
	expectTypeOf<
		E<"SELECT (id, email) = (SELECT author_id FROM posts) FROM users">
	>().toEqualTypeOf<"subquery has too few columns">();
	expectTypeOf<
		E<"SELECT (id, email) <> (SELECT author_id, title, id FROM posts) FROM users">
	>().toEqualTypeOf<"subquery has too many columns">();
	expectTypeOf<
		E<"SELECT (id, nope) = (SELECT author_id, title FROM posts) FROM users">
	>().toEqualTypeOf<'column "nope" does not exist'>();
	expectTypeOf<
		E<"SELECT (id, email) = (SELECT author_id, nope FROM posts) FROM users">
	>().toEqualTypeOf<'column "nope" does not exist'>();
	// every comparison operator; a row with a row; a value with a scalar subquery
	expectTypeOf<
		Row<"SELECT (id, email) <> (SELECT 1, 'a') AS a, (id, email) != (SELECT 1, 'a') AS b, (id, email) < (SELECT 1, 'a') AS c, (id, email) > (SELECT 1, 'a') AS d, (id, email) <= (SELECT 1, 'a') AS e, (id, email) >= (SELECT 1, 'a') AS f, (id, email) = (1, 'a') AS g FROM users">
	>().toEqualTypeOf<{
		a: boolean | null;
		b: boolean | null;
		c: boolean | null;
		d: boolean | null;
		e: boolean | null;
		f: boolean | null;
		g: boolean;
	}>();
	expectTypeOf<
		E<"SELECT id = (SELECT 1, 2) FROM users">
	>().toEqualTypeOf<"subquery must return only one column">();
});
