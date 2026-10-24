import { expectTypeOf, test } from "vitest";
import type { ApplyDdl, SqlError } from "../../src/index.js";
import type { DB, Interval, Params, Row, V } from "./_schema.js";

// Special expression syntax of PostgreSQL 18 (gram.y), with the types and output column names
// (`FigureColnameInternal`) Postgres gives it.

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
