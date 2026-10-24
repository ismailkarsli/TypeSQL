import { expectTypeOf, test } from "vitest";
import type {
	ArgsOf,
	NamesOf,
	NonArrayOrSqlJson,
} from "../../src/engine/index.js";
import {
	createSql,
	type DefaultParamTypeMap,
	type DefaultTypeMap,
	type ParamsOf,
} from "../../src/index.js";
import type { BigIn, DateIn, DB, Interval, Params, Row } from "./_schema.js";

const sql = createSql<DB>();

test("comparisons give the column type, nullable; arithmetic keeps the column's nullability", () => {
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id = $1 AND big > $2 AND price <> $3 AND label ~ $4">
	>().toEqualTypeOf<
		[number | null, BigIn | null, BigIn | null, string | null]
	>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE n_id = $1 AND $2 = n_text AND n_id IS DISTINCT FROM $3">
	>().toEqualTypeOf<[number | null, string | null, number | null]>();
	expectTypeOf<
		Params<"SELECT id + $1, n_id + $2, label || $3, price * $4, n_text || $5, $6 || 'x' FROM things">
	>().toEqualTypeOf<
		[number, number | null, string, BigIn, string | null, string]
	>();
	expectTypeOf<Params<"SELECT id FROM things WHERE $1 = id">>().toEqualTypeOf<
		[number | null]
	>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE $1 IS NULL">
	>().toEqualTypeOf<[unknown]>();
});

test("casts beat context; LIMIT/OFFSET are numbers; no context is unknown", () => {
	expectTypeOf<Params<"SELECT $1::int8, $2::text, $3::int4[]">>().toEqualTypeOf<
		[BigIn, string, (number | null)[]]
	>();
	expectTypeOf<
		Params<"SELECT id FROM things LIMIT $1 OFFSET $2">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<Params<"SELECT $1">>().toEqualTypeOf<[unknown]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id = $2 AND label = $1">
	>().toEqualTypeOf<[string | null, number | null]>();
});

test("a parameter tested with IS [NOT] NULL accepts null", () => {
	// the optional-filter pattern: the other uses give the type, the null test adds `| null`
	expectTypeOf<
		Params<"SELECT id FROM things WHERE ($1::text IS NULL OR label = $1)">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE ($1 IS NULL OR id = $1) AND ($2::int4 IS NOT NULL AND id > $2)">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE $1::int8 IS NULL">
	>().toEqualTypeOf<[BigIn | null]>();
	// IS TRUE / IS UNKNOWN do not, nor does a null test on an expression containing the param
	expectTypeOf<
		Params<"SELECT id FROM things WHERE $1::bool IS TRUE">
	>().toEqualTypeOf<[boolean]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE (id + $1) IS NULL">
	>().toEqualTypeOf<[number]>();
	sql("SELECT id FROM things WHERE ($1::text IS NULL OR label = $1)", null);
	sql("SELECT id FROM things WHERE ($1::text IS NULL OR label = $1)", "x");
});

test("null is accepted wherever Postgres accepts it, rejected in assignments to NOT NULL columns", () => {
	// LIMIT NULL / OFFSET NULL mean no limit / no offset
	expectTypeOf<
		Params<"SELECT id FROM things LIMIT $1::int8 OFFSET $2">
	>().toEqualTypeOf<[BigIn | null, number | null]>();
	// array elements are always nullable
	expectTypeOf<Params<"SELECT $1::float8[]">>().toEqualTypeOf<
		[(number | null)[]]
	>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE nums && $1">
	>().toEqualTypeOf<[(number | null)[]]>();
	// a cast takes the context's nullability: comparisons and function arguments accept null ...
	expectTypeOf<
		Params<"SELECT * FROM unnest($1::float8[]) AS x(v)">
	>().toEqualTypeOf<[(number | null)[] | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE uid = $1::uuid AND $2::int8 < big AND id = ANY($3::int4[])">
	>().toEqualTypeOf<[string | null, BigIn | null, (number | null)[] | null]>();
	expectTypeOf<
		Params<"SELECT coalesce($1::text, 'x'), id IN ($2::int4) FROM things">
	>().toEqualTypeOf<[string | null, number | null]>();
	// ... assignments follow the column, and a cast without context stays non-null
	expectTypeOf<
		Params<"INSERT INTO users (email, display_name) VALUES ($1::text, $2::text)">
	>().toEqualTypeOf<[string, string | null]>();
	expectTypeOf<
		Params<"UPDATE things SET label = $1, n_text = $2 WHERE uid = $3">
	>().toEqualTypeOf<[string, string | null, string | null]>();
	expectTypeOf<Params<"SELECT $1::text">>().toEqualTypeOf<[string]>();
	// a $n compared and assigned is non-null
	expectTypeOf<
		Params<"UPDATE things SET label = $1 WHERE label <> $1">
	>().toEqualTypeOf<[string]>();
	sql("SELECT id FROM users LIMIT $1 OFFSET $2", null, null);
	sql("SELECT * FROM unnest($1::float8[]) AS x(v)", [1, null]);
	sql("SELECT id FROM users WHERE email = $1", null);
	// @ts-expect-error a cast without context is NOT NULL
	sql("SELECT $1::float8[]", null);
	// @ts-expect-error NOT NULL column
	sql("INSERT INTO users (email) VALUES ($1)", null);
});

test("params accept the row type plus the type map's $params entry", () => {
	// the default input map (DefaultParamTypeMap): what pg and postgres.js both serialize
	expectTypeOf<
		Params<"SELECT id FROM things WHERE at > $1 AND price > $2 AND dur = $3 AND bin = $4 AND ratio > $5">
	>().toEqualTypeOf<
		[
			DateIn | null,
			BigIn | null,
			Interval | string | null,
			Uint8Array | null,
			number | null,
		]
	>();
	expectTypeOf<Params<"SELECT $1::timestamptz[], $2::int8[]">>().toEqualTypeOf<
		[(DateIn | null)[], (BigIn | null)[]]
	>();
	// row types are unchanged
	expectTypeOf<Row<"SELECT at, price, big FROM things">>().toEqualTypeOf<{
		at: Date;
		price: string;
		big: string;
	}>();
	// rows typed with custom parsers (timestamptz as string) keep the driver's input types
	interface StringDates extends Omit<DefaultTypeMap, "timestamptz"> {
		timestamptz: string;
	}
	const s = createSql<DB, StringDates>();
	s(
		`SELECT id FROM things WHERE at > ${s.param(new Date())} AND at < ${s.param("2030-01-01")}`,
	);
	s(`SELECT coalesce(${s.param(0.5)}, 0.1) AS v`);
	s("SELECT id FROM things WHERE big = $1 AND price = $2", 1n, 2.5);
	expectTypeOf<
		ParamsOf<DB, StringDates, "SELECT at FROM things WHERE at > $1">
	>().toEqualTypeOf<[string | Date | null]>();
	// a map's own $params replaces the default extras
	interface RowsOnly extends DefaultTypeMap {
		$params: {};
	}
	expectTypeOf<
		ParamsOf<DB, RowsOnly, "SELECT id FROM things WHERE at > $1 AND big = $2">
	>().toEqualTypeOf<[Date | null, string | null]>();
	interface Extra extends DefaultTypeMap {
		$params: DefaultParamTypeMap & { uuid: Uint8Array };
	}
	expectTypeOf<
		ParamsOf<DB, Extra, "SELECT id FROM things WHERE uid = $1 AND at > $2">
	>().toEqualTypeOf<[string | Uint8Array | null, DateIn | null]>();
	// @ts-expect-error int4 still takes only numbers
	sql("SELECT id FROM things WHERE id = $1", "1");
	// @ts-expect-error bool takes only booleans
	sql("SELECT id FROM things WHERE flag = $1", "true");
});

test("IN lists, ANY/ALL, BETWEEN, LIKE", () => {
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id IN ($1, $2)">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE $1 IN (1, 2)">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE label NOT IN ($1, 'x')">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id = ANY($1) AND label <> ALL($2)">
	>().toEqualTypeOf<[(number | null)[] | null, (string | null)[] | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE $1 = ANY(nums) OR $2 = ANY(words)">
	>().toEqualTypeOf<[number | null, string | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id BETWEEN $1 AND $2 AND day BETWEEN $3 AND $4">
	>().toEqualTypeOf<
		[number | null, number | null, DateIn | null, DateIn | null]
	>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE $1 BETWEEN 1 AND 2">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE label LIKE $1 AND n_text ILIKE $2 AND vc SIMILAR TO $3">
	>().toEqualTypeOf<[string | null, string | null, string | null]>();
});

test("function arguments take the parameter type of the resolved signature", () => {
	expectTypeOf<
		Params<"SELECT lower($1), length($2), left(label, $3) FROM things">
	>().toEqualTypeOf<[string | null, string | null, number | null]>();
	expectTypeOf<
		Params<"SELECT round(price, $1), power($2, 2), date_trunc($3, at) FROM things">
	>().toEqualTypeOf<[number | null, number | null, string | null]>();
	expectTypeOf<
		Params<"SELECT jsonb_set(data, $1, $2), jsonb_path_exists(data, $3) FROM things">
	>().toEqualTypeOf<[(string | null)[] | null, unknown, string | null]>();
	expectTypeOf<
		Params<"SELECT make_date($1, 1, 1), to_char(at, $2), array_length(nums, $3), generate_series(1, $4) FROM things">
	>().toEqualTypeOf<
		[number | null, string | null, number | null, number | null]
	>();
	// polymorphic parameters take the sibling's type; an array sibling contributes its element type
	expectTypeOf<
		Params<"SELECT coalesce(n_big, $1), greatest(id, $2), nullif(label, $3), array_append(nums, $4), array_cat(nums, $5) FROM things">
	>().toEqualTypeOf<
		[
			BigIn | null,
			number | null,
			string | null,
			number | null,
			(number | null)[] | null,
		]
	>();
	expectTypeOf<
		Params<"SELECT lag(id, $1) OVER (), string_agg(label, $2), array_agg($3), count(*) FILTER (WHERE $4) FROM things">
	>().toEqualTypeOf<[number | null, string | null, unknown, boolean | null]>();
	// a pg_catalog function without a curated signature: no information
	expectTypeOf<Params<"SELECT pg_table_size($1) FROM things">>().toEqualTypeOf<
		[unknown]
	>();
});

test("CASE branches, ARRAY elements, boolean contexts", () => {
	expectTypeOf<
		Params<"SELECT CASE WHEN $1 THEN 1 END FROM things">
	>().toEqualTypeOf<[boolean | null]>();
	expectTypeOf<
		Params<"SELECT CASE WHEN id > 1 THEN $1 ELSE 'x' END FROM things">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Params<"SELECT CASE id WHEN $1 THEN 1 END, CASE WHEN flag THEN id ELSE $2 END FROM things">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<
		Params<"SELECT ARRAY[$1, 1], ARRAY[label, $2] FROM things">
	>().toEqualTypeOf<[number | null, string | null]>();
	expectTypeOf<
		Params<"SELECT NOT $1, $2 AND flag, flag OR $3 FROM things">
	>().toEqualTypeOf<[boolean | null, boolean | null, boolean | null]>();
});

test("JSON, date/time and special-syntax contexts", () => {
	expectTypeOf<
		Params<"SELECT data -> $1, data #> $2, data ? $3, data @> $4, data ->> $5 FROM things">
	>().toEqualTypeOf<
		[
			string | null,
			(string | null)[] | null,
			string | null,
			unknown,
			string | null,
		]
	>();
	// date/time - $1: Postgres tries the same-type operator first (day - $3 → date, at - $5 → timestamptz)
	expectTypeOf<
		Params<"SELECT at + $1, dur * $2, day - $3, interval '1 day' * $4, at - $5, n_at + $6, clock - $7 FROM things">
	>().toEqualTypeOf<
		[
			Interval | string,
			number,
			DateIn,
			number,
			DateIn,
			Interval | string | null,
			string,
		]
	>();
	expectTypeOf<
		Params<"SELECT EXTRACT(year FROM $1), $2 AT TIME ZONE 'utc', at AT TIME ZONE $3 FROM things">
	>().toEqualTypeOf<[DateIn | null, DateIn | null, string | null]>();
	// SUBSTRING(x FROM $n) is the regex form (text); a numeric sibling makes it the integer form
	expectTypeOf<
		Params<"SELECT substring($1 FROM $2), position($3 IN label), trim($4), nums[$5] FROM things">
	>().toEqualTypeOf<
		[string | null, string | null, string | null, string | null, number]
	>();
	expectTypeOf<
		Params<"SELECT substring(label FROM 1 FOR $1), substring(label FROM $2 FOR $3), substring(bin FROM $4) FROM things">
	>().toEqualTypeOf<
		[number | null, string | null, string | null, number | null]
	>();
});

test("subqueries", () => {
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id IN (SELECT author_id FROM posts WHERE title = $1)">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE EXISTS (SELECT 1 FROM users WHERE email = $1) AND (SELECT count(*) FROM users WHERE id > $2) > 0">
	>().toEqualTypeOf<[string | null, number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things t WHERE $1 = ANY(SELECT author_id FROM posts WHERE author_id = t.id)">
	>().toEqualTypeOf<[unknown]>();
});

test("the same $n used twice intersects its types", () => {
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id = $1 OR id = $1">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE n_text = $1 AND lower($1) = 'x'">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id = $1 AND label = $1">
	>().toEqualTypeOf<[never]>();
	expectTypeOf<
		Params<"SELECT $1::text, lower($1) FROM things">
	>().toEqualTypeOf<[string]>();
});

test("runtime call site", () => {
	sql("SELECT lower($1) FROM users", null);
	sql("SELECT lower($1) FROM users", "x");
	sql("SELECT id FROM users WHERE id = ANY($1)", [1, 2]);
	sql("SELECT id FROM users WHERE created_at > $1", new Date());
	// comparing with NULL is legal (it matches nothing)
	sql("SELECT id FROM users WHERE id = $1", null);
	// @ts-expect-error assigning NULL to a NOT NULL column is not
	sql("UPDATE users SET email = $1", null);
	// @ts-expect-error wrong element type
	sql("SELECT id FROM users WHERE id = ANY($1)", ["1"]);
	// int8 rows are strings under the default type map; int8 params also take numbers and bigints
	sql("SELECT id FROM posts WHERE id = $1", 1n);
	sql("SELECT id FROM posts WHERE id = $1", 1);
});

test("an unused $n is unknown; an invalid statement has no parameters", () => {
	expectTypeOf<Params<"SELECT $2::int4">>().toEqualTypeOf<[unknown, number]>();
	expectTypeOf<ArgsOf<DB, DefaultTypeMap, "SELECT $2::jsonb">>().toEqualTypeOf<
		[unknown, NonArrayOrSqlJson<unknown>]
	>();
	// only tested for NULL: no type to take
	expectTypeOf<Params<"SELECT 1 WHERE $1 IS NULL">>().toEqualTypeOf<
		[unknown]
	>();
	expectTypeOf<
		[
			Params<"SELECT nope FROM users">,
			ArgsOf<DB, DefaultTypeMap, "SELECT nope FROM users">,
			NamesOf<DB, "SELECT nope FROM users">,
		]
	>().toEqualTypeOf<[[], [], []]>();
	// json and jsonb parameters both take sql.json() values
	expectTypeOf<
		ArgsOf<
			DB,
			DefaultTypeMap,
			"UPDATE things SET data = $1, doc = $2, label = $3"
		>
	>().toEqualTypeOf<
		[NonArrayOrSqlJson<unknown>, NonArrayOrSqlJson<unknown>, string]
	>();
});
