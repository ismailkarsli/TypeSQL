import { expectTypeOf, test } from "vitest";
import type { ApplyDdl, SqlError } from "../../src/index.js";
import type { DB, Interval, Params, Row, V } from "./_schema.js";

// Special expression syntax of PostgreSQL 18 (gram.y), with the types and output column names
// (`FigureColnameInternal`) Postgres gives it.

test("a cast to SETOF T is a cast to T", () => {
	expectTypeOf<
		Row<"SELECT 1::setof int8 AS a, CAST('x' AS setof text) AS b">
	>().toEqualTypeOf<{ a: string; b: string }>();
});

test("typed literals with a qualified type name", () => {
	// the schema is dropped, as in casts
	expectTypeOf<Row<"SELECT pg_catalog.int4 '1' AS a">>().toEqualTypeOf<{
		a: number;
	}>();
	// Postgres: cross-database references are not implemented: a.b.c
	expectTypeOf<V<"SELECT a.b.c 'x'">>().toEqualTypeOf<
		SqlError<"syntax error at or near 'x'", 6>
	>();
	expectTypeOf<V<"SELECT things.(1) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 3>
	>();
});

test("special value functions take no arguments, or only a precision", () => {
	expectTypeOf<V<"SELECT current_user(1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 2>
	>();
	expectTypeOf<V<"SELECT current_date()">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 2>
	>();
	expectTypeOf<V<"SELECT localtime('a')">>().toEqualTypeOf<
		SqlError<"syntax error at or near 'a'", 3>
	>();
	expectTypeOf<V<"SELECT current_time()">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 3>
	>();
	expectTypeOf<V<"SELECT current_timestamp(1, 2)">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 4>
	>();
});

test("typed literals with keyword type names", () => {
	expectTypeOf<
		Row<"SELECT timestamp with time zone '2001-12-27 04:05:06+08' AS a, timestamp without time zone 'today' AS b, timestamp(2) without time zone 'now' AS c, time with time zone '04:05+08' AS d, time(3) without time zone '04:05' AS e">
	>().toEqualTypeOf<{ a: Date; b: Date; c: Date; d: string; e: string }>();
	expectTypeOf<
		Row<"SELECT char(20) 'x' AS a, character varying(5) 'x' AS b, national character varying(5) 'x' AS c, interval(2) '1 day 01:23:45.6789' AS d, double precision '1.5' AS e, bit varying '101' AS f, numeric(10, 2) '1.5' AS g, float(24) '1' AS h">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: Interval;
		e: number;
		f: string;
		g: string;
		h: number;
	}>();
	// named after the type (a cast of a constant)
	expectTypeOf<
		Row<"SELECT timestamp with time zone 'now', time without time zone '04:05', char(20) 'x', double precision '1', bit varying '1', interval(0) '1 day'">
	>().toEqualTypeOf<{
		timestamptz: Date;
		time: string;
		bpchar: string;
		float8: number;
		varbit: string;
		interval: Interval;
	}>();
	expectTypeOf<
		Row<"SELECT char(20) 'characters' || ' and text' AS a, date '2001-02-03' + time with time zone '04:05:06 UTC' AS b">
	>().toEqualTypeOf<{ a: string; b: Date }>();
	// without a string the word is still a column or function name
	expectTypeOf<
		Row<"SELECT time FROM (SELECT clock AS time FROM things) t">
	>().toEqualTypeOf<{ time: string }>();
});

test("named arguments match any parameter; VARIADIC passes an array", () => {
	expectTypeOf<
		Row<"SELECT make_interval(years := 1, months := 2) AS a, jsonb_path_exists(data, '$.a', silent => true) AS b, parse_ident('a.b', strict => false) AS c, random_normal(mean => 1, stddev => 0.1) AS d, make_interval(days => n_id) AS e FROM things">
	>().toEqualTypeOf<{
		a: Interval;
		b: boolean;
		c: string[];
		d: number;
		e: Interval | null;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM jsonb_path_query('[1, 2]', '$[*]', silent => true) AS v">
	>().toEqualTypeOf<{ v: unknown }>();
	// a named argument keeps its type, which picks the overload
	expectTypeOf<
		Row<"SELECT random(min => 1.5, max => 2.5) AS a, random(min => big, max => big) AS b, random(min => 1, max => 2) AS c FROM things">
	>().toEqualTypeOf<{ a: string; b: string; c: number }>();
	expectTypeOf<Params<"SELECT make_interval(days => $1)">>().toEqualTypeOf<
		[unknown]
	>();
	expectTypeOf<
		V<"SELECT parse_ident('a', strict => true, 'x')">
	>().toEqualTypeOf<
		SqlError<"positional argument cannot follow named argument", 9>
	>();
	expectTypeOf<V<"SELECT make_interval(days => 1, days := 2)">>().toEqualTypeOf<
		SqlError<'argument name "days" used more than once', 7>
	>();
	// an argument name is a function or type name; Postgres fails at the `=>` after anything else,
	// and at a reserved word itself
	expectTypeOf<V<"SELECT concat(1 => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near =>", 4>
	>();
	expectTypeOf<V<"SELECT concat(select => 1)">>().toEqualTypeOf<
		SqlError<"syntax error at or near select", 3>
	>();

	expectTypeOf<
		Row<"SELECT concat_ws(',', VARIADIC nums) AS a, format('%s, %s', VARIADIC words) AS b, concat(VARIADIC n_nums) AS c, concat_ws(',', VARIADIC n_nums) AS d, format('x', VARIADIC n_nums) AS e FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string | null;
		d: string | null;
		e: string;
	}>();
});

test("WITHIN GROUP with several sort keys", () => {
	expectTypeOf<
		Row<"SELECT rank(3, 'x') WITHIN GROUP (ORDER BY id, label) AS r, mode() WITHIN GROUP (ORDER BY label DESC, id) AS m FROM things">
	>().toEqualTypeOf<{ r: string; m: string | null }>();
});

test("quantified predicates with any operator", () => {
	expectTypeOf<
		Row<"SELECT label LIKE ANY (words) AS a, label NOT ILIKE ALL (ARRAY['%a', '%b']) AS b, label ~ ANY (words) AS c, tsv @@ ANY ('{a,b}') AS d, id = ANY ((SELECT array_agg(id) FROM things)::int4[]) AS e, n_text LIKE ANY (words) AS f FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean | null;
		f: boolean | null;
	}>();
	expectTypeOf<
		Params<"SELECT 1 FROM things WHERE label LIKE ANY ($1)">
	>().toEqualTypeOf<[(string | null)[] | null]>();
	expectTypeOf<V<"SELECT 33 * ANY ('{1,2,3}')">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
	expectTypeOf<V<"SELECT 33 = ANY (44)">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 + ANY 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near 2", 4>
	>();
	expectTypeOf<V<"SELECT 1 = ANY 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near 2", 4>
	>();
	expectTypeOf<V<"SELECT 'a' LIKE ANY 'a'">>().toEqualTypeOf<
		SqlError<"syntax error at or near 'a'", 4>
	>();
	expectTypeOf<V<"SELECT 'a' SIMILAR TO ANY (ARRAY['a'])">>().toEqualTypeOf<
		SqlError<"syntax error at or near any", 4>
	>();
});

test("comparisons with a subquery compare the operands pairwise, with any operator", () => {
	expectTypeOf<
		Row<"SELECT ROW(ARRAY[1]) && (SELECT ARRAY[1]) AS a, 'a' ~~ ANY (SELECT 'b') AS b, (1, 2) < (SELECT 1, 2) AS c, (1, 2) = (SELECT * FROM (SELECT 1 AS a, 2 AS b) s) AS d, 1 = ANY (SELECT * FROM (SELECT 1 AS a) s) AS e, n_id = ALL (SELECT 1) AS f, (id, 2) <> ANY (SELECT 1, 2) AS g FROM things">
	>().toEqualTypeOf<{
		a: boolean | null;
		b: boolean;
		c: boolean | null;
		d: boolean | null;
		e: boolean;
		f: boolean | null;
		g: boolean;
	}>();
	// an operator whose result the types do not tell is taken to yield boolean
	expectTypeOf<
		Row<"SELECT 'abc' ^@ ANY (SELECT 'a'::text) AS a">
	>().toEqualTypeOf<{ a: boolean }>();
	// each pair's operator must yield boolean
	expectTypeOf<V<"SELECT 1 + ANY (SELECT 1)">>().toEqualTypeOf<
		SqlError<
			"row comparison operator must yield type boolean, not type integer",
			0
		>
	>();
	expectTypeOf<V<"SELECT 'a' || ALL (SELECT 'b'::text)">>().toEqualTypeOf<
		SqlError<
			"row comparison operator must yield type boolean, not type text",
			0
		>
	>();
	expectTypeOf<V<"SELECT 1 - ALL (SELECT 1.5)">>().toEqualTypeOf<
		SqlError<
			"row comparison operator must yield type boolean, not type numeric",
			0
		>
	>();
	expectTypeOf<V<"SELECT (1, 2) + (SELECT 1, 2)">>().toEqualTypeOf<
		SqlError<
			"row comparison operator must yield type boolean, not type integer",
			0
		>
	>();
	expectTypeOf<V<"SELECT (1, 2) + ANY (SELECT 1, 2)">>().toEqualTypeOf<
		SqlError<
			"row comparison operator must yield type boolean, not type integer",
			0
		>
	>();
	expectTypeOf<V<"SELECT ROW(1) + (SELECT 1)">>().toEqualTypeOf<
		SqlError<
			"row comparison operator must yield type boolean, not type integer",
			0
		>
	>();
	// the second pair
	expectTypeOf<
		V<"SELECT (rng, 1) << (SELECT rng, 2 FROM things) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"row comparison operator must yield type boolean, not type integer",
			0
		>
	>();
	// several columns need a comparison operator
	expectTypeOf<
		V<"SELECT (ARRAY[1], ARRAY[2]) && (SELECT ARRAY[1], ARRAY[2])">
	>().toEqualTypeOf<
		SqlError<
			"could not determine interpretation of row comparison operator &&",
			0
		>
	>();
	// the widths first
	expectTypeOf<V<"SELECT (1, 2) + (SELECT 1)">>().toEqualTypeOf<
		SqlError<"subquery has too few columns", 0>
	>();
	expectTypeOf<
		V<"SELECT (nope, 2) = (SELECT 1, 2) FROM things">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 2>>();
	expectTypeOf<
		V<"SELECT (1, 2) = (SELECT nope, 2) FROM things">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 9>>();
});

test("ANY / ALL of a scalar is an error, for every scalar type", () => {
	expectTypeOf<V<"SELECT 1 = ANY (small) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (id) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (big) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (price) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (score) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (ratio) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (flag) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (label) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (vc) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<
		V<"SELECT 1 = ANY (('x'::char(1))) FROM things">
	>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (day) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (clock) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<
		V<"SELECT 1 = ANY (('1:00'::timetz)) FROM things">
	>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (ts) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (at) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (dur) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (uid) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (bin) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (doc) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (data) FROM things">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires array on right side", 0>
	>();
});

test("ANY / ALL needs an operator that yields boolean", () => {
	expectTypeOf<V<"SELECT 33 + ANY ('{1,2}'::int4[])">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
	expectTypeOf<V<"SELECT 33 - ANY ('{1,2}'::int4[])">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
	expectTypeOf<V<"SELECT 33 * ANY ('{1,2}'::int4[])">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
	expectTypeOf<V<"SELECT 33 / ANY ('{1,2}'::int4[])">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
	expectTypeOf<V<"SELECT 33 % ANY ('{1,2}'::int4[])">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
	expectTypeOf<V<"SELECT 33 ^ ANY ('{1,2}'::int4[])">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
	expectTypeOf<V<"SELECT 'a' || ANY ('{b}'::text[])">>().toEqualTypeOf<
		SqlError<"op ANY/ALL (array) requires operator to yield boolean", 0>
	>();
});

test("an error inside a construct is the construct's error", () => {
	expectTypeOf<V<"SELECT nope BETWEEN 1 AND 2 FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT 1 BETWEEN 1 AND nope FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT 1 BETWEEN nope AND 2 FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 3>
	>();
	expectTypeOf<V<"SELECT nope IN (1) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT 1 IN (1, nope) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 6>
	>();
	expectTypeOf<V<"SELECT ARRAY[1, nope] FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT nums[nope:1] FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 3>
	>();
	expectTypeOf<V<"SELECT nope[1:2] FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT substring(nope FROM 1) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 3>
	>();
	expectTypeOf<
		V<"SELECT substring(label FROM 1 FOR nope) FROM things">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT substring(label FROM nope) FROM things">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 5>>();
	expectTypeOf<V<"SELECT nums[1:(nope)] FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 6>
	>();
	expectTypeOf<V<"SELECT EXISTS (SELECT nope) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 4>
	>();
	expectTypeOf<V<"SELECT ROW(1, nope) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT make_interval(days => nope)">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT nope IS NULL FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT 1 IS DISTINCT FROM nope FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT extract(year FROM nope) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT position('a' IN nope) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	expectTypeOf<V<"SELECT (nope).f FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 2>
	>();
	expectTypeOf<V<"SELECT nope LIKE 'x' FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT nope = ANY (ARRAY[1]) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT -nope FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 2>
	>();
	expectTypeOf<V<"SELECT ~nope FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 2>
	>();
	expectTypeOf<V<"SELECT nope IS DISTINCT FROM 1 FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT 1 = ANY (ARRAY[nope]) FROM things">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 7>
	>();
});

test("NULL, unary plus, json ↔ jsonb casts, SUBSTRING forms", () => {
	expectTypeOf<
		Row<"SELECT coalesce(NULL, n_text) AS a, +2147483648 AS b, jsonb_build_object('a', 1)::json AS c, substring(bin FROM 1) AS d, substring(B'101' FROM 2) AS e, substring(B'101'::varbit FROM 2) AS f, substring(label FROM 'a.') AS g FROM things">
	>().toEqualTypeOf<{
		a: string | null;
		b: string;
		c: { a: number };
		d: Uint8Array;
		e: string;
		f: string;
		g: string | null;
	}>();
});

test("SUBSTRING is NULL when any argument is; ARRAY(SELECT array) stays one level", () => {
	expectTypeOf<
		Row<"SELECT substring(label FROM n_id) AS a, substring(label FROM 1 FOR n_id) AS b, ARRAY(SELECT words FROM things) AS c FROM things">
	>().toEqualTypeOf<{ a: string | null; b: string | null; c: string[] }>();
});

test("COLLATION FOR, OVERLAPS, AT LOCAL, IS NORMALIZED", () => {
	expectTypeOf<
		Row<"SELECT collation for (label), collation for ('foo') AS b FROM things">
	>().toEqualTypeOf<{ pg_collation_for: string; b: string }>();
	expectTypeOf<
		Row<"SELECT (at, at) OVERLAPS (n_at, dur) AS o, (day, day) OVERLAPS ROW(day, day) FROM things">
	>().toEqualTypeOf<{ o: boolean | null; overlaps: boolean }>();
	expectTypeOf<V<"SELECT (1, 2, 3) OVERLAPS (1, 2)">>().toEqualTypeOf<
		SqlError<
			"wrong number of parameters on left side of OVERLAPS expression",
			9
		>
	>();
	expectTypeOf<V<"SELECT (1, 2) OVERLAPS 3">>().toEqualTypeOf<
		SqlError<"syntax error at or near 3", 7>
	>();
	expectTypeOf<
		Row<"SELECT at AT LOCAL AS a, ts AT LOCAL AS b, n_at AT LOCAL, clock AT LOCAL AS c FROM things">
	>().toEqualTypeOf<{ a: Date; b: Date; timezone: Date | null; c: string }>();
	expectTypeOf<
		Row<"SELECT label IS NORMALIZED, n_text IS NFKC NORMALIZED AS b, label IS NOT NFD NORMALIZED, normalize(label, NFKD) FROM things">
	>().toEqualTypeOf<{
		is_normalized: boolean;
		b: boolean | null;
		"?column?": boolean;
		normalize: string;
	}>();
	expectTypeOf<Params<"SELECT $1 IS NORMALIZED">>().toEqualTypeOf<
		[string | null]
	>();
});

test("SUBSTRING ... SIMILAR, indirection, special functions in FROM", () => {
	// the pattern forms are NULL when nothing matches
	expectTypeOf<
		Row<"SELECT substring(label SIMILAR 'a#\"%#\"' ESCAPE '#') AS a, substring(label FROM 'a.') AS b, substring(label FROM 1 FOR 2) AS c FROM things">
	>().toEqualTypeOf<{ a: string | null; b: string | null; c: string }>();
	expectTypeOf<
		Params<"SELECT substring(label SIMILAR $1 ESCAPE '#') FROM things">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Row<"SELECT (words)[1].x, words[1].y FROM things">
	>().toEqualTypeOf<{ x: unknown; y: unknown }>();
	expectTypeOf<
		Row<"SELECT * FROM current_date AS d, collation for ('x'::text) col, cast(1 + 2 AS int8) AS i8, localtimestamp(3) AS t">
	>().toEqualTypeOf<{ d: Date; col: string; i8: string; t: Date }>();
	expectTypeOf<
		Row<"SELECT * FROM cast(1 AS int4), current_user">
	>().toEqualTypeOf<{ int4: number; current_user: string }>();
});

test("FETCH before OFFSET; a plain view takes no USING", () => {
	expectTypeOf<
		Row<"SELECT id FROM things ORDER BY id FETCH FIRST 5 ROWS WITH TIES OFFSET 10">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		ApplyDdl<DB, "CREATE VIEW v USING heap AS SELECT 1">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected AS at or near using", 3>
	>();
});
