import { beforeAll, describe, expect, test } from "vitest";
import { OUT } from "./pg-canon.js";
import {
	diffWindow,
	loadParser,
	pgStatements,
	stringLiteral,
} from "./statements.js";

beforeAll(loadParser);

function canon(sql: string): string {
	const r = pgStatements(sql);
	if (!r) throw new Error(`Postgres rejects ${sql}`);
	expect(r).toHaveLength(1);
	return r[0]![1];
}

describe("the canonical form of Postgres's parse tree", () => {
	test("operator precedence, AND / OR chains, NOT", () => {
		expect(canon("SELECT v FROM c WHERE x = 1 OR true AND v IS NOT NULL")).toBe(
			"SELECT v FROM c WHERE ((x = 1) OR (true AND (v IS NOT NULL)))",
		);
		expect(canon("SELECT a AND (b AND c) AND NOT d OR e")).toBe(
			"SELECT ((a AND b AND c AND (NOT d)) OR e)",
		);
		expect(canon("SELECT 1 + 2 * 3 ^ 4 - 5, a || b || c, a != b")).toBe(
			"SELECT ((1 + (2 * (3 ^ 4))) - 5), ((a || b) || c), (a <> b)",
		);
	});

	test("negative numbers are unary minus applied to the literal, as our parser keeps them", () => {
		expect(
			canon("SELECT -1, - (2.5), - -3, -x, -1::int, 1e3, 1_000, 0x1F"),
		).toBe(
			"SELECT (- 1), (- 2.5), (- (- 3)), (- x), (- (1::int4)), 1e3, 1_000, 0x1F",
		);
	});

	test("predicates: IS, BETWEEN, IN, LIKE, ANY / ALL", () => {
		expect(
			canon(
				"SELECT x NOT BETWEEN SYMMETRIC 1 AND 2, x IS NOT DISTINCT FROM y, x IS UNKNOWN, x ISNULL",
			),
		).toBe(
			"SELECT (x NOT BETWEEN 1 AND 2), (x IS NOT DISTINCT FROM y), (x IS UNKNOWN), (x IS NULL)",
		);
		expect(
			canon(
				"SELECT x NOT IN (1, 2), x NOT IN (SELECT 1), x = ANY (ARRAY[1]), x < ALL (SELECT 1), x IN (SELECT 1)",
			),
		).toBe(
			"SELECT (x NOT IN (1, 2)), (NOT (x IN (SELECT 1))), (x = ANY (ARRAY[1])), (x < ALL (SELECT 1)), (x IN (SELECT 1))",
		);
		expect(
			canon(
				"SELECT x LIKE 'a' ESCAPE '!', x NOT ILIKE 'b', x SIMILAR TO 'c', x NOT LIKE ANY (y)",
			),
		).toBe(
			"SELECT (x LIKE 'a'), (x NOT ILIKE 'b'), (x SIMILAR TO 'c'), (x !~~ ANY (y))",
		);
	});

	test("casts, COLLATE, AT TIME ZONE, subscripts, fields, rows, special calls", () => {
		expect(
			canon(
				`SELECT CAST(a AS integer[]), int4 '1', b COLLATE "C", t AT TIME ZONE 'UTC', a[1][2:], (r).f, (a).b.c, ROW(1, 2), (1, 2)`,
			),
		).toBe(
			"SELECT (a::int4[]), ('1'::int4), (b COLLATE C), timezone('UTC', t), a[1][2:], (r).f, ((a).b).c, ROW(1, 2), ROW(1, 2)",
		);
		expect(
			canon(
				"SELECT substring(s FROM 2 FOR 3), substring(s FOR 3), position('a' IN s), trim(LEADING 'x' FROM s), extract(year FROM d), current_date, coalesce(a, b), nullif(a, b)",
			),
		).toBe(
			"SELECT substring(s, 2, 3), substring(s, 1, 3), position(s, 'a'), ltrim(s, 'x'), extract('year', d), current_date(), coalesce(a, b), nullif(a, b)",
		);
		expect(
			canon(
				"SELECT a OPERATOR(pg_catalog.+) b, E'a\\'b', U&'d\\0061t', 'it''s'",
			),
		).toBe("SELECT (a + b), 'a\\'b', 'd\\0061t', 'it's'");
	});

	test("calls: DISTINCT, *, named and variadic arguments, WITHIN GROUP, FILTER, OVER", () => {
		expect(
			canon(
				"SELECT count(*) FILTER (WHERE x) OVER (w PARTITION BY a ORDER BY b DESC ROWS UNBOUNDED PRECEDING), sum(DISTINCT x ORDER BY y), f(1, VARIADIC b), g(a => 1), mode() WITHIN GROUP (ORDER BY x), rank() OVER w FROM t WINDOW w AS (ORDER BY c)",
			),
		).toBe(
			"SELECT count(*) FILTER (WHERE x) OVER (w PARTITION BY a ORDER BY b), sum(DISTINCT x), f(1, VARIADIC b), g(a => 1), mode() WITHIN GROUP (x), rank() OVER (w) FROM t WINDOW w AS (ORDER BY c)",
		);
	});

	test("FROM: joins, LATERAL, aliases, functions", () => {
		expect(
			canon(
				"SELECT * FROM a JOIN b LEFT JOIN c USING (x) ON p NATURAL JOIN d CROSS JOIN e, LATERAL (SELECT 1) AS s(x)",
			),
		).toBe(
			"SELECT * FROM (((a INNER JOIN (b LEFT JOIN c USING (x)) ON p) NATURAL INNER JOIN d) CROSS JOIN e), LATERAL (SELECT 1) AS s(x)",
		);
		expect(
			canon(
				"SELECT * FROM (a FULL JOIN b ON true) AS j(x), ONLY t AS u, v * AS w, f(1) WITH ORDINALITY AS g(a, n), h() AS k(a int), ROWS FROM (f(), g() AS (b text)) AS r",
			),
		).toBe(
			"SELECT * FROM LATERAL (SELECT * FROM (a FULL JOIN b ON true)) AS j(x), t AS u, v AS w, f(1) WITH ORDINALITY AS g(a, n), h() AS k (a int4), ROWS FROM (f(), g() AS (b text)) AS r",
		);
	});

	test("set operations, ORDER BY and LIMIT attachment, WITH", () => {
		expect(
			canon(
				"SELECT 1 UNION SELECT 2 INTERSECT ALL SELECT 3 EXCEPT ALL (SELECT 4 ORDER BY 1) ORDER BY 1 LIMIT 2 OFFSET 1",
			),
		).toBe(
			"((SELECT 1 UNION (SELECT 2 INTERSECT ALL SELECT 3)) EXCEPT ALL (SELECT 4 ORDER BY 1)) ORDER BY 1 LIMIT 2 OFFSET 1",
		);
		expect(
			canon(
				"WITH RECURSIVE r(n) AS (VALUES (1) UNION ALL SELECT n + 1 FROM r) CYCLE n SET c USING p SELECT DISTINCT ON (n) n FROM r LIMIT ALL",
			),
		).toBe(
			"WITH RECURSIVE r(n) AS ((VALUES (1) UNION ALL SELECT (n + 1) FROM r)) CYCLE n SET c USING p SELECT DISTINCT ON (n) n FROM r",
		);
		expect(canon("((SELECT 1)) FETCH FIRST ROW ONLY")).toBe("SELECT 1 LIMIT 1");
		expect(
			canon(
				"SELECT a, count(*) FROM t GROUP BY a, ROLLUP (b, (c, d)), GROUPING SETS ((e)) HAVING count(*) > 1",
			),
		).toBe(
			"SELECT a, count(*) FROM t GROUP BY [SETS] a, b, ROW(c, d) HAVING (count(*) > 1)",
		);
	});

	test("DML, views, cursors; other statements are out of scope", () => {
		expect(
			canon(
				"WITH s AS (SELECT 1) INSERT INTO t AS x (a, b[1]) SELECT * FROM s ON CONFLICT (a) DO UPDATE SET a = 1 WHERE x.a > 0 RETURNING *",
			),
		).toBe(
			"WITH s AS (SELECT 1) INSERT INTO t AS x (a, b[1]) SELECT * FROM s ON CONFLICT DO UPDATE SET a = 1 WHERE (x.a > 0) RETURNING *",
		);
		expect(
			canon(
				"UPDATE t SET (a, b) = (1, 2), c.f = DEFAULT FROM u WHERE CURRENT OF cur RETURNING WITH (OLD AS o) o.a",
			),
		).toBe(
			"UPDATE t SET (a, b) = ROW(1, 2), (c).f = DEFAULT FROM u RETURNING WITH (OLD AS o) o.a",
		);
		expect(
			canon(
				"MERGE INTO t USING s ON t.id = s.id WHEN MATCHED AND s.x THEN DELETE WHEN NOT MATCHED THEN INSERT (id) VALUES (s.id) WHEN NOT MATCHED BY SOURCE THEN DO NOTHING",
			),
		).toBe(
			"MERGE INTO t USING s ON (t.id = s.id) WHEN MATCHED AND s.x THEN DELETE WHEN NOT MATCHED THEN INSERT (id) VALUES (s.id) WHEN NOT MATCHED BY SOURCE THEN DO NOTHING",
		);
		expect(canon("SELECT 1 AS a INTO TEMP t")).toBe(
			"CREATE TABLE t AS SELECT 1 AS a",
		);
		expect(canon("CREATE MATERIALIZED VIEW v (a) AS SELECT 1")).toBe(
			"CREATE MATERIALIZED VIEW v(a) AS SELECT 1",
		);
		expect(canon("CREATE RECURSIVE VIEW v (n) AS SELECT 1")).toBe(
			"CREATE VIEW v(n) AS WITH RECURSIVE v(n) AS (SELECT 1) SELECT n FROM v",
		);
		expect(canon("CREATE INDEX ON t (a)")).toBe(OUT);
	});

	test("DDL as our AST keeps it", () => {
		expect(
			canon(
				"CREATE TABLE IF NOT EXISTS s.t (a serial PRIMARY KEY, b int NOT NULL DEFAULT 1, c int GENERATED ALWAYS AS IDENTITY, d text CHECK (d <> ''), PRIMARY KEY (a), NOT NULL d, UNIQUE (b), LIKE u INCLUDING DEFAULTS) INHERITS (p)",
			),
		).toBe(
			"CREATE TABLE IF NOT EXISTS s.t (a int4 NOT NULL DEFAULT PRIMARY KEY, b int4 NOT NULL DEFAULT, c int4 NOT NULL DEFAULT, d text, PRIMARY KEY (a), NOT NULL d, CONSTRAINT …, LIKE u DEFAULTS) INHERITS (p)",
		);
		expect(
			canon("CREATE TABLE x PARTITION OF p (a NOT NULL) FOR VALUES IN (1)"),
		).toBe("CREATE TABLE x () INHERITS (p)");
		expect(
			canon(
				"ALTER TABLE IF EXISTS t ADD COLUMN z int, DROP q, ALTER a TYPE bigint, ALTER b DROP DEFAULT, ADD NOT NULL c, ADD PRIMARY KEY (a), OWNER TO r",
			),
		).toBe(
			"ALTER TABLE IF EXISTS t ADD COLUMN z int4, DROP COLUMN q, ALTER COLUMN a TYPE int8, ALTER COLUMN b DROP DEFAULT, ALTER COLUMN c SET NOT NULL, ADD PRIMARY KEY (a), …",
		);
		expect(canon("ALTER VIEW v RENAME COLUMN a TO b")).toBe(
			"ALTER TABLE v RENAME COLUMN a TO b",
		);
		expect(canon("DROP TYPE IF EXISTS a.b, c CASCADE")).toBe(
			"DROP TYPE IF EXISTS a.b, c CASCADE",
		);
		expect(canon("ALTER TYPE e ADD VALUE IF NOT EXISTS 'x' BEFORE 'y'")).toBe(
			"ALTER TYPE e ADD VALUE IF NOT EXISTS 'x'",
		);
		expect(
			canon(
				"CREATE SCHEMA s CREATE VIEW v AS SELECT 1 CREATE TABLE t (a int) CREATE INDEX ON t (a)",
			),
		).toBe(
			"CREATE SCHEMA s (CREATE TABLE s.t (a int4); CREATE VIEW s.v AS SELECT 1)",
		);
		expect(
			canon("CREATE FUNCTION f(int) RETURNS SETOF text AS 'x' LANGUAGE sql"),
		).toBe("CREATE FUNCTION f RETURNS SETOF text");
		expect(canon("FETCH FORWARD 2 FROM c")).toBe("FETCH c");
	});

	test("several statements in one text are split", () => {
		const r = pgStatements("CREATE INDEX ON t (a); SELECT -1;");
		expect(r).toEqual([
			["CREATE INDEX ON t (a)", OUT],
			["SELECT -1", "SELECT (- 1)"],
		]);
		expect(pgStatements("SELECT FROM WHERE")).toBeNull();
	});
});

describe("helpers", () => {
	test("a printed string literal type is read back", () => {
		expect(stringLiteral(String.raw`"a\"b\\c\né\x41\0"`)).toBe('a"b\\c\néA\0');
		expect(stringLiteral("`!x ${string}`")).toBeNull();
	});

	test("diffWindow shows both forms around the first difference", () => {
		expect(
			diffWindow("SELECT ((a OR b) AND c)", "SELECT (a OR (b AND c))", 5, 10),
		).toEqual(["…ECT ((a OR b) A…", "…ECT (a OR (b AN…"]);
	});
});

test("regression fixes retain PostgreSQL parse trees", () => {
	expect(
		canon(
			"SELECT 'a'::\"char\", 'a'::char, 'a'::pg_catalog.\"char\", 'a'::\"char\"[]",
		),
	).toBe("SELECT ('a'::char), ('a'::bpchar), ('a'::char), ('a'::char[])");
	expect(
		canon(
			"CREATE FUNCTION f() RETURNS TABLE (a int) AS 'SELECT 1' LANGUAGE sql",
		),
	).toBe("CREATE FUNCTION f RETURNS SETOF int4");
	expect(
		canon(
			"CREATE FUNCTION f() RETURNS TABLE (a int, b text) AS 'SELECT 1, 2' LANGUAGE sql",
		),
	).toBe("CREATE FUNCTION f RETURNS SETOF record");
	expect(
		canon(
			"CREATE FUNCTION f() RETURNS SETOF public.t.a%TYPE AS 'SELECT 1' LANGUAGE sql",
		),
	).toBe("CREATE FUNCTION f RETURNS SETOF a%type");
	expect(
		canon("CREATE TABLE t (LIKE src INCLUDING ALL EXCLUDING DEFAULTS)"),
	).toBe("CREATE TABLE t (LIKE src DEFAULTS)");
	expect(
		canon("CREATE TABLE t (LIKE src INCLUDING DEFAULTS EXCLUDING DEFAULTS)"),
	).toBe("CREATE TABLE t (LIKE src)");
	expect(
		canon("CREATE TABLE t (LIKE src INCLUDING IDENTITY EXCLUDING GENERATED)"),
	).toBe("CREATE TABLE t (LIKE src DEFAULTS)");
	expect(canon("CREATE TABLE t (LIKE src INCLUDING ALL EXCLUDING ALL)")).toBe(
		"CREATE TABLE t (LIKE src)",
	);
});
