import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { BigIn, Interval, Params, Row, V } from "./_schema.js";

// The special-syntax expressions of PostgreSQL 18's grammar (gram.y): typed literals, COLLATION
// FOR, NORMALIZE, special value functions, calls with their suffixes (WITHIN GROUP, FILTER,
// OVER), CASE, CAST, EXISTS, ARRAY, ROW, EXTRACT, POSITION, SUBSTRING, TRIM, OVERLAY and ORDER
// BY items. Each syntax error is asserted with the token it is reported at.

test("typed literals with keyword type names that take modifiers", () => {
	expectTypeOf<
		Row<"SELECT dec(5, 2) '1.5' AS a, decimal(5) '1' AS b, national character '1' AS c, national char varying(3) 'x' AS d, varchar(3) 'x' AS e">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
	}>();
	// without a string after it the keyword is a column name
	expectTypeOf<
		Row<"SELECT national FROM (SELECT 1 AS national) s">
	>().toEqualTypeOf<{ national: number }>();
	expectTypeOf<
		Row<"SELECT double FROM (SELECT 1 AS double) s">
	>().toEqualTypeOf<{ double: number }>();
	// only an interval literal takes fields after the string
	expectTypeOf<V<"SELECT timestamp '2001-01-01' day">>().toEqualTypeOf<
		SqlError<"syntax error at or near day", 3>
	>();
	// a ConstTypename has no array bounds: `numeric[…]` subscripts a column
	expectTypeOf<V<"SELECT numeric[] '{1}'">>().toEqualTypeOf<
		SqlError<"syntax error at or near ]", 3>
	>();
	expectTypeOf<V<"SELECT timestamp[] '{}'">>().toEqualTypeOf<
		SqlError<"syntax error at or near ]", 3>
	>();
});

test("interval literals take the fields of opt_interval after the string", () => {
	expectTypeOf<
		Row<"SELECT interval '1' year AS a, interval '1' month AS b, interval '1' day AS c, interval '1' hour AS d, interval '1' minute AS e, interval '1' second AS f, interval '1' second(3) AS g">
	>().toEqualTypeOf<{
		a: Interval;
		b: Interval;
		c: Interval;
		d: Interval;
		e: Interval;
		f: Interval;
		g: Interval;
	}>();
	expectTypeOf<
		Row<"SELECT interval '1' year to month AS a, interval '1' day to hour AS b, interval '1' day to minute AS c, interval '1' day to second(2) AS d, interval '1' hour to minute AS e, interval '1' hour to second AS f, interval '1' minute to second(1) AS g">
	>().toEqualTypeOf<{
		a: Interval;
		b: Interval;
		c: Interval;
		d: Interval;
		e: Interval;
		f: Interval;
		g: Interval;
	}>();
	// a word that is no field is the column label
	expectTypeOf<
		Row<"SELECT interval '1' x, interval '1' day y, interval(2) '1' z">
	>().toEqualTypeOf<{ x: Interval; y: Interval; z: Interval }>();
	expectTypeOf<V<"SELECT interval '1' year to day">>().toEqualTypeOf<
		SqlError<"syntax error at or near day", 5>
	>();
	expectTypeOf<V<"SELECT interval '1' month to day">>().toEqualTypeOf<
		SqlError<"syntax error at or near to", 4>
	>();
	expectTypeOf<V<"SELECT interval '1' second to minute">>().toEqualTypeOf<
		SqlError<"syntax error at or near to", 4>
	>();
	expectTypeOf<V<"SELECT interval '1' day to hour(2)">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 6>
	>();
	// a cast to interval takes the same fields, or a precision and no fields
	expectTypeOf<
		Row<"SELECT CAST('1' AS interval day to minute) AS a, '1'::interval(3) AS b, '1'::interval second(3) AS c">
	>().toEqualTypeOf<{ a: Interval; b: Interval; c: Interval }>();
	expectTypeOf<V<"SELECT '1'::interval year to day">>().toEqualTypeOf<
		SqlError<"syntax error at or near day", 6>
	>();
	expectTypeOf<V<"SELECT '1'::interval day (3)">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 5>
	>();
	expectTypeOf<V<"SELECT '1'::interval(3) day">>().toEqualTypeOf<
		SqlError<"syntax error at or near day", 7>
	>();
	// a parenthesis after an operand is no operator: the type's modifier list is not closed
	expectTypeOf<V<"SELECT '1'::numeric(5">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 6>
	>();
	expectTypeOf<V<"SELECT 1 (5">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 2>
	>();
	expectTypeOf<V<"SELECT interval '1' second(x)">>().toEqualTypeOf<
		SqlError<"syntax error at or near x", 5>
	>();
	expectTypeOf<V<"SELECT interval '1' second(1">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 6>
	>();
	// the fields come after the string, and not after a precision
	expectTypeOf<V<"SELECT interval day '1'">>().toEqualTypeOf<
		SqlError<"syntax error at or near day", 2>
	>();
	expectTypeOf<V<"SELECT interval(2) '1' day">>().toEqualTypeOf<
		SqlError<"syntax error at or near day", 6>
	>();
});

test("COLLATION FOR (e)", () => {
	expectTypeOf<
		Row<"SELECT collation for (label) AS a FROM things">
	>().toEqualTypeOf<{ a: string }>();
	expectTypeOf<V<"SELECT collation for label FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near label', 3>
	>();
	expectTypeOf<V<"SELECT collation for (label FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 5>
	>();
	expectTypeOf<V<"SELECT collation for (1 +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
});

test("NORMALIZE(e [, form])", () => {
	expectTypeOf<
		Row<"SELECT normalize(label) AS a, normalize(label, nfc) AS b, normalize(label, nfd) AS c, normalize(label, nfkc) AS d, normalize(label, nfkd) AS e FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
	}>();
	expectTypeOf<V<"SELECT normalize(label, foo) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error: expected NFC, NFD, NFKC or NFKD at or near foo", 5>
	>();
	expectTypeOf<V<"SELECT normalize(label, nfc x) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near x', 6>
	>();
	expectTypeOf<V<"SELECT normalize(label x) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near x', 4>
	>();
	expectTypeOf<V<"SELECT normalize(label, nfc FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 6>
	>();
	expectTypeOf<V<"SELECT normalize(1 +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
});

test("special value functions with a precision", () => {
	expectTypeOf<
		Row<"SELECT current_time(3) AS a, localtimestamp(2) AS b, (current_date - 1) AS c">
	>().toEqualTypeOf<{ a: string; b: Date; c: Date }>();
	expectTypeOf<V<"SELECT current_time(3">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 4>
	>();
});

test("prefix operators bind as Postgres binds them", () => {
	// NOT binds looser than comparisons
	expectTypeOf<Row<"SELECT NOT 1 = 2 AS a">>().toEqualTypeOf<{
		a: boolean;
	}>();
	// unary minus and plus bind tighter than the binary operators: (-1) + date
	expectTypeOf<
		Row<"SELECT - 1 + date '2001-01-01' AS a, + 1 + date '2001-01-01' AS b">
	>().toEqualTypeOf<{ a: Date; b: Date }>();
	// other prefix operators bind looser than + - * / % ^ (`|/ ($1 + 2::int8)`), and tighter than `::`
	expectTypeOf<Params<"SELECT |/ $1 + 2::int8 AS a">>().toEqualTypeOf<
		[BigIn]
	>();
	expectTypeOf<Row<"SELECT |/ '4'::int8 AS a">>().toEqualTypeOf<{
		a: number;
	}>();
});

test("parenthesized expressions, rows and field selections", () => {
	expectTypeOf<V<"SELECT (1, 2">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 5>
	>();
	expectTypeOf<V<"SELECT (SELECT +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
	expectTypeOf<V<"SELECT (ROW(1, 2)).(">>().toEqualTypeOf<
		SqlError<"syntax error: expected field name at or near (", 10>
	>();
});

test("qualified names", () => {
	expectTypeOf<Row<"SELECT public.users.id AS a FROM users">>().toEqualTypeOf<{
		a: number;
	}>();
	// a schema named like a JSON function keyword: a plain call
	expectTypeOf<V<"SELECT json_object.x()">>().toEqualTypeOf<
		SqlError<
			"function x() does not exist. Declare it in the schema's $functions or in FunctionCatalog",
			3
		>
	>();
});

test("call arguments", () => {
	expectTypeOf<
		Row<'SELECT make_interval(days => 1) AS a, make_interval("days" => 2) AS b'>
	>().toEqualTypeOf<{ a: Interval; b: Interval }>();
	expectTypeOf<V<"SELECT lower(label FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 4>
	>();
	expectTypeOf<
		V<"SELECT string_agg(label, ',' ORDER BY ) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 8>>();
	expectTypeOf<
		V<"SELECT array_agg(label ORDER BY +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 7>>();
	expectTypeOf<V<"SELECT concat(VARIADIC +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<V<"SELECT make_interval(days => +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	// a syntax error in a positional argument after a named one is reported as such
	expectTypeOf<V<"SELECT make_interval(days => 1, +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 8>
	>();
});

test("WITHIN GROUP and FILTER", () => {
	expectTypeOf<
		V<"SELECT mode() WITHIN GROUP ORDER BY id FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near order', 6>
	>();
	expectTypeOf<
		V<"SELECT mode() WITHIN GROUP (id) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ORDER BY at or near id", 7>
	>();
	expectTypeOf<
		V<"SELECT mode() WITHIN GROUP (ORDER BY id FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 10>
	>();
	expectTypeOf<
		V<"SELECT mode() WITHIN GROUP (ORDER BY +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 10>>();
	expectTypeOf<
		V<"SELECT count(*) FILTER WHERE id > 1 FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near where', 6>
	>();
	expectTypeOf<
		V<"SELECT count(*) FILTER (id > 1) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected WHERE at or near id", 7>
	>();
	expectTypeOf<
		V<"SELECT count(*) FILTER (WHERE id > 1 FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 11>
	>();
	expectTypeOf<
		V<"SELECT count(*) FILTER (WHERE +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 9>>();
});

test("OVER: window specifications", () => {
	expectTypeOf<
		Row<"SELECT count(*) OVER (PARTITION BY id) AS a, count(*) OVER (ORDER BY id) AS b FROM things">
	>().toEqualTypeOf<{ a: string; b: string }>();
	// an existing window to build on
	expectTypeOf<
		Row<'SELECT count(*) OVER (w ORDER BY id) AS a, count(*) OVER ("v" ORDER BY id) AS b FROM things WINDOW w AS (PARTITION BY id), "v" AS (PARTITION BY id)'>
	>().toEqualTypeOf<{ a: string; b: string }>();
	expectTypeOf<V<"SELECT count(*) OVER (w) FROM things">>().toEqualTypeOf<
		SqlError<'window "w" does not exist', 7>
	>();
	expectTypeOf<V<"SELECT count(*) OVER 1 FROM things">>().toEqualTypeOf<
		SqlError<"syntax error: expected window specification at or near 1", 6>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ORDER BY +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 10>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (PARTITION BY +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 10>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ORDER BY id FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 10>
	>();
});

test("OVER: frames", () => {
	expectTypeOf<
		Row<"SELECT count(*) OVER (ROWS UNBOUNDED PRECEDING) AS a, count(*) OVER (RANGE UNBOUNDED PRECEDING) AS b, count(*) OVER (ORDER BY id GROUPS CURRENT ROW) AS c, count(*) OVER (ROWS 1 PRECEDING) AS d FROM things">
	>().toEqualTypeOf<{ a: string; b: string; c: string; d: string }>();
	expectTypeOf<
		Row<"SELECT count(*) OVER (ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS a, count(*) OVER (ROWS BETWEEN 1 FOLLOWING AND 2 FOLLOWING) AS b, count(*) OVER (ROWS BETWEEN 2 PRECEDING AND 1 PRECEDING) AS c, count(*) OVER (ROWS BETWEEN CURRENT ROW AND CURRENT ROW) AS d, count(*) OVER (ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING) AS e FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
	}>();
	// the bounds Postgres's grammar rejects
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS UNBOUNDED FOLLOWING) FROM things">
	>().toEqualTypeOf<SqlError<"frame start cannot be UNBOUNDED FOLLOWING", 7>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS 1 FOLLOWING) FROM things">
	>().toEqualTypeOf<
		SqlError<"frame starting from following row cannot end with current row", 7>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN UNBOUNDED FOLLOWING AND UNBOUNDED FOLLOWING) FROM things">
	>().toEqualTypeOf<SqlError<"frame start cannot be UNBOUNDED FOLLOWING", 7>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN CURRENT ROW AND UNBOUNDED PRECEDING) FROM things">
	>().toEqualTypeOf<SqlError<"frame end cannot be UNBOUNDED PRECEDING", 7>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED PRECEDING) FROM things">
	>().toEqualTypeOf<SqlError<"frame end cannot be UNBOUNDED PRECEDING", 7>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN CURRENT ROW AND 1 PRECEDING) FROM things">
	>().toEqualTypeOf<
		SqlError<"frame starting from current row cannot have preceding rows", 7>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN 1 FOLLOWING AND 1 PRECEDING) FROM things">
	>().toEqualTypeOf<
		SqlError<"frame starting from following row cannot have preceding rows", 7>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN 1 FOLLOWING AND CURRENT ROW) FROM things">
	>().toEqualTypeOf<
		SqlError<"frame starting from following row cannot have preceding rows", 7>
	>();
	// GROUPS, and RANGE with an offset, need an ORDER BY (a named window may bring it)
	expectTypeOf<
		Row<"SELECT count(*) OVER (RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS a, count(*) OVER (ORDER BY id RANGE BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS b, count(*) OVER (w GROUPS CURRENT ROW) AS c, count(*) OVER (w RANGE 1 PRECEDING) AS d FROM things WINDOW w AS (ORDER BY id)">
	>().toEqualTypeOf<{ a: string; b: string; c: string; d: string }>();
	expectTypeOf<
		V<"SELECT count(*) OVER (GROUPS CURRENT ROW) FROM things">
	>().toEqualTypeOf<SqlError<"GROUPS mode requires an ORDER BY clause", 7>>();
	expectTypeOf<
		V<"SELECT 1 FROM things WINDOW w AS (GROUPS CURRENT ROW)">
	>().toEqualTypeOf<SqlError<"GROUPS mode requires an ORDER BY clause", 8>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (RANGE 1 PRECEDING) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"RANGE with offset PRECEDING/FOLLOWING requires exactly one ORDER BY column",
			7
		>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (PARTITION BY id RANGE BETWEEN CURRENT ROW AND 1 FOLLOWING) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"RANGE with offset PRECEDING/FOLLOWING requires exactly one ORDER BY column",
			10
		>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS 1 x) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected PRECEDING or FOLLOWING at or near x", 9>
	>();
	expectTypeOf<
		Row<"SELECT count(*) OVER (ORDER BY id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING EXCLUDE CURRENT ROW) AS a, count(*) OVER (ORDER BY id RANGE BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING EXCLUDE GROUP) AS b, count(*) OVER (ORDER BY id GROUPS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW EXCLUDE TIES) AS c, count(*) OVER (ORDER BY id ROWS 2 PRECEDING EXCLUDE NO OTHERS) AS d FROM things">
	>().toEqualTypeOf<{ a: string; b: string; c: string; d: string }>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS foo) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected PRECEDING or FOLLOWING at or near )", 9>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS , PRECEDING) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 8>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN UNBOUNDED PRECEDING CURRENT ROW) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected AND at or near current", 11>
	>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 13>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS BETWEEN + AND CURRENT ROW) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near and", 10>>();
	expectTypeOf<
		V<"SELECT count(*) OVER (ROWS CURRENT ROW EXCLUDE foo) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"syntax error: expected CURRENT ROW, GROUP, TIES or NO OTHERS at or near foo",
			11
		>
	>();
});

test("CASE", () => {
	expectTypeOf<
		Row<"SELECT CASE id WHEN 1 THEN 'a' END AS a, CASE WHEN true THEN 1 ELSE 2 END AS b FROM things">
	>().toEqualTypeOf<{ a: string | null; b: number }>();
	expectTypeOf<V<"SELECT CASE + WHEN 1 THEN 2 END">>().toEqualTypeOf<
		SqlError<"syntax error at or near when", 3>
	>();
	expectTypeOf<
		V<"SELECT CASE WHEN true THEN 1 ELSE 2 FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected END at or near from", 8>
	>();
	expectTypeOf<V<"SELECT CASE WHEN true THEN 1 ELSE + END">>().toEqualTypeOf<
		SqlError<"syntax error at or near end", 8>
	>();
	expectTypeOf<V<"SELECT CASE WHEN true 1 END">>().toEqualTypeOf<
		SqlError<"syntax error: expected THEN at or near 1", 4>
	>();
	expectTypeOf<V<"SELECT CASE WHEN + THEN 1 END">>().toEqualTypeOf<
		SqlError<"syntax error at or near then", 4>
	>();
	expectTypeOf<V<"SELECT CASE WHEN true THEN + END">>().toEqualTypeOf<
		SqlError<"syntax error at or near end", 6>
	>();
	expectTypeOf<V<"SELECT CASE WHEN true THEN 1 FROM things">>().toEqualTypeOf<
		SqlError<"syntax error: expected WHEN, ELSE or END at or near from", 6>
	>();
});

test("CAST and EXISTS", () => {
	expectTypeOf<
		Row<"SELECT CAST(id AS text) AS a FROM things">
	>().toEqualTypeOf<{
		a: string;
	}>();
	expectTypeOf<V<"SELECT CAST 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near 1', 2>
	>();
	expectTypeOf<V<"SELECT CAST(1 int4)">>().toEqualTypeOf<
		SqlError<"syntax error: expected AS at or near int4", 4>
	>();
	expectTypeOf<V<"SELECT CAST(1 AS int4 FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 6>
	>();
	expectTypeOf<V<"SELECT CAST(+ AS int4)">>().toEqualTypeOf<
		SqlError<"syntax error at or near as", 4>
	>();
	expectTypeOf<V<"SELECT CAST(1 AS +)">>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near +", 5>
	>();
	expectTypeOf<
		Row<"SELECT EXISTS (SELECT 1 FROM things) AS a">
	>().toEqualTypeOf<{
		a: boolean;
	}>();
	expectTypeOf<V<"SELECT EXISTS (SELECT 1 FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 7>
	>();
	expectTypeOf<V<"SELECT EXISTS (SELECT +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
});

test("ARRAY and ROW constructors", () => {
	expectTypeOf<
		Row<"SELECT ARRAY[]::int4[] AS a, ARRAY[1, 2] AS b, ARRAY(SELECT 1) AS c">
	>().toEqualTypeOf<{ a: number[]; b: number[]; c: number[] }>();
	expectTypeOf<V<"SELECT ARRAY 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected "[" or "(" at or near 1', 2>
	>();
	expectTypeOf<V<"SELECT ARRAY(SELECT 1 FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 7>
	>();
	expectTypeOf<V<"SELECT ARRAY(SELECT +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<V<"SELECT ARRAY[1, 2 FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected "]" at or near from', 6>
	>();
	expectTypeOf<V<"SELECT ARRAY[+]">>().toEqualTypeOf<
		SqlError<"syntax error at or near ]", 4>
	>();
	expectTypeOf<
		Row<"SELECT ROW() IS NOT NULL AS a, ROW(1, 2) IS NULL AS b">
	>().toEqualTypeOf<{ a: boolean; b: boolean }>();
	expectTypeOf<V<"SELECT ROW(1, 2 FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 6>
	>();
	expectTypeOf<V<"SELECT ROW(+)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
});

test("EXTRACT and POSITION", () => {
	expectTypeOf<
		Row<"SELECT EXTRACT(year FROM at) AS a, EXTRACT('year' FROM at) AS b, position('a' IN label) AS c FROM things">
	>().toEqualTypeOf<{ a: string; b: string; c: number }>();
	expectTypeOf<V<"SELECT EXTRACT(year label) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error: expected FROM at or near label", 4>
	>();
	expectTypeOf<V<"SELECT EXTRACT(year FROM at FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 6>
	>();
	expectTypeOf<V<"SELECT EXTRACT(year FROM +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	expectTypeOf<V<"SELECT EXTRACT(1 FROM at) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error: expected field FROM expression at or near 1", 3>
	>();
	expectTypeOf<V<"SELECT POSITION('a' label) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error: expected IN at or near label", 4>
	>();
	expectTypeOf<V<"SELECT POSITION('a' IN label FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 6>
	>();
	expectTypeOf<V<"SELECT POSITION(+ IN label) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near in", 4>
	>();
	expectTypeOf<
		V<"SELECT position(nosuch IN label) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 3>>();
	expectTypeOf<V<"SELECT POSITION('a' IN +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
});

test("SUBSTRING", () => {
	expectTypeOf<
		Row<"SELECT substring(label FROM 1 FOR 2) AS a, substring(label FOR 2) AS b, substring(label FOR 2 FROM 1) AS c, substring(label FROM 2) AS d, substring(label, 1) AS e, substring(label, 1, 2) AS f FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
		f: string;
	}>();
	// the text pattern forms are NULL when the pattern does not match
	expectTypeOf<
		Row<"SELECT substring(label SIMILAR 'a' ESCAPE '#') AS a, substring(label, 'a') AS b FROM things">
	>().toEqualTypeOf<{ a: string | null; b: string | null }>();
	// `FOR n` alone is `FROM 1 FOR n`: an integer
	expectTypeOf<Params<"SELECT substring($1 FOR $2) AS a">>().toEqualTypeOf<
		[string | null, number | null]
	>();
	expectTypeOf<Params<"SELECT substring($1 FROM $2) AS a">>().toEqualTypeOf<
		[string | null, string | null]
	>();
	expectTypeOf<Params<"SELECT substring($1, $2, $3) AS a">>().toEqualTypeOf<
		[string | null, string | null, string | null]
	>();
	expectTypeOf<
		V<"SELECT substring(label FROM 1 FROM 2) FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 6>
	>();
	expectTypeOf<
		V<"SELECT substring(label FROM 1 SIMILAR 'a' ESCAPE '#') FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near similar', 6>
	>();
	expectTypeOf<
		V<"SELECT substring(label FOR 2 FROM 1 FOR 3) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near for', 8>>();
	expectTypeOf<
		V<"SELECT substring(label SIMILAR 'a') FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ESCAPE at or near )", 6>
	>();
	expectTypeOf<
		V<"SELECT substring(label SIMILAR 'a' ESCAPE '#' FOR 1) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near for', 8>>();
	expectTypeOf<V<"SELECT substring(label, 1 FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 6>
	>();
	expectTypeOf<V<"SELECT substring(label, +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	expectTypeOf<V<"SELECT substring(+) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
	expectTypeOf<V<"SELECT substring(label x) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near x', 4>
	>();
	expectTypeOf<V<"SELECT substring(label FROM +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	expectTypeOf<V<"SELECT substring(label FOR +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	expectTypeOf<
		V<"SELECT substring(label FROM 1 FOR +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 8>>();
	expectTypeOf<
		V<"SELECT substring(label SIMILAR + ESCAPE '#') FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ESCAPE at or near )", 8>
	>();
	expectTypeOf<
		V<"SELECT substring(label SIMILAR 'a' ESCAPE +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 8>>();
});

test("TRIM", () => {
	expectTypeOf<
		Row<"SELECT trim(label) AS a, trim(both 'x' FROM label) AS b, trim(leading FROM label) AS c, trim(trailing 'x' FROM label) AS d, trim(label, 'x') AS e FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
	}>();
	expectTypeOf<Params<"SELECT trim($1, $2) AS a">>().toEqualTypeOf<
		[string | null, string | null]
	>();
	expectTypeOf<Params<"SELECT trim(leading $1 FROM $2) AS a">>().toEqualTypeOf<
		[string | null, string | null]
	>();
	expectTypeOf<V<"SELECT trim(label x) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near x', 4>
	>();
	expectTypeOf<V<"SELECT trim(label, 'x' y) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near y', 6>
	>();
	expectTypeOf<V<"SELECT trim(label, +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	expectTypeOf<V<"SELECT trim('x' FROM label y) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near y', 6>
	>();
	expectTypeOf<V<"SELECT trim('x' FROM +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	expectTypeOf<V<"SELECT trim(FROM label y) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near y', 5>
	>();
	expectTypeOf<V<"SELECT trim(FROM +) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<V<"SELECT trim(+) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
});

test("OVERLAY is strict over all its operands", () => {
	expectTypeOf<
		Row<"SELECT overlay(email PLACING 'x' FROM 1) AS a, overlay(email PLACING 'x' FROM 1 FOR 2) AS b, overlay(email PLACING display_name FROM 1) AS c, overlay(email PLACING 'x' FROM 1 FOR null) AS d, overlay(display_name PLACING 'x' FROM 1) AS e FROM users">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string | null;
		d: string | null;
		e: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT overlay(label PLACING 'x' FROM n_id) AS a, overlay(bin PLACING '\\x00'::bytea FROM 1) AS b FROM things">
	>().toEqualTypeOf<{ a: string | null; b: Uint8Array }>();
	expectTypeOf<
		Params<"SELECT overlay($1 PLACING $2 FROM $3 FOR $4) AS a">
	>().toEqualTypeOf<
		[string | null, string | null, number | null, number | null]
	>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING nosuch FROM 1) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 5>>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING 'x' FROM 1 FOR nosuch) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 9>>();
	expectTypeOf<
		V<"SELECT overlay(label 'x' FROM 1) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected PLACING at or near from", 5>
	>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING 'x' 1) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error: expected FROM at or near 1", 6>>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING 'x' FROM 1 x) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near x', 8>>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING 'x' FROM 1 FOR 2 x) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near x', 10>>();
	expectTypeOf<V<"SELECT overlay(+) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 6>>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING 'x' FROM +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 8>>();
	expectTypeOf<
		V<"SELECT overlay(label PLACING 'x' FROM 1 FOR +) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 10>>();
});

test("ORDER BY items: USING and NULLS", () => {
	expectTypeOf<
		Row<"SELECT id FROM things ORDER BY id USING >, label DESC NULLS LAST, big USING < NULLS FIRST">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT array_agg(id ORDER BY id USING >) AS a FROM things">
	>().toEqualTypeOf<{ a: number[] | null }>();
	expectTypeOf<
		V<"SELECT id FROM things ORDER BY id USING foo">
	>().toEqualTypeOf<SqlError<"syntax error at or near using", 7>>();
});

test("EXTRACT is NULL for an infinite value in the fields that do not grow with time", () => {
	// ±Infinity for an infinite timestamp, timestamptz or date
	expectTypeOf<
		Row<"SELECT EXTRACT(year FROM at) AS a, EXTRACT(decade FROM ts) AS b, EXTRACT(century FROM day) AS c, EXTRACT(millennium FROM at) AS d, EXTRACT(julian FROM ts) AS e, EXTRACT(isoyear FROM day) AS f, EXTRACT(epoch FROM at) AS g, EXTRACT('YEAR' FROM at) AS h FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
		f: string;
		g: string;
		h: string;
	}>();
	expectTypeOf<
		Row<"SELECT EXTRACT(day FROM at) AS a, EXTRACT(month FROM ts) AS b, EXTRACT(dow FROM day) AS c, EXTRACT('Day' FROM at) AS d, EXTRACT(year FROM n_at) AS e FROM things">
	>().toEqualTypeOf<{
		a: string | null;
		b: string | null;
		c: string | null;
		d: string | null;
		e: string | null;
	}>();
	// an infinite interval is ±Infinity in hours and days too
	expectTypeOf<
		Row<"SELECT EXTRACT(year FROM dur) AS a, EXTRACT(decade FROM dur) AS b, EXTRACT(century FROM dur) AS c, EXTRACT(millennium FROM dur) AS d, EXTRACT(epoch FROM dur) AS e, EXTRACT(day FROM dur) AS f, EXTRACT(hour FROM dur) AS g, EXTRACT(minute FROM dur) AS h, EXTRACT(month FROM dur) AS i FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
		f: string;
		g: string;
		h: string | null;
		i: string | null;
	}>();
	// a time is never infinite
	expectTypeOf<
		Row<"SELECT EXTRACT(hour FROM clock) AS a, EXTRACT(minute FROM clock) AS b FROM things">
	>().toEqualTypeOf<{ a: string; b: string }>();
	expectTypeOf<
		Row<"SELECT coalesce(EXTRACT(day FROM at), 0) AS a, coalesce(EXTRACT(minute FROM dur), 0) AS b FROM things">
	>().toEqualTypeOf<{ a: string; b: string }>();
});
