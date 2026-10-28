import { expectTypeOf, test } from "vitest";
import type {
	Analyze,
	ArgsOf,
	NamesOf,
	NonArrayOrSqlJson,
} from "../../../src/engine/index.js";
import type { Lex } from "../../../src/engine/lexer/lex.js";
import type { MaxParam } from "../../../src/engine/typer/params.js";
import {
	createSql,
	type DefaultParamTypeMap,
	type DefaultTypeMap,
	type ParamsOf,
} from "../../../src/index.js";
import type { BigIn, DateIn, DB, Interval, Params, Row } from "../_schema.js";

const sql = createSql<DB>();
/** Raw `{ [n]: ColInfo }` map before the type map is applied (Postgres types). */
type Raw<Q extends string> =
	Analyze<DB, Q> extends { readonly params: infer P }
		? { -readonly [K in keyof P]: P[K] }
		: never;
type T<Ty extends string, N extends boolean = true> = {
	readonly type: Ty;
	readonly nullable: N;
};

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

// Each expectation below was checked against PostgreSQL 18 with PREPARE (pg_prepared_statements).
test("every comparison and pattern operator gives the other operand's type, nullable", () => {
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id <= $1 AND id >= $2 AND id != $3 AND label ~ $4 AND label ~* $5 AND label !~ $6 AND label !~* $7 AND label ~~ $8 AND label ~~* $9 AND label !~~ $10 AND label !~~* $11">
	>().toEqualTypeOf<
		[
			number | null,
			number | null,
			number | null,
			string | null,
			string | null,
			string | null,
			string | null,
			string | null,
			string | null,
			string | null,
			string | null,
		]
	>();
});

test("operators with a parameter on both sides or a cast parameter", () => {
	// AND / OR type both parameters bool; other operators leave them untyped
	expectTypeOf<Raw<"SELECT 1 WHERE $1 AND $2">>().toEqualTypeOf<{
		1: T<"bool">;
		2: T<"bool">;
	}>();
	expectTypeOf<Raw<"SELECT 1 WHERE $1 OR $2">>().toEqualTypeOf<{
		1: T<"bool">;
		2: T<"bool">;
	}>();
	expectTypeOf<Raw<"SELECT $3::int4 WHERE $1 = $2">>().toEqualTypeOf<{
		3: T<"int4", false>;
	}>();
	// a cast parameter takes the operator's nullability: nullable in a comparison, the other
	// operand's in arithmetic
	expectTypeOf<Raw<"SELECT 1 WHERE $1 = $2::int4">>().toEqualTypeOf<{
		1: T<"int4">;
		2: T<"int4">;
	}>();
	expectTypeOf<Raw<"SELECT $1::int4 + id FROM things">>().toEqualTypeOf<{
		1: T<"int4", false>;
	}>();
	// json paths and key lists are text[]; @? takes a jsonpath (text), @@ the other text search type
	expectTypeOf<
		Raw<"SELECT data #> $1, data #>> $2, data ?| $3, data ?& $4, data @? $5, tsv @@ $6, to_tsquery('a') @@ $7 FROM things">
	>().toEqualTypeOf<{
		1: T<"text[]">;
		2: T<"text[]">;
		3: T<"text[]">;
		4: T<"text[]">;
		5: T<"text">;
		6: T<"tsquery">;
		7: T<"tsvector">;
	}>();
});

test("parameters under NOT, a prefix operator, ROW, COLLATE, a field, named and VARIADIC arguments", () => {
	expectTypeOf<
		Params<"SELECT id FROM things WHERE NOT (id = $1)">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<Params<"SELECT -(id + $1) FROM things">>().toEqualTypeOf<
		[number]
	>();
	// a prefix operator other than NOT leaves its parameter untyped, and the others as they are
	expectTypeOf<Params<"SELECT $1::int4, |/ $2">>().toEqualTypeOf<
		[number, unknown]
	>();
	expectTypeOf<Params<"SELECT ROW(id = $1) FROM things">>().toEqualTypeOf<
		[number | null]
	>();
	// a parameter directly in ROW has no type (a cast one has its own)
	expectTypeOf<Raw<"SELECT $1::int4, ROW($2), ROW($3::int4)">>().toEqualTypeOf<{
		1: T<"int4", false>;
		3: T<"int4", false>;
	}>();
	expectTypeOf<
		Raw<'SELECT (label || $1) COLLATE "C" FROM things'>
	>().toEqualTypeOf<{ 1: T<"text", false> }>();
	expectTypeOf<
		Params<"SELECT (SELECT t FROM things t WHERE id = $1).label">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<
		Raw<"SELECT make_interval(days => id + $1), format('%s', VARIADIC ARRAY[label || $2]), JSON_OBJECT('a': (label || $3) FORMAT JSON) FROM things">
	>().toEqualTypeOf<{
		1: T<"int4", false>;
		2: T<"text", false>;
		3: T<"text", false>;
	}>();
});

test("$1 BETWEEN a AND b takes a's type, as Postgres resolves $1 >= a first", () => {
	expectTypeOf<
		[
			Raw<"SELECT 1 WHERE $1 BETWEEN 1 AND 2.5">,
			Raw<"SELECT 1 FROM things WHERE $1 BETWEEN id AND big">,
			Raw<"SELECT 1 FROM things WHERE $1 BETWEEN SYMMETRIC big AND id">,
			Raw<"SELECT 1 FROM things WHERE id BETWEEN $1 AND $2">,
		]
	>().toEqualTypeOf<
		[
			{ 1: T<"int4"> },
			{ 1: T<"int4"> },
			{ 1: T<"int8"> },
			{ 1: T<"int4">; 2: T<"int4"> },
		]
	>();
});

test("a parameter tested with IS NULL besides a typed use; IN (NULL)", () => {
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id + $1 > 0 OR $1 IS NULL">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<
		[Raw<"SELECT 1 WHERE $1 IN (NULL)">, Raw<"SELECT 1 WHERE $1 IN (NULL, 1)">]
	>().toEqualTypeOf<[{ 1: T<"unknown"> }, { 1: T<"int4"> }]>();
});

test("SUBSTRING / OVERLAY / AT TIME ZONE positions", () => {
	// bit strings have only the integer form; FROM $n takes FOR's type (FOR 2: int4), FROM $n FOR $m
	// is the regex form, and FROM a smallint makes FOR $n int4
	expectTypeOf<
		Raw<"SELECT substring(B'101'::bit(3) FROM $1), substring(B'101'::varbit FROM $2), substring(label FROM $3 FOR 2), substring(label FROM $4 FOR $5), substring(label FROM 1::int2 FOR $6) FROM things">
	>().toEqualTypeOf<{
		1: T<"int4">;
		2: T<"int4">;
		3: T<"int4">;
		4: T<"text">;
		5: T<"text">;
		6: T<"int4">;
	}>();
	expectTypeOf<
		Params<"SELECT overlay($1 PLACING 'x' FROM 1), at AT TIME ZONE $2 FROM things">
	>().toEqualTypeOf<[string | null, string | null]>();
});

test("operators: date/time, jsonb, interval, || and the rest", () => {
	expectTypeOf<
		Raw<"SELECT at - $1, day - $2, clock::timetz - $3, data - $4, at + $5, dur * $6, dur / $7, id || $8, id % $9, label @@ $10 FROM things">
	>().toEqualTypeOf<{
		1: T<"timestamptz", false>;
		2: T<"date", false>;
		3: T<"interval", false>;
		4: T<"text", false>;
		5: T<"interval", false>;
		6: T<"float8", false>;
		7: T<"float8", false>;
		8: T<"text", false>;
		9: T<"int4", false>;
		10: T<"text", false>;
	}>();
	// || keeps the type of a jsonb, bytea, text search or array operand
	expectTypeOf<
		Raw<"SELECT data || $1, bin || $2, tsv || $3, nums || $4 FROM things">
	>().toEqualTypeOf<{
		1: T<"jsonb", false>;
		2: T<"bytea", false>;
		3: T<"tsvector", false>;
		4: T<"int4[]", false>;
	}>();
	expectTypeOf<
		Params<"SELECT trim(both $1 FROM label) FROM things">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<Raw<"SELECT $1 AT TIME ZONE 'UTC'">>().toEqualTypeOf<{
		1: T<"timestamptz">;
	}>();
});

test("ANY / ALL, ARRAY(SELECT), subscripts", () => {
	expectTypeOf<
		Params<"SELECT $1::int4 FROM things WHERE id = ANY(nums)">
	>().toEqualTypeOf<[number]>();
	// a parameter left of ANY (subquery) stays untyped; the subquery's are typed
	expectTypeOf<
		Params<"SELECT 1 FROM things WHERE $1 = ANY(SELECT id FROM things WHERE id = $2)">
	>().toEqualTypeOf<[unknown, number | null]>();
	expectTypeOf<
		Params<"SELECT 1 FROM things WHERE id = ANY(SELECT id FROM things WHERE id = $1)">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<
		Raw<"SELECT 1 FROM things WHERE id = ANY(ARRAY[id + $1])">
	>().toEqualTypeOf<{ 1: T<"int4", false> }>();
	expectTypeOf<
		Params<"SELECT ARRAY(SELECT id FROM things WHERE id = $1)">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<Raw<"SELECT nums[$1:$2] FROM things">>().toEqualTypeOf<{
		1: T<"int4", false>;
		2: T<"int4", false>;
	}>();
});

test("function arguments: polymorphic and category patterns", () => {
	// an unknown in a category takes its preferred type: float8, timestamptz, text (the text
	// forms of to_tsvector / ts_headline before the json ones)
	expectTypeOf<
		Raw<"SELECT age($1, at), abs($2), width_bucket($3, 0, 10, 5), to_tsvector($4), ts_headline($5, to_tsquery('a')) FROM things">
	>().toEqualTypeOf<{
		1: T<"timestamptz">;
		2: T<"float8">;
		3: T<"float8">;
		4: T<"text">;
		5: T<"text">;
	}>();
	// a range parameter has no type (Postgres cannot choose between range and multirange)
	expectTypeOf<Raw<"SELECT isempty($1)">>().toEqualTypeOf<{
		1: T<"unknown">;
	}>();
	// anyarray next to a known element; without one (Postgres cannot type these either)
	expectTypeOf<
		Raw<"SELECT array_positions($1, 1), array_length($2, 1), array_fill($3, ARRAY[2])">
	>().toEqualTypeOf<{
		1: T<"int4[]">;
		2: T<"unknown">;
		3: T<"unknown">;
	}>();
	// NULL does not type a polymorphic sibling
	expectTypeOf<
		Raw<"SELECT coalesce($1, NULL), coalesce($2, id) FROM things">
	>().toEqualTypeOf<{ 1: T<"unknown">; 2: T<"int4"> }>();
	expectTypeOf<
		Params<"SELECT CASE WHEN flag THEN $1 WHEN n_flag THEN id END FROM things">
	>().toEqualTypeOf<[number | null]>();
});

test("parameters in joins, TABLESAMPLE, set operations, VALUES, GROUP BY and HAVING", () => {
	expectTypeOf<
		Params<"SELECT 1 FROM things a JOIN things b ON a.id = $1">
	>().toEqualTypeOf<[number | null]>();
	// system_rows / system_time are the tsm_system_rows / tsm_system_time extensions
	expectTypeOf<
		[
			Raw<"SELECT 1 FROM things TABLESAMPLE system_rows($1)">,
			Raw<"SELECT 1 FROM things TABLESAMPLE system_time($1)">,
			Raw<"SELECT 1 FROM things TABLESAMPLE bernoulli($1)">,
		]
	>().toEqualTypeOf<
		[
			{ 1: T<"int8", false> },
			{ 1: T<"float8", false> },
			{ 1: T<"float4", false> },
		]
	>();
	expectTypeOf<
		Params<"SELECT id FROM things WHERE id = $1 UNION SELECT id FROM things WHERE id = $2">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<Params<"(SELECT id FROM things WHERE id = $1)">>().toEqualTypeOf<
		[number | null]
	>();
	expectTypeOf<Params<"VALUES (1 + $1)">>().toEqualTypeOf<[number]>();
	expectTypeOf<Params<"SELECT 1 FROM things GROUP BY id + $1">>().toEqualTypeOf<
		[number]
	>();
	// sum() is NULL over no rows unless grouped
	expectTypeOf<
		[
			Raw<"SELECT 1 FROM things HAVING sum(id) + $1 > 0">,
			Raw<"SELECT 1 FROM things GROUP BY id HAVING sum(id) + $1 > 0">,
		]
	>().toEqualTypeOf<[{ 1: T<"int8"> }, { 1: T<"int8", false> }]>();
});

test("parameter maxima use only parameter tokens, independent of order and duplicates", () => {
	expectTypeOf<MaxParam<[]>>().toEqualTypeOf<0>();
	expectTypeOf<
		MaxParam<Lex<"SELECT 99, '$88', \"$77\" /* $66 */ -- $55\n">>
	>().toEqualTypeOf<0>();
	expectTypeOf<
		MaxParam<Lex<"SELECT $2, $12, $1, $12, $3">>
	>().toEqualTypeOf<12>();
	expectTypeOf<MaxParam<Lex<"SELECT $12, $2, $1">>>().toEqualTypeOf<12>();
	expectTypeOf<MaxParam<Lex<"SELECT $0">>>().toEqualTypeOf<0>();
});

test("union statement projections keep shared parameter constraints and invalid branches", () => {
	type Texts = "SELECT $1::int4 AS value" | "SELECT $1::text AS value";
	expectTypeOf<Params<Texts>>().toEqualTypeOf<[never]>();
	expectTypeOf<ArgsOf<DB, DefaultTypeMap, Texts>>().toEqualTypeOf<[never]>();
	expectTypeOf<Row<Texts>>().toEqualTypeOf<
		{ value: number } | { value: string }
	>();

	type Invalid = "SELECT $1::int4 AS value" | "SELECT nope FROM users";
	expectTypeOf<Params<Invalid>>().toEqualTypeOf<[]>();
	expectTypeOf<ArgsOf<DB, DefaultTypeMap, Invalid>>().toEqualTypeOf<[]>();
	expectTypeOf<Row<Invalid>>().toEqualTypeOf<never>();
});
