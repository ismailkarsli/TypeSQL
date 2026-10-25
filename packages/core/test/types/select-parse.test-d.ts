import { expectTypeOf, test } from "vitest";
import type {
	ApplyDdl,
	Col,
	DefaultTypeMap,
	Nullable,
	RowOf,
	SqlError,
	Validate,
} from "../../src/index.js";
import type { Canon } from "../pg-ast/canon.js";

// The SELECT statement parser (parser/select.ts) against PostgreSQL 18's grammar: the clauses
// after the body (LIMIT, OFFSET, FETCH, locking), FROM items after ONLY and LATERAL, the
// function-like keywords in FROM, and the errors of each construct. Every expectation was checked
// against PostgreSQL 18; error positions are token indexes (see errors.test-d.ts). What no type
// shows (LIMIT against OFFSET, INTERSECT ALL, LATERAL on a function) is checked on the
// canonical form of the tree, which test/pg-ast compares with PostgreSQL's.

interface DB {
	t: { a: Col<"int4">; b: Nullable<"text"> };
	u: { a: Col<"int4">; c: Col<"text"> };
	json_table: { x: Col<"int4"> };
	rows: { x: Col<"int4"> };
}
type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;

test("the tree: LIMIT and OFFSET in either order, FETCH's count, INTERSECT ALL, LATERAL", () => {
	expectTypeOf<
		[
			Canon<"SELECT 1 OFFSET 2 FETCH FIRST 3 ROWS ONLY">,
			Canon<"SELECT 1 FETCH NEXT ROW ONLY OFFSET 2 ROWS">,
			Canon<"SELECT 1 OFFSET 1 LIMIT 4">,
			Canon<"SELECT 1 LIMIT ALL OFFSET 1">,
			Canon<"SELECT 1 INTERSECT ALL SELECT 2 INTERSECT DISTINCT SELECT 3">,
			Canon<"SELECT * FROM t, LATERAL current_date, LATERAL CAST(1 AS int) c, current_time, LATERAL collation for ('a'::text) x">,
			Canon<"SELECT * FROM t, LATERAL generate_series(1, 2) g, generate_series(1, 2) h">,
			Canon<"SELECT * FROM ONLY (t) x, ONLY u">,
		]
	>().toEqualTypeOf<
		[
			"SELECT 1 LIMIT 3 OFFSET 2",
			"SELECT 1 LIMIT 1 OFFSET 2",
			"SELECT 1 LIMIT 4 OFFSET 1",
			"SELECT 1 OFFSET 1",
			"((SELECT 1 INTERSECT ALL SELECT 2) INTERSECT SELECT 3)",
			"SELECT * FROM t, LATERAL current_date(), LATERAL (1::int4) AS c, current_time(), LATERAL pg_collation_for(('a'::text)) AS x",
			"SELECT * FROM t, LATERAL generate_series(1, 2) AS g, generate_series(1, 2) AS h",
			"SELECT * FROM t AS x, u",
		]
	>();
});

test("SELECT INTO with TEMPORARY, TEMP or UNLOGGED", () => {
	type DB2 = ApplyDdl<
		DB,
		"SELECT 1 AS a INTO TEMPORARY t1; SELECT 'x' AS b INTO TEMP TABLE t2; SELECT true AS c INTO UNLOGGED t3"
	>;
	expectTypeOf<
		RowOf<DB2, DefaultTypeMap, "SELECT * FROM t1, t2, t3">
	>().toEqualTypeOf<{
		a: number | null;
		b: string | null;
		c: boolean | null;
	}>();
	// not followed by TABLE or a name, TEMPORARY, TEMP and UNLOGGED are the name
	type DB3 = ApplyDdl<
		DB,
		"SELECT 1 AS d INTO TEMPORARY; SELECT 'x' AS e INTO TEMP FROM t; SELECT true AS f INTO UNLOGGED WHERE true; SELECT 2 AS g INTO TEMP temp2"
	>;
	expectTypeOf<
		RowOf<
			DB3,
			DefaultTypeMap,
			'SELECT * FROM "temporary", "temp", "unlogged", temp2'
		>
	>().toEqualTypeOf<{
		d: number | null;
		e: string | null;
		f: boolean | null;
		g: number | null;
	}>();
	expectTypeOf<V<"SELECT 1 INTO TEMP TABLE">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 5>
	>();
	expectTypeOf<V<"SELECT 1 INTO LOCAL TEMP">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 5>
	>();
	expectTypeOf<V<"SELECT 1 INTO x y">>().toEqualTypeOf<
		SqlError<"syntax error at or near y", 4>
	>();
});

test("a WITH, a parenthesized operand and a VALUES row report their own errors", () => {
	expectTypeOf<
		V<"SELECT * FROM (WITH c AS SELECT 1 SELECT 1) s">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near select', 7>
	>();
	expectTypeOf<V<"SELECT 1 UNION (SELECT 1 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 7>
	>();
	expectTypeOf<V<"VALUES (1, )">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
});

test("OFFSET takes ROW or ROWS; FETCH takes FIRST or NEXT, a count or none, ROW or ROWS, ONLY or WITH TIES", () => {
	expectTypeOf<Row<"SELECT a FROM t OFFSET 1 ROW">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<Row<"SELECT a FROM t OFFSET 1 ROWS">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<Row<"SELECT a FROM t FETCH FIRST ROW ONLY">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<Row<"SELECT a FROM t FETCH NEXT ROWS ONLY">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<Row<"SELECT a FROM t FETCH NEXT 2 ROW ONLY">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<
		Row<"SELECT a FROM t ORDER BY a FETCH FIRST 2 ROWS WITH TIES">
	>().toEqualTypeOf<{ a: number }>();
	expectTypeOf<V<"SELECT a FROM t FETCH FIRST (1 ROWS ONLY">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near rows', 8>
	>();
	expectTypeOf<V<"SELECT a FROM t FETCH FIRST 1 ONLY">>().toEqualTypeOf<
		SqlError<"syntax error at or near only", 7>
	>();
	expectTypeOf<V<"SELECT a FROM t FETCH FIRST 2 ROWS">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 8>
	>();
	expectTypeOf<V<"SELECT a FROM t FETCH FIRST 2 ROWS WITH">>().toEqualTypeOf<
		SqlError<"syntax error at or near with", 8>
	>();
	expectTypeOf<V<"SELECT a FROM t FETCH 2 ROWS ONLY">>().toEqualTypeOf<
		SqlError<"syntax error: expected FIRST or NEXT at or near 2", 5>
	>();
});

test("one LIMIT or FETCH and one OFFSET, in either order; LIMIT n, m is an error", () => {
	expectTypeOf<V<"SELECT a FROM t LIMIT 1 LIMIT 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near limit", 6>
	>();
	expectTypeOf<V<"SELECT a FROM t LIMIT ALL LIMIT 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near limit", 6>
	>();
	expectTypeOf<V<"SELECT a FROM t OFFSET 1 OFFSET 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near offset", 6>
	>();
	expectTypeOf<
		V<"SELECT a FROM t LIMIT 1 FETCH FIRST 2 ROWS ONLY">
	>().toEqualTypeOf<SqlError<"syntax error at or near fetch", 6>>();
	expectTypeOf<
		V<"SELECT a FROM t FETCH FIRST 2 ROWS ONLY LIMIT 1">
	>().toEqualTypeOf<SqlError<"syntax error at or near limit", 9>>();
	expectTypeOf<V<"SELECT a FROM t LIMIT 1 OFFSET 1 LIMIT 1">>().toEqualTypeOf<
		SqlError<"syntax error at or near limit", 8>
	>();
	expectTypeOf<
		V<"SELECT a FROM t OFFSET 1 FETCH FIRST 2 ROWS ONLY OFFSET 1">
	>().toEqualTypeOf<SqlError<"syntax error at or near offset", 11>>();
	expectTypeOf<V<"SELECT a FROM t LIMIT 1, 2">>().toEqualTypeOf<
		SqlError<"LIMIT #,# syntax is not supported", 4>
	>();
	expectTypeOf<V<"SELECT a FROM t LIMIT ALL, 2">>().toEqualTypeOf<
		SqlError<"LIMIT #,# syntax is not supported", 4>
	>();
	expectTypeOf<V<"SELECT a FROM t LIMIT (1">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 7>
	>();
	expectTypeOf<V<"SELECT a FROM t OFFSET (1 ROW">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near row', 7>
	>();
});

test("WITH TIES needs an ORDER BY: the statement's own, or that of the parenthesized query", () => {
	expectTypeOf<V<"SELECT a FROM t FETCH NEXT ROW WITH TIES">>().toEqualTypeOf<
		SqlError<"WITH TIES cannot be specified without ORDER BY clause", 7>
	>();
	expectTypeOf<
		V<"SELECT 1 UNION SELECT 2 FETCH FIRST 1 ROW WITH TIES">
	>().toEqualTypeOf<
		SqlError<"WITH TIES cannot be specified without ORDER BY clause", 9>
	>();
	expectTypeOf<V<"((SELECT 1)) FETCH FIRST 1 ROW WITH TIES">>().toEqualTypeOf<
		SqlError<"WITH TIES cannot be specified without ORDER BY clause", 10>
	>();
	expectTypeOf<
		Row<"((SELECT 1 ORDER BY 1)) FETCH FIRST 1 ROW WITH TIES">
	>().toEqualTypeOf<{ "?column?": number }>();
	expectTypeOf<
		Row<"SELECT 1 UNION SELECT 2 ORDER BY 1 FETCH FIRST 1 ROW WITH TIES">
	>().toEqualTypeOf<{ "?column?": number }>();
	expectTypeOf<
		V<"SELECT * FROM (SELECT a FROM t FETCH FIRST 1 ROW WITH TIES) s">
	>().toEqualTypeOf<
		SqlError<"WITH TIES cannot be specified without ORDER BY clause", 12>
	>();
});

test("FOR UPDATE OF needs a name list; FOR READ ONLY locks nothing", () => {
	expectTypeOf<V<"SELECT a FROM t FOR UPDATE OF">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 7>
	>();
	expectTypeOf<V<"SELECT a FROM t FOR UPDATE OF t,">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 9>
	>();
	expectTypeOf<V<"SELECT a FROM t LIMIT 1 FOR UPDATE OF">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 9>
	>();
	expectTypeOf<
		V<"SELECT * FROM (SELECT a FROM t FOR UPDATE OF) s">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 11>>();
	expectTypeOf<
		Row<"SELECT a FROM t FOR UPDATE OF t FOR SHARE OF t NOWAIT">
	>().toEqualTypeOf<{ a: number }>();
	expectTypeOf<Row<"SELECT a FROM t FOR READ ONLY">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<Row<"SELECT 1 UNION SELECT 2 FOR READ ONLY">>().toEqualTypeOf<{
		"?column?": number;
	}>();
	expectTypeOf<V<"SELECT a FROM t FOR READ ONLY FOR UPDATE">>().toEqualTypeOf<
		SqlError<"syntax error at or near for", 7>
	>();
	expectTypeOf<Row<"SELECT a FROM t FOR READ ONLY LIMIT 1">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<Row<"SELECT a FROM t LIMIT 1 FOR READ ONLY">>().toEqualTypeOf<{
		a: number;
	}>();
});

test("a locking clause goes before or after LIMIT, not both, and not on a set operation, parenthesized or not", () => {
	expectTypeOf<
		V<"SELECT a FROM t FOR UPDATE LIMIT 1 FOR SHARE">
	>().toEqualTypeOf<SqlError<"syntax error at or near for", 8>>();
	expectTypeOf<Row<"SELECT a FROM t FOR UPDATE LIMIT 1">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<
		Row<"SELECT a FROM t LIMIT 1 FOR UPDATE FOR SHARE">
	>().toEqualTypeOf<{ a: number }>();
	expectTypeOf<V<"(SELECT 1 UNION SELECT 2) FOR UPDATE">>().toEqualTypeOf<
		SqlError<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", 7>
	>();
	expectTypeOf<
		V<"((SELECT 1 UNION SELECT 2)) LIMIT 1 FOR UPDATE">
	>().toEqualTypeOf<
		SqlError<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", 11>
	>();
	expectTypeOf<V<"SELECT 1 UNION SELECT 2 FOR UPDATE">>().toEqualTypeOf<
		SqlError<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", 5>
	>();
	expectTypeOf<V<"SELECT 1 UNION SELECT 2 LIMIT 1 FOR UPDATE">>().toEqualTypeOf<
		SqlError<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", 7>
	>();
	expectTypeOf<
		V<"SELECT 1 UNION SELECT 2 ORDER BY 1 FETCH FIRST 1 ROW WITH TIES FOR UPDATE">
	>().toEqualTypeOf<
		SqlError<"FOR UPDATE is not allowed with UNION/INTERSECT/EXCEPT", 14>
	>();
	expectTypeOf<Row<"(SELECT a FROM t) FOR UPDATE">>().toEqualTypeOf<{
		a: number;
	}>();
});

test("json_table and rows are table names unless JSON_TABLE( or ROWS FROM follows", () => {
	expectTypeOf<Row<"SELECT * FROM json_table">>().toEqualTypeOf<{
		x: number;
	}>();
	expectTypeOf<Row<"SELECT j.x FROM json_table AS j">>().toEqualTypeOf<{
		x: number;
	}>();
	expectTypeOf<Row<"SELECT * FROM rows">>().toEqualTypeOf<{ x: number }>();
	expectTypeOf<Row<"SELECT r.x FROM rows r">>().toEqualTypeOf<{ x: number }>();
	expectTypeOf<V<"SELECT * FROM t FROM t">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 4>
	>();
});

test("an alias error after a subquery or JSON_TABLE", () => {
	expectTypeOf<V<"SELECT * FROM (SELECT 1) AS">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 8>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE('[]'::jsonb, '$' COLUMNS (a int)) AS">
	>().toEqualTypeOf<SqlError<"syntax error at or near end of input", 17>>();
});

test("the function-like keywords in FROM", () => {
	expectTypeOf<Row<"SELECT * FROM current_date">>().toEqualTypeOf<{
		current_date: Date;
	}>();
	expectTypeOf<Row<"SELECT * FROM current_time">>().toEqualTypeOf<{
		current_time: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM current_time(2)">>().toEqualTypeOf<{
		current_time: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM current_timestamp">>().toEqualTypeOf<{
		current_timestamp: Date;
	}>();
	expectTypeOf<Row<"SELECT * FROM localtime">>().toEqualTypeOf<{
		localtime: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM localtimestamp">>().toEqualTypeOf<{
		localtimestamp: Date;
	}>();
	expectTypeOf<Row<"SELECT * FROM current_role">>().toEqualTypeOf<{
		current_role: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM current_user">>().toEqualTypeOf<{
		current_user: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM session_user">>().toEqualTypeOf<{
		session_user: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM user">>().toEqualTypeOf<{ user: string }>();
	expectTypeOf<Row<"SELECT * FROM current_catalog">>().toEqualTypeOf<{
		current_catalog: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM current_schema">>().toEqualTypeOf<{
		current_schema: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM system_user">>().toEqualTypeOf<{
		system_user: string | null;
	}>();
	expectTypeOf<Row<"SELECT * FROM cast(1 AS int) c">>().toEqualTypeOf<{
		c: number;
	}>();
	expectTypeOf<V<"SELECT * FROM CAST(1 AS int">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 8>
	>();
	expectTypeOf<
		Row<"SELECT * FROM collation for ('a'::text) c">
	>().toEqualTypeOf<{
		c: string;
	}>();
	expectTypeOf<
		V<"SELECT * FROM collation(1) FILTER (WHERE true)">
	>().toEqualTypeOf<SqlError<"syntax error at or near where", 9>>();
	expectTypeOf<V<"SELECT * FROM collation">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near collation",
			3
		>
	>();
});

test("ONLY takes a table name, in parentheses or not, without *", () => {
	expectTypeOf<Row<"SELECT * FROM ONLY (t)">>().toEqualTypeOf<{
		a: number;
		b: string | null;
	}>();
	expectTypeOf<Row<"SELECT x.a FROM ONLY (t) x">>().toEqualTypeOf<{
		a: number;
	}>();
	expectTypeOf<
		Row<"SELECT x.a FROM ONLY t AS x TABLESAMPLE system (1)">
	>().toEqualTypeOf<{ a: number }>();
	expectTypeOf<Row<"SELECT * FROM ONLY t JOIN u USING (a)">>().toEqualTypeOf<{
		a: number;
		b: string | null;
		c: string;
	}>();
	expectTypeOf<Row<"SELECT * FROM t JOIN ONLY (u) USING (a)">>().toEqualTypeOf<{
		a: number;
		b: string | null;
		c: string;
	}>();
	expectTypeOf<V<"SELECT * FROM ONLY (t x)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near x', 6>
	>();
	expectTypeOf<V<"SELECT * FROM ONLY (SELECT 1) s">>().toEqualTypeOf<
		SqlError<"syntax error: expected table name at or near select", 5>
	>();
	expectTypeOf<V<"SELECT * FROM ONLY generate_series(1, 2)">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 5>
	>();
	expectTypeOf<V<"SELECT * FROM ONLY t *">>().toEqualTypeOf<
		SqlError<"syntax error at or near *", 5>
	>();
	expectTypeOf<V<"SELECT * FROM ONLY 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected table name at or near 1", 4>
	>();
	expectTypeOf<V<"SELECT * FROM ONLY (1)">>().toEqualTypeOf<
		SqlError<"syntax error: expected table name at or near 1", 5>
	>();
	expectTypeOf<V<"SELECT * FROM ONLY (t">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 6>
	>();
});

test("TABLE takes ONLY (name), or a name with *", () => {
	expectTypeOf<Row<"TABLE ONLY (t)">>().toEqualTypeOf<{
		a: number;
		b: string | null;
	}>();
	expectTypeOf<V<"TABLE ONLY (t">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 4>
	>();
	expectTypeOf<V<"TABLE ONLY t *">>().toEqualTypeOf<
		SqlError<"syntax error at or near *", 3>
	>();
	expectTypeOf<Row<"TABLE t *">>().toEqualTypeOf<{
		a: number;
		b: string | null;
	}>();
	expectTypeOf<Row<"TABLE ONLY t">>().toEqualTypeOf<{
		a: number;
		b: string | null;
	}>();
	expectTypeOf<V<"TABLE 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected table name at or near 1", 1>
	>();
});

test("LATERAL takes a subquery or a function, not a table or a join", () => {
	expectTypeOf<V<"SELECT * FROM t, LATERAL u">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 7>
	>();
	expectTypeOf<V<"SELECT * FROM t, LATERAL u x">>().toEqualTypeOf<
		SqlError<"syntax error at or near x", 7>
	>();
	expectTypeOf<V<"SELECT * FROM t, LATERAL public.u">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 9>
	>();
	expectTypeOf<
		V<"SELECT * FROM t, LATERAL (u JOIN t x ON true)">
	>().toEqualTypeOf<SqlError<"syntax error at or near u", 7>>();
	expectTypeOf<
		V<"SELECT * FROM t, LATERAL ((SELECT 1) s JOIN u ON true)">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near s', 11>>();
	expectTypeOf<
		Row<"SELECT * FROM t, LATERAL (SELECT t.a AS z) s">
	>().toEqualTypeOf<{ a: number; b: string | null; z: number }>();
	expectTypeOf<V<"SELECT * FROM t, LATERAL (SELECT t.a s">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 12>
	>();
	expectTypeOf<V<"SELECT * FROM t, LATERAL rows">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 7>
	>();
	expectTypeOf<V<"SELECT * FROM t, LATERAL json_table">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 7>
	>();
	expectTypeOf<V<"SELECT * FROM t JOIN LATERAL u ON true">>().toEqualTypeOf<
		SqlError<"syntax error at or near on", 7>
	>();
	expectTypeOf<V<"SELECT * FROM LATERAL ONLY t">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near only",
			4
		>
	>();
	expectTypeOf<Row<"SELECT * FROM t, LATERAL current_date">>().toEqualTypeOf<{
		a: number;
		b: string | null;
		current_date: Date;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM t, LATERAL collation for ('a'::text) c">
	>().toEqualTypeOf<{ a: number; b: string | null; c: string }>();
	expectTypeOf<
		Row<"SELECT * FROM t, LATERAL cast(t.a AS text) c">
	>().toEqualTypeOf<{ a: number; b: string | null; c: string }>();
	expectTypeOf<
		Row<"SELECT * FROM t, LATERAL generate_series(1, t.a) g">
	>().toEqualTypeOf<{ a: number; b: string | null; g: number }>();
	expectTypeOf<
		Row<"SELECT * FROM t, LATERAL ROWS FROM (generate_series(1, t.a)) g">
	>().toEqualTypeOf<{ a: number; b: string | null; g: number }>();
	expectTypeOf<
		Row<"SELECT * FROM t, LATERAL JSON_TABLE('[]'::jsonb, '$' COLUMNS (z int)) j">
	>().toEqualTypeOf<{ a: number; b: string | null; z: number | null }>();
});

test("errors of a parenthesized join and a function in FROM", () => {
	expectTypeOf<V<"SELECT * FROM (t JOIN u USING (a)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 11>
	>();
	expectTypeOf<V<"SELECT * FROM (t JOIN u USING (a)) AS">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 13>
	>();
	expectTypeOf<V<"SELECT * FROM generate_series(1, 2 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 9>
	>();
});

test("TABLESAMPLE and REPEATABLE errors", () => {
	expectTypeOf<V<"SELECT * FROM t TABLESAMPLE bernoulli">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near end of input', 6>
	>();
	expectTypeOf<V<"SELECT * FROM t TABLESAMPLE bernoulli (1">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 8>
	>();
	expectTypeOf<V<"SELECT * FROM t TABLESAMPLE bernoulli (1,)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 9>
	>();
	expectTypeOf<V<"SELECT * FROM t TABLESAMPLE 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected tablesample method at or near 1", 5>
	>();
	expectTypeOf<
		V<"SELECT * FROM t TABLESAMPLE bernoulli (1) REPEATABLE 1">
	>().toEqualTypeOf<SqlError<'syntax error: expected "(" at or near 1', 10>>();
	expectTypeOf<
		V<"SELECT * FROM t TABLESAMPLE bernoulli (1) REPEATABLE (1">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 12>
	>();
	expectTypeOf<
		V<"SELECT * FROM t TABLESAMPLE bernoulli (1) REPEATABLE (1 +)">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 13>>();
});

test("ROWS FROM errors", () => {
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM generate_series(1, 2)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near generate_series', 5>
	>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2)) AS">
	>().toEqualTypeOf<SqlError<"syntax error at or near end of input", 14>>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near end of input', 12>
	>();
	expectTypeOf<V<"SELECT * FROM ROWS FROM (generate_series)">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near )', 7>
	>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2) g)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near g', 12>
	>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2) AS (a))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near )", 15>
	>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2 +))">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 12>>();
	expectTypeOf<V<"SELECT * FROM ROWS FROM (1)">>().toEqualTypeOf<
		SqlError<"syntax error: expected function call at or near 1", 6>
	>();
	expectTypeOf<
		V<"SELECT * FROM ROWS FROM (generate_series(1, 2) AS x)">
	>().toEqualTypeOf<SqlError<'syntax error: expected "(" at or near x', 13>>();
});
