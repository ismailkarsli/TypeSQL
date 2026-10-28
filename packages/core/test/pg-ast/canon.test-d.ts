// Keep in step with pg-canon.test.ts: `Canon<Q>` must print what Postgres's tree prints there.
import { describe, expectTypeOf, test } from "vitest";
import type { Canon } from "./canon.js";

describe("the canonical form of our parse tree", () => {
	test("operator precedence, AND / OR chains, NOT", () => {
		expectTypeOf<
			Canon<"SELECT v FROM c WHERE x = 1 OR true AND v IS NOT NULL">
		>().toEqualTypeOf<"SELECT v FROM c WHERE ((x = 1) OR (true AND (v IS NOT NULL)))">();
		expectTypeOf<
			Canon<"SELECT a AND (b AND c) AND NOT d OR e">
		>().toEqualTypeOf<"SELECT ((a AND b AND c AND (NOT d)) OR e)">();
		expectTypeOf<
			Canon<"SELECT 1 + 2 * 3 ^ 4 - 5, a || b || c, a != b">
		>().toEqualTypeOf<"SELECT ((1 + (2 * (3 ^ 4))) - 5), ((a || b) || c), (a <> b)">();
	});

	test("literals, predicates, casts, special calls", () => {
		expectTypeOf<
			Canon<"SELECT -1, - (2.5), - -3, -x, -1::int, 1e3, 1_000, 0x1F">
		>().toEqualTypeOf<"SELECT (- 1), (- 2.5), (- (- 3)), (- x), (- (1::int4)), 1e3, 1_000, 0x1F">();
		expectTypeOf<
			Canon<"SELECT x NOT IN (1, 2), x NOT IN (SELECT 1), x = ANY (ARRAY[1]), x < ALL (SELECT 1), x IN (SELECT 1)">
		>().toEqualTypeOf<"SELECT (x NOT IN (1, 2)), (NOT (x IN (SELECT 1))), (x = ANY (ARRAY[1])), (x < ALL (SELECT 1)), (x IN (SELECT 1))">();
		expectTypeOf<
			Canon<"SELECT x LIKE 'a' ESCAPE '!', x NOT ILIKE 'b', x SIMILAR TO 'c', x NOT LIKE ANY (y)">
		>().toEqualTypeOf<"SELECT (x LIKE 'a'), (x NOT ILIKE 'b'), (x SIMILAR TO 'c'), (x !~~ ANY (y))">();
		expectTypeOf<
			Canon<`SELECT CAST(a AS integer[]), int4 '1', b COLLATE "C", t AT TIME ZONE 'UTC', a[1][2:], (r).f, (a).b.c, ROW(1, 2), (1, 2)`>
		>().toEqualTypeOf<"SELECT (a::int4[]), ('1'::int4), (b COLLATE C), timezone('UTC', t), a[1][2:], (r).f, ((a).b).c, ROW(1, 2), ROW(1, 2)">();
		expectTypeOf<
			Canon<"SELECT substring(s FROM 2 FOR 3), substring(s FOR 3), position('a' IN s), trim(LEADING 'x' FROM s), extract(year FROM d), current_date, coalesce(a, b), nullif(a, b)">
		>().toEqualTypeOf<"SELECT substring(s, 2, 3), substring(s, 1, 3), position(s, 'a'), ltrim(s, 'x'), extract('year', d), current_date(), coalesce(a, b), nullif(a, b)">();
	});

	test("calls, FROM, set operations", () => {
		expectTypeOf<
			Canon<"SELECT count(*) FILTER (WHERE x) OVER (w PARTITION BY a ORDER BY b DESC ROWS UNBOUNDED PRECEDING), sum(DISTINCT x ORDER BY y), f(1, VARIADIC b), g(a => 1), mode() WITHIN GROUP (ORDER BY x), rank() OVER w FROM t WINDOW w AS (ORDER BY c)">
		>().toEqualTypeOf<"SELECT count(*) FILTER (WHERE x) OVER (w PARTITION BY a ORDER BY b), sum(DISTINCT x), f(1, VARIADIC b), g(a => 1), mode() WITHIN GROUP (x), rank() OVER (w) FROM t WINDOW w AS (ORDER BY c)">();
		expectTypeOf<
			Canon<"SELECT * FROM a JOIN b LEFT JOIN c USING (x) ON p NATURAL JOIN d CROSS JOIN e, LATERAL (SELECT 1) AS s(x)">
		>().toEqualTypeOf<"SELECT * FROM (((a INNER JOIN (b LEFT JOIN c USING (x)) ON p) NATURAL INNER JOIN d) CROSS JOIN e), LATERAL (SELECT 1) AS s(x)">();
		expectTypeOf<
			Canon<"SELECT * FROM (a FULL JOIN b ON true) AS j(x), ONLY t AS u, v * AS w, f(1) WITH ORDINALITY AS g(a, n), h() AS k(a int), ROWS FROM (f(), g() AS (b text)) AS r">
		>().toEqualTypeOf<"SELECT * FROM LATERAL (SELECT * FROM (a FULL JOIN b ON true)) AS j(x), t AS u, v AS w, f(1) WITH ORDINALITY AS g(a, n), h() AS k (a int4), ROWS FROM (f(), g() AS (b text)) AS r">();
		expectTypeOf<
			Canon<"SELECT 1 UNION SELECT 2 INTERSECT ALL SELECT 3 EXCEPT ALL (SELECT 4 ORDER BY 1) ORDER BY 1 LIMIT 2 OFFSET 1">
		>().toEqualTypeOf<"((SELECT 1 UNION (SELECT 2 INTERSECT ALL SELECT 3)) EXCEPT ALL (SELECT 4 ORDER BY 1)) ORDER BY 1 LIMIT 2 OFFSET 1">();
		expectTypeOf<
			Canon<"WITH RECURSIVE r(n) AS (VALUES (1) UNION ALL SELECT n + 1 FROM r) CYCLE n SET c USING p SELECT DISTINCT ON (n) n FROM r LIMIT ALL">
		>().toEqualTypeOf<"WITH RECURSIVE r(n) AS ((VALUES (1) UNION ALL SELECT (n + 1) FROM r)) CYCLE n SET c USING p SELECT DISTINCT ON (n) n FROM r">();
		expectTypeOf<
			Canon<"((SELECT 1)) FETCH FIRST ROW ONLY">
		>().toEqualTypeOf<"SELECT 1 LIMIT 1">();
		expectTypeOf<
			Canon<"SELECT a, count(*) FROM t GROUP BY a, ROLLUP (b, (c, d)), GROUPING SETS ((e)) HAVING count(*) > 1">
		>().toEqualTypeOf<"SELECT a, count(*) FROM t GROUP BY [SETS] a, b, ROW(c, d) HAVING (count(*) > 1)">();
	});

	test("DML, views, DDL; other statements are out of scope; errors", () => {
		expectTypeOf<
			Canon<"WITH s AS (SELECT 1) INSERT INTO t AS x (a, b[1]) SELECT * FROM s ON CONFLICT (a) DO UPDATE SET a = 1 WHERE x.a > 0 RETURNING *">
		>().toEqualTypeOf<"WITH s AS (SELECT 1) INSERT INTO t AS x (a, b[1]) SELECT * FROM s ON CONFLICT DO UPDATE SET a = 1 WHERE (x.a > 0) RETURNING *">();
		expectTypeOf<
			Canon<"UPDATE t SET (a, b) = (1, 2), c.f = DEFAULT FROM u WHERE CURRENT OF cur RETURNING WITH (OLD AS o) o.a">
		>().toEqualTypeOf<"UPDATE t SET (a, b) = ROW(1, 2), (c).f = DEFAULT FROM u RETURNING WITH (OLD AS o) o.a">();
		expectTypeOf<
			Canon<"MERGE INTO t USING s ON t.id = s.id WHEN MATCHED AND s.x THEN DELETE WHEN NOT MATCHED THEN INSERT (id) VALUES (s.id) WHEN NOT MATCHED BY SOURCE THEN DO NOTHING">
		>().toEqualTypeOf<"MERGE INTO t USING s ON (t.id = s.id) WHEN MATCHED AND s.x THEN DELETE WHEN NOT MATCHED THEN INSERT (id) VALUES (s.id) WHEN NOT MATCHED BY SOURCE THEN DO NOTHING">();
		expectTypeOf<
			Canon<"SELECT 1 AS a INTO TEMP t">
		>().toEqualTypeOf<"CREATE TABLE t AS SELECT 1 AS a">();
		expectTypeOf<
			Canon<"CREATE MATERIALIZED VIEW v (a) AS SELECT 1">
		>().toEqualTypeOf<"CREATE MATERIALIZED VIEW v(a) AS SELECT 1">();
		expectTypeOf<
			Canon<"CREATE RECURSIVE VIEW v (n) AS SELECT 1">
		>().toEqualTypeOf<"CREATE VIEW v(n) AS WITH RECURSIVE v(n) AS (SELECT 1) SELECT n FROM v">();
		expectTypeOf<Canon<"CREATE INDEX ON t (a)">>().toEqualTypeOf<"…">();
		expectTypeOf<
			Canon<"CREATE TABLE IF NOT EXISTS s.t (a serial PRIMARY KEY, b int NOT NULL DEFAULT 1, c int GENERATED ALWAYS AS IDENTITY, d text CHECK (d <> ''), PRIMARY KEY (a), NOT NULL d, UNIQUE (b), LIKE u INCLUDING DEFAULTS) INHERITS (p)">
		>().toEqualTypeOf<"CREATE TABLE IF NOT EXISTS s.t (a int4 NOT NULL DEFAULT PRIMARY KEY, b int4 NOT NULL DEFAULT, c int4 NOT NULL DEFAULT, d text, PRIMARY KEY (a), NOT NULL d, CONSTRAINT …, LIKE u DEFAULTS) INHERITS (p)">();
		expectTypeOf<
			Canon<"CREATE TABLE x PARTITION OF p (a NOT NULL) FOR VALUES IN (1)">
		>().toEqualTypeOf<"CREATE TABLE x () INHERITS (p)">();
		expectTypeOf<
			Canon<"ALTER TABLE IF EXISTS t ADD COLUMN z int, DROP q, ALTER a TYPE bigint, ALTER b DROP DEFAULT, ADD NOT NULL c, ADD PRIMARY KEY (a), OWNER TO r">
		>().toEqualTypeOf<"ALTER TABLE IF EXISTS t ADD COLUMN z int4, DROP COLUMN q, ALTER COLUMN a TYPE int8, ALTER COLUMN b DROP DEFAULT, ALTER COLUMN c SET NOT NULL, ADD PRIMARY KEY (a), …">();
		expectTypeOf<
			Canon<"ALTER VIEW v RENAME COLUMN a TO b">
		>().toEqualTypeOf<"ALTER TABLE v RENAME COLUMN a TO b">();
		expectTypeOf<
			Canon<"DROP TYPE IF EXISTS a.b, c CASCADE">
		>().toEqualTypeOf<"DROP TYPE IF EXISTS a.b, c CASCADE">();
		expectTypeOf<
			Canon<"ALTER TYPE e ADD VALUE IF NOT EXISTS 'x' BEFORE 'y'">
		>().toEqualTypeOf<"ALTER TYPE e ADD VALUE IF NOT EXISTS 'x'">();
		expectTypeOf<
			Canon<"CREATE SCHEMA s CREATE VIEW v AS SELECT 1 CREATE TABLE t (a int) CREATE INDEX ON t (a)">
		>().toEqualTypeOf<"CREATE SCHEMA s (CREATE TABLE s.t (a int4); CREATE VIEW s.v AS SELECT 1)">();
		expectTypeOf<
			Canon<"CREATE FUNCTION f(int) RETURNS SETOF text AS 'x' LANGUAGE sql">
		>().toEqualTypeOf<"CREATE FUNCTION f RETURNS SETOF text">();
		expectTypeOf<Canon<"FETCH FORWARD 2 FROM c">>().toEqualTypeOf<"FETCH c">();
		expectTypeOf<
			Canon<"SELECT 1 +">
		>().toEqualTypeOf<"!syntax error at end of input">();
	});
});

test("regression fixes retain PostgreSQL parse trees", () => {
	expectTypeOf<
		Canon<"CREATE FUNCTION f() RETURNS t.a%foo">
	>().toEqualTypeOf<"!syntax error at or near foo">();
	expectTypeOf<
		Canon<"CREATE FUNCTION f() RETURNS TABLE a int">
	>().toEqualTypeOf<'!syntax error: expected "(" at or near a'>();
	expectTypeOf<
		Canon<"CREATE FUNCTION f() RETURNS TABLE ()">
	>().toEqualTypeOf<"!syntax error: expected column name at or near )">();
	expectTypeOf<
		Canon<"CREATE FUNCTION f() RETURNS TABLE (a)">
	>().toEqualTypeOf<"!syntax error: expected type name at or near )">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING GENERATED)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src DEFAULTS)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING IDENTITY EXCLUDING IDENTITY)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING ALL EXCLUDING DEFAULTS EXCLUDING GENERATED)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src DEFAULTS)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING ALL EXCLUDING DEFAULTS EXCLUDING IDENTITY)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src DEFAULTS)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING COMMENTS)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING DEFAULTS EXCLUDING COMMENTS)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src DEFAULTS)">();
	expectTypeOf<
		Canon<"SELECT 'a'::\"char\", 'a'::char, 'a'::pg_catalog.\"char\", 'a'::\"char\"[]">
	>().toEqualTypeOf<"SELECT ('a'::char), ('a'::bpchar), ('a'::char), ('a'::char[])">();
	expectTypeOf<
		Canon<"CREATE FUNCTION f() RETURNS TABLE (a int) AS 'SELECT 1' LANGUAGE sql">
	>().toEqualTypeOf<"CREATE FUNCTION f RETURNS SETOF int4">();
	expectTypeOf<
		Canon<"CREATE FUNCTION f() RETURNS TABLE (a int, b text) AS 'SELECT 1, 2' LANGUAGE sql">
	>().toEqualTypeOf<"CREATE FUNCTION f RETURNS SETOF record">();
	expectTypeOf<
		Canon<"CREATE FUNCTION f() RETURNS SETOF public.t.a%TYPE AS 'SELECT 1' LANGUAGE sql">
	>().toEqualTypeOf<"CREATE FUNCTION f RETURNS SETOF a%type">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING ALL EXCLUDING DEFAULTS)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src DEFAULTS)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING DEFAULTS EXCLUDING DEFAULTS)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING IDENTITY EXCLUDING GENERATED)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src DEFAULTS)">();
	expectTypeOf<
		Canon<"CREATE TABLE t (LIKE src INCLUDING ALL EXCLUDING ALL)">
	>().toEqualTypeOf<"CREATE TABLE t (LIKE src)">();
});
