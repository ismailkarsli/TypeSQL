import { expectTypeOf, test } from "vitest";
import type {
	Analysis,
	Analyze,
	NormalizeTypeName,
} from "../../src/engine/index.js";
import type {
	Col,
	DefaultTypeMap,
	Nullable,
	RowOf,
	SqlError,
} from "../../src/index.js";
import type { DB, Interval, Params, Row, V } from "./_schema.js";

/** Postgres type of each column (the default type map gives timestamp and timestamptz one TS type). */
type Types<Q extends string> =
	Analyze<DB, Q> extends {
		readonly cols: infer C extends readonly {
			readonly t: { readonly type: string };
		}[];
	}
		? { -readonly [K in keyof C]: C[K]["t"]["type"] }
		: never;
/** One column per type the operator rules tell apart, and nullable twins (`n_*`). */
interface OpsDB {
	o: {
		i2: Col<"int2">;
		i4: Col<"int4">;
		i8: Col<"int8">;
		n: Col<"numeric">;
		f4: Col<"float4">;
		f8: Col<"float8">;
		d: Col<"date">;
		t: Col<"time">;
		tz: Col<"timetz">;
		ts: Col<"timestamp">;
		tstz: Col<"timestamptz">;
		iv: Col<"interval">;
		m: Col<"money">;
		ip: Col<"inet">;
		cd: Col<"cidr">;
		b: Col<"bit">;
		vb: Col<"varbit">;
		j: Col<"json">;
		jb: Col<"jsonb">;
		jp: Col<"jsonpath">;
		txt: Col<"text">;
		vc: Col<"varchar">;
		bp: Col<"bpchar">;
		nm: Col<"name">;
		ch: Col<"char">;
		cit: Col<"citext">;
		r: Col<"int4range">;
		mr: Col<"int4multirange">;
		pt: Col<"point">;
		bx: Col<"box">;
		ls: Col<"lseg">;
		pa: Col<"path">;
		pg: Col<"polygon">;
		tsv: Col<"tsvector">;
		tsq: Col<"tsquery">;
		by: Col<"bytea">;
		ia: Col<"int4[]">;
		ta: Col<"text[]">;
		bo: Col<"bool">;
		n_i4: Nullable<"int4">;
		n_jb: Nullable<"jsonb">;
		n_txt: Nullable<"text">;
	};
}
/** A statement over `OpsDB` (the types oracle replays it). */
type Ops<Q extends string> = Analysis<OpsDB, Q>;
type OpsRow<Q extends string> = RowOf<OpsDB, DefaultTypeMap, Q>;
/** Each column's Postgres type name, with ` | null` when nullable. */
type Typed<A> = A extends {
	readonly cols: infer C extends readonly {
		readonly t: { readonly type: string; readonly nullable: boolean };
	}[];
}
	? {
			-readonly [K in keyof C]: Shown<C[K]["t"]["type"], C[K]["t"]["nullable"]>;
		}
	: A;
type Shown<T extends string, N extends boolean> = [N] extends [never]
	? `${T} | never`
	: N extends true
		? `${T} | null`
		: T;
type Err<Q extends string> =
	V<Q> extends SqlError<infer M extends string, unknown> ? M : "ok";

// Every expectation here was checked against PostgreSQL 18 with `select pg_typeof(...)`.
// Default type map: int2/int4/float4/float8 → number, int8/numeric → string, date/timestamp(tz) → Date,
// time/timetz → string, interval → Interval, json(b) → unknown, bool → boolean.

test("numeric promotion follows Postgres operator resolution (float8 preferred)", () => {
	expectTypeOf<
		Row<"SELECT small + small AS a, small + id AS b, id + big AS c, id + price AS d FROM things">
	>().toEqualTypeOf<{ a: number; b: number; c: string; d: string }>();
	// int4 + float4 → float8, float4 * float4 → float4, numeric + float8 → float8 (not numeric)
	expectTypeOf<
		Row<"SELECT id + score AS a, score * score AS b, price + ratio AS c, price * score AS d FROM things">
	>().toEqualTypeOf<{ a: number; b: number; c: number; d: number }>();
	expectTypeOf<
		Row<"SELECT id / id AS a, big % id AS b, small * small AS c, price / 2 AS d FROM things">
	>().toEqualTypeOf<{ a: number; b: string; c: number; d: string }>();
	// ^ : float8 unless numeric is involved
	expectTypeOf<
		Row<"SELECT id ^ id AS a, price ^ id AS b, ratio ^ 2 AS c, 2 ^ 3 AS d FROM things">
	>().toEqualTypeOf<{ a: number; b: string; c: number; d: number }>();
	// untyped literal / NULL takes the other side
	expectTypeOf<
		Row<"SELECT id + '1' AS a, big * NULL AS b, 1 + 1 AS c FROM things">
	>().toEqualTypeOf<{ a: number; b: string | null; c: number }>();
});

test("numeric literals: int4 / int8 / numeric by value", () => {
	expectTypeOf<
		Row<"SELECT 1 AS a, 999999999 AS b, 2147483647 AS c, 2147483648 AS d, 1000000000 AS e">
	>().toEqualTypeOf<{
		a: number;
		b: number;
		c: number;
		d: string;
		e: number;
	}>();
	expectTypeOf<
		Row<"SELECT 9223372036854775807 AS a, 9223372036854775808 AS b, 1.5 AS c, 1e3 AS d, .5 AS e">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
	}>();
	// -2147483648 is folded to an int4 constant like Postgres does
	expectTypeOf<
		Row<"SELECT -1 AS a, -2147483648 AS b, -2147483649 AS c, -1.5 AS d">
	>().toEqualTypeOf<{ a: number; b: number; c: string; d: string }>();
});

test("|| concatenation: text, arrays, jsonb, bytea, tsvector, bit", () => {
	expectTypeOf<
		Row<"SELECT label || 'x' AS a, label || id AS b, id || label AS c, vc || vc AS d, uid || 'x' AS e, day || label AS f FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
		f: string;
	}>();
	expectTypeOf<
		Row<"SELECT nums || 1 AS a, 1 || nums AS b, nums || nums AS c, words || 'x' AS d FROM things">
	>().toEqualTypeOf<{ a: number[]; b: number[]; c: number[]; d: string[] }>();
	expectTypeOf<
		Row<"SELECT data || data AS a, data || '{}' AS b, data || label AS c, bin || bin AS d, tsv || tsv AS e FROM things">
	>().toEqualTypeOf<{
		a: unknown;
		b: unknown;
		c: string;
		d: Uint8Array;
		e: string;
	}>();
	expectTypeOf<
		Row<"SELECT 'a' || 'b' AS a, label || NULL AS b FROM things">
	>().toEqualTypeOf<{ a: string; b: string | null }>();
});

test("JSON operators", () => {
	// ->> / #>> → text, always nullable (missing key); -> / #> keep the json kind
	expectTypeOf<
		Row<"SELECT data ->> 'a' AS a, data #>> '{a}' AS b, doc ->> 0 AS c, data -> 'a' AS d, doc #> '{a}' AS e FROM things">
	>().toEqualTypeOf<{
		a: string | null;
		b: string | null;
		c: string | null;
		d: unknown;
		e: unknown;
	}>();
	expectTypeOf<
		Row<"SELECT data - 'a' AS a, data - 1 AS b, data - words AS c, data #- '{a}' AS d FROM things">
	>().toEqualTypeOf<{ a: unknown; b: unknown; c: unknown; d: unknown }>();
	expectTypeOf<
		Row<"SELECT data @> '{}' AS a, data <@ data AS b, data ? 'a' AS c, data ?| words AS d, data ?& words AS e, data @? '$.a' AS f FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
	}>();
	// jsonb @@ jsonpath yields NULL for a non-boolean result
	expectTypeOf<Row<"SELECT data @@ '$.a' AS a FROM things">>().toEqualTypeOf<{
		a: boolean | null;
	}>();
});

test("date/time arithmetic", () => {
	expectTypeOf<
		Row<"SELECT day + 1 AS a, day - 1 AS b, day - day AS c, day + dur AS d, day - dur AS e, day + clock AS f, 1 + day AS g FROM things">
	>().toEqualTypeOf<{
		a: Date;
		b: Date;
		c: number;
		d: Date;
		e: Date;
		f: Date;
		g: Date;
	}>();
	expectTypeOf<
		Row<"SELECT at - at AS a, ts - ts AS b, at - ts AS c, ts - day AS d, day - ts AS e, at + dur AS f, ts - dur AS g, dur + at AS h FROM things">
	>().toEqualTypeOf<{
		a: Interval;
		b: Interval;
		c: Interval;
		d: Interval;
		e: Interval;
		f: Date;
		g: Date;
		h: Date;
	}>();
	expectTypeOf<
		Row<"SELECT dur + dur AS a, dur - dur AS b, dur * 2 AS c, dur / 2.5 AS d, 2 * dur AS e, -dur AS f, dur * ratio AS g FROM things">
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
		Row<"SELECT clock + dur AS a, clock - clock AS b, dur + clock AS c, clock + day AS d FROM things">
	>().toEqualTypeOf<{ a: string; b: Interval; c: string; d: Date }>();
	// a literal is first assumed to have the other side's type (`at - '2020-01-01'` is
	// timestamptz - timestamptz, so `at - '1 day'` is a Postgres error); otherwise the only candidate wins
	expectTypeOf<
		Row<"SELECT at + '1 day' AS a, at - '2020-01-01' AS b, dur * '2' AS c, day - '2020-01-01' AS d FROM things">
	>().toEqualTypeOf<{ a: Date; b: Interval; c: Interval; d: number }>();
	// date + '1' is ambiguous in Postgres too
	expectTypeOf<Row<"SELECT day + '1' AS a FROM things">>().toEqualTypeOf<{
		a: unknown;
	}>();
});

test("AT TIME ZONE flips timestamp/timestamptz; EXTRACT → numeric, date_part → float8", () => {
	expectTypeOf<
		Row<"SELECT at AT TIME ZONE 'utc' AS a, ts AT TIME ZONE 'utc' AS b, clock AT TIME ZONE 'utc' AS c, day AT TIME ZONE 'utc' AS d FROM things">
	>().toEqualTypeOf<{ a: Date; b: Date; c: string; d: Date }>();
	expectTypeOf<
		Types<"SELECT at AT TIME ZONE 'utc', ts AT TIME ZONE 'utc', clock AT TIME ZONE 'utc', day AT TIME ZONE 'utc' FROM things">
	>().toEqualTypeOf<["timestamp", "timestamptz", "timetz", "timestamp"]>();
	expectTypeOf<
		[
			Err<"SELECT nope AT TIME ZONE 'utc'">,
			Err<"SELECT now() AT TIME ZONE nope">,
		]
	>().toEqualTypeOf<
		['column "nope" does not exist', 'column "nope" does not exist']
	>();
	expectTypeOf<
		Row<"SELECT EXTRACT(year FROM at) AS a, EXTRACT(epoch FROM dur) AS b, date_part('year', at) AS c, EXTRACT(hour FROM n_at) AS d FROM things">
	>().toEqualTypeOf<{ a: string; b: string; c: number; d: string | null }>();
});

test("comparison, pattern, containment and range operators → bool", () => {
	expectTypeOf<
		Row<"SELECT id = 1 AS a, id <> 2 AS b, label ~ 'x' AS c, label !~* 'x' AS d, label LIKE 'x' AS e, label ILIKE 'x' AS f, label SIMILAR TO 'x' AS g FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
		g: boolean;
	}>();
	expectTypeOf<
		Row<"SELECT id BETWEEN 1 AND 2 AS a, id NOT BETWEEN 1 AND 2 AS b, id IN (1, 2) AS c, id NOT IN (1, 2) AS d, id = ANY(nums) AS e, id <> ALL(nums) AS f FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
	}>();
	expectTypeOf<
		Row<"SELECT nums @> nums AS a, nums && nums AS b, nums <@ nums AS c, rng @> 1 AS d, rng << rng AS e, rng -|- rng AS f, rng && rng AS g, tsv @@ to_tsquery('x') AS h FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
		g: boolean;
		h: boolean;
	}>();
	// range arithmetic keeps the range type
	expectTypeOf<
		Row<"SELECT rng * rng AS a, rng + rng AS b, rng - rng AS c FROM things">
	>().toEqualTypeOf<{ a: string; b: string; c: string }>();
	expectTypeOf<
		Row<"SELECT day < at AS a, day = '2020-01-01' AS b, uid = 'x' AS c FROM things">
	>().toEqualTypeOf<{ a: boolean; b: boolean; c: boolean }>();
});

test("bit, shift and unary operators", () => {
	expectTypeOf<
		Row<"SELECT id & id AS a, id | big AS b, id # small AS c, id << 2 AS d, big >> 1 AS e, ~id AS f, ~small AS g FROM things">
	>().toEqualTypeOf<{
		a: number;
		b: string;
		c: number;
		d: number;
		e: string;
		f: number;
		g: number;
	}>();
	expectTypeOf<
		Row<"SELECT -id AS a, +id AS b, -price AS c, -score AS d, @ id AS e, @ price AS f, |/ id AS g, ||/ price AS h, -big AS i FROM things">
	>().toEqualTypeOf<{
		a: number;
		b: number;
		c: string;
		d: number;
		e: number;
		f: string;
		g: number;
		h: number;
		i: string;
	}>();
	expectTypeOf<
		Row<"SELECT !! to_tsquery('x') AS a FROM things">
	>().toEqualTypeOf<{ a: string }>();
});

test("arrays, subscripts, slices, ARRAY / ROW constructors", () => {
	// subscript always nullable (out of range → NULL); slice keeps the array type
	expectTypeOf<
		Row<"SELECT nums[1] AS a, nums[1:2] AS b, words[1] AS c, n_nums[1] AS d, n_nums[1:2] AS e, (ARRAY[1])[1] AS f FROM things">
	>().toEqualTypeOf<{
		a: number | null;
		b: number[];
		c: string | null;
		d: number | null;
		e: number[] | null;
		f: number | null;
	}>();
	expectTypeOf<
		Row<"SELECT ARRAY[1, 2] AS a, ARRAY[1, 2.5] AS b, ARRAY['a', 'b'] AS c, ARRAY[id, big] AS d, ARRAY[nums] AS e, ARRAY[n_id] AS f, ARRAY(SELECT id FROM users) AS g FROM things">
	>().toEqualTypeOf<{
		a: number[];
		b: string[];
		c: string[];
		d: string[];
		e: number[];
		f: number[];
		g: number[];
	}>();
	expectTypeOf<
		Row<"SELECT ROW(1, 'a') AS a, (1, 2) AS b, ROW(n_id) AS c FROM things">
	>().toEqualTypeOf<{ a: unknown; b: unknown; c: unknown }>();
	expectTypeOf<
		Row<"SELECT data[0] AS a, nums[1:2] AS b FROM things">
	>().toEqualTypeOf<{ a: unknown; b: number[] }>();
	// json, text, … have no subscripts; jsonb has no slices
	expectTypeOf<V<"SELECT doc['a'] FROM things">>().toEqualTypeOf<
		SqlError<
			"cannot subscript type json because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<V<"SELECT label[1:2] FROM things">>().toEqualTypeOf<
		SqlError<
			"cannot subscript type text because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT (json_build_object('a', 1))['a'] FROM things">
	>().toEqualTypeOf<
		SqlError<
			"cannot subscript type json because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<V<"SELECT data[0:1] FROM things">>().toEqualTypeOf<
		SqlError<"jsonb subscript does not support slices", 0>
	>();
	// subscripts in a row apply to the array together (one per dimension); a slice among them gives the array
	expectTypeOf<
		Types<"SELECT nums[1][2], nums[1][1][1], nums[1][1:2], nums[1:1][2], words[1][1] FROM things">
	>().toEqualTypeOf<["int4", "int4", "int4[]", "int4[]", "text"]>();
	// jsonb by any key; the geometric types and name take an index too
	expectTypeOf<
		Types<"SELECT data[id], ('(1,2)'::point)[0], ('{1,-1,0}'::line)[0], ('[(0,0),(1,1)]'::lseg)[0], ('((0,0),(1,1))'::box)[1], ('ab'::name)[0] FROM things">
	>().toEqualTypeOf<["jsonb", "float8", "float8", "point", "point", "char"]>();
	expectTypeOf<
		Err<"SELECT label[1][1] FROM things">
	>().toEqualTypeOf<"cannot subscript type text because it does not support subscripting">();
	// an index can be out of range (NULL); a slice out of range is an empty array, so a slice (and a
	// chain with one) is NULL only through a NULL array or operand
	expectTypeOf<
		Row<"SELECT nums[1:2] AS a, nums[:2] AS b, nums[n_id:2] AS c, nums[1:(n_id)] AS d, nums[NULL:2] AS e, n_nums[1:2] AS f, nums[1][2] AS g, nums[1][1:2] AS h, nums[1:1][2] AS i, nums[n_id][1:2] AS j, nums[1:1][n_id] AS k, n_nums[1][1:2] AS l, nums[1][2:(n_id)] AS m FROM things">
	>().toEqualTypeOf<{
		a: number[];
		b: number[];
		c: number[] | null;
		d: number[] | null;
		e: number[] | null;
		f: number[] | null;
		g: number | null;
		h: number[];
		i: number[];
		j: number[] | null;
		k: number[] | null;
		l: number[] | null;
		m: number[] | null;
	}>();
	// an enum takes no subscript; a type the engine does not know may (a domain over an array)
	expectTypeOf<
		[Err<"SELECT mood[1] FROM things">, Err<"SELECT n_mood[1:2] FROM things">]
	>().toEqualTypeOf<
		[
			"cannot subscript type mood because it does not support subscripting",
			"cannot subscript type mood because it does not support subscripting",
		]
	>();
	expectTypeOf<
		Analyze<{ t: { d: Col<"intarr"> } }, "SELECT d[1] FROM t">["cols"][0]["t"]
	>().toEqualTypeOf<{ readonly type: "unknown"; readonly nullable: true }>();
	// errors inside a bound, a ROW or an ARRAY item
	expectTypeOf<
		[
			Err<"SELECT nums[nope:1] FROM things">,
			Err<"SELECT nums[1:(nope)] FROM things">,
			Err<"SELECT ROW(1, nope)">,
		]
	>().toEqualTypeOf<
		[
			'column "nope" does not exist',
			'column "nope" does not exist',
			'column "nope" does not exist',
		]
	>();
});

test("a prefix operator on a literal: - and + fold into it; others are operators", () => {
	expectTypeOf<
		Types<"SELECT -2147483648, +1, |/ 25, @ -1, ~ 5">
	>().toEqualTypeOf<["int4", "int4", "float8", "int4", "int4"]>();
});

test("bit strings are bit constants; SUBSTRING / OVERLAY of a bit string is bit", () => {
	expectTypeOf<
		Types<"SELECT B'101', X'1F', B'101'::varbit, substring(B'101' FROM 2), substring(B'101'::varbit FROM 2), overlay(B'101'::varbit PLACING B'1' FROM 1), B'101'::varbit || B'1', 'x'">
	>().toEqualTypeOf<
		["bit", "bit", "varbit", "bit", "bit", "bit", "varbit", "text"]
	>();
	// a bit string names no column (a typed literal names its type)
	expectTypeOf<Row<"SELECT B'101', bit '1', B'1'::text">>().toEqualTypeOf<{
		"?column?": string;
		bit: string;
		text: string;
	}>();
});

test("type spellings normalize to the catalog names, arrays element-wise", () => {
	expectTypeOf<
		[
			NormalizeTypeName<"integer">,
			NormalizeTypeName<"integer[]">,
			NormalizeTypeName<"double precision[][]">,
			NormalizeTypeName<"mood[]">,
		]
	>().toEqualTypeOf<["int4", "int4[]", "float8[][]", "mood[]"]>();
});

test("casts and typed literals", () => {
	expectTypeOf<
		Row<"SELECT id::text AS a, label::int4 AS b, n_text::int8 AS c, CAST(price AS float8) AS d, '{1}'::int[] AS e, id::numeric(10, 2) AS f, big::bigint AS g FROM things">
	>().toEqualTypeOf<{
		a: string;
		b: number;
		c: string | null;
		d: number;
		e: number[];
		f: string;
		g: string;
	}>();
	expectTypeOf<
		Row<"SELECT interval '1 day' AS a, date '2020-01-01' AS b, timestamptz '2020-01-01' AS c, int4 '1' AS d, numeric '1.5' AS e, bool 'true' AS f, time '12:00' AS g">
	>().toEqualTypeOf<{
		a: Interval;
		b: Date;
		c: Date;
		d: number;
		e: string;
		f: boolean;
		g: string;
	}>();
	expectTypeOf<
		Row<"SELECT id::mood AS a, n_text::mood AS b FROM things">
	>().toEqualTypeOf<{ a: "happy" | "sad"; b: "happy" | "sad" | null }>();
});

test("unsupported combinations yield unknown, never an error", () => {
	expectTypeOf<
		Row<"SELECT flag + flag AS a, day * 2 AS b, at + at AS c, nums + nums AS d, id + label AS e FROM things">
	>().toEqualTypeOf<{
		a: unknown;
		b: unknown;
		c: unknown;
		d: unknown;
		e: unknown;
	}>();
});

test("any operator: prefix operators bind looser than arithmetic, unknown operators type as unknown", () => {
	// `@ a + b` is `@ (a + b)` in Postgres (prefix operators take `%prec Op`); `-` binds tightest
	expectTypeOf<
		Row<"SELECT @ small + small AS a, - small + 1 AS b, |/ ratio AS c FROM things">
	>().toEqualTypeOf<{ a: number; b: number; c: number }>();
	// user-defined operators parse; their result is unknown until cast
	expectTypeOf<
		Row<"SELECT id *= id AS a, (id ~<~ id)::bool AS b, @#@ id AS c, OPERATOR(pg_catalog.+) id AS d FROM things">
	>().toEqualTypeOf<{ a: unknown; b: boolean; c: unknown; d: unknown }>();
	// MathOp tokens cannot be prefix operators
	expectTypeOf<V<"SELECT < id FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near <", 1>
	>();
});

test("arithmetic on numbers: promotion, % and ^ (exact types)", () => {
	// operator resolution prefers float8: int4 + float4 → float8, float4 * float4 → float4, numeric + float4 → float8
	expectTypeOf<
		Typed<
			Ops<"SELECT i2 + i2, i2 + i4, i4 + i2, i4 + i8, i8 * i2, i4 - n, n / i8, i4 + f4, f4 * i4, f4 * f4, f4 - f8, n + f8, f8 / n, n * f4, i2 % i2, i8 % i4, n % i2, n_i4 + i4, i4 * n_i4 FROM o">
		>
	>().toEqualTypeOf<
		[
			"int2", // i2 + i2
			"int4", // i2 + i4
			"int4", // i4 + i2
			"int8", // i4 + i8
			"int8", // i8 * i2
			"numeric", // i4 - n
			"numeric", // n / i8
			"float8", // i4 + f4
			"float8", // f4 * i4
			"float4", // f4 * f4
			"float8", // f4 - f8
			"float8", // n + f8
			"float8", // f8 / n
			"float8", // n * f4
			"int2", // i2 % i2
			"int8", // i8 % i4
			"numeric", // n % i2
			"int4 | null", // n_i4 + i4
			"int4 | null", // i4 * n_i4
		]
	>();
	// ^ exists for float8 and numeric: numeric when a side is numeric and neither is a float; an untyped side takes the other's type
	expectTypeOf<
		Typed<
			Ops<"SELECT i4 ^ i4, n ^ i4, i4 ^ n, f4 ^ n, n ^ f8, i2 ^ f4, NULL ^ i4, n ^ NULL, NULL ^ n, NULL ^ NULL, f8 ^ NULL FROM o">
		>
	>().toEqualTypeOf<
		[
			"float8", // i4 ^ i4
			"numeric", // n ^ i4
			"numeric", // i4 ^ n
			"float8", // f4 ^ n
			"float8", // n ^ f8
			"float8", // i2 ^ f4
			"float8 | null", // NULL ^ i4
			"numeric | null", // n ^ NULL
			"numeric | null", // NULL ^ n
			"float8 | null", // NULL ^ NULL
			"float8 | null", // f8 ^ NULL
		]
	>();
	// an untyped side takes the other side's type
	expectTypeOf<
		Typed<
			Ops<"SELECT i2 + NULL, NULL * i8, n - NULL, f4 / NULL, NULL + f8, i4 % NULL, NULL % n FROM o">
		>
	>().toEqualTypeOf<
		[
			"int2 | null", // i2 + NULL
			"int8 | null", // NULL * i8
			"numeric | null", // n - NULL
			"float4 | null", // f4 / NULL
			"float8 | null", // NULL + f8
			"int4 | null", // i4 % NULL
			"numeric | null", // NULL % n
		]
	>();
});

test("numeric literals: int4 / int8 / numeric by value, in every radix (exact types)", () => {
	// leading zeros and digit separators do not count; a negated literal reaches -2^31 / -2^63
	expectTypeOf<
		Typed<
			Ops<"SELECT 0, 2147483647, 2147483648, 1000000000, 9999999999, 99999999999, 9223372036854775807, 9223372036854775808, 99999999999999999999, -2147483648, -2147483649, -9223372036854775808, -9223372036854775809, 1_000_000_000, 2_147_483_648, 00000000002147483647, 00000000002147483648, 000000000000000000009223372036854775808, 1.5, .5, 1e3, 1E3, -1E3, 0x7FFFFFFF, 0x80000000, -0x80000000, -0x80000001, 0x1E, 0xe, 0X1f, 0x7FFFFFFFFFFFFFFF, 0x8000000000000000, -0x8000000000000000, -0x8000000000000001, 0x7FFF_FFFF, 0x00000000000000000000001, 0o17777777777, 0o20000000000, -0o20000000000, -0o20000000001, 0o777777777777777777777, 0o1000000000000000000000, -0o1000000000000000000000, -0o1000000000000000000001, 0O7, 0b1111111111111111111111111111111, 0b10000000000000000000000000000000, -0b10000000000000000000000000000000, -0b10000000000000000000000000000001, 0b111111111111111111111111111111111111111111111111111111111111111, 0b1000000000000000000000000000000000000000000000000000000000000000, -0b1000000000000000000000000000000000000000000000000000000000000000, -0b1000000000000000000000000000000000000000000000000000000000000001, 0B1, 2147483646, 2147483657, 9223372036854775806, 9, 999999999, 10000000000, 10000000000000000000">
		>
	>().toEqualTypeOf<
		[
			"int4", // 0
			"int4", // 2147483647
			"int8", // 2147483648
			"int4", // 1000000000
			"int8", // 9999999999
			"int8", // 99999999999
			"int8", // 9223372036854775807
			"numeric", // 9223372036854775808
			"numeric", // 99999999999999999999
			"int4", // -2147483648
			"int8", // -2147483649
			"int8", // -9223372036854775808
			"numeric", // -9223372036854775809
			"int4", // 1_000_000_000
			"int8", // 2_147_483_648
			"int4", // 00000000002147483647
			"int8", // 00000000002147483648
			"numeric", // 000000000000000000009223372036854775808
			"numeric", // 1.5
			"numeric", // .5
			"numeric", // 1e3
			"numeric", // 1E3
			"numeric", // -1E3
			"int4", // 0x7FFFFFFF
			"int8", // 0x80000000
			"int4", // -0x80000000
			"int8", // -0x80000001
			"int4", // 0x1E
			"int4", // 0xe
			"int4", // 0X1f
			"int8", // 0x7FFFFFFFFFFFFFFF
			"numeric", // 0x8000000000000000
			"int8", // -0x8000000000000000
			"numeric", // -0x8000000000000001
			"int4", // 0x7FFF_FFFF
			"int4", // 0x00000000000000000000001
			"int4", // 0o17777777777
			"int8", // 0o20000000000
			"int4", // -0o20000000000
			"int8", // -0o20000000001
			"int8", // 0o777777777777777777777
			"numeric", // 0o1000000000000000000000
			"int8", // -0o1000000000000000000000
			"numeric", // -0o1000000000000000000001
			"int4", // 0O7
			"int4", // 0b1111111111111111111111111111111
			"int8", // 0b10000000000000000000000000000000
			"int4", // -0b10000000000000000000000000000000
			"int8", // -0b10000000000000000000000000000001
			"int8", // 0b111111111111111111111111111111111111111111111111111111111111111
			"numeric", // 0b1000000000000000000000000000000000000000000000000000000000000000
			"int8", // -0b1000000000000000000000000000000000000000000000000000000000000000
			"numeric", // -0b1000000000000000000000000000000000000000000000000000000000000001
			"int4", // 0B1
			"int4", // 2147483646
			"int8", // 2147483657
			"int8", // 9223372036854775806
			"int4", // 9
			"int4", // 999999999
			"int8", // 10000000000
			"numeric", // 10000000000000000000
		]
	>();
});

test("date/time arithmetic (exact types)", () => {
	expectTypeOf<
		Typed<
			Ops<"SELECT d + i4, i2 + d, d - i2, d - d, d + iv, d - iv, d + t, d + tz, d - ts, d - tstz, ts - ts, tstz - ts, ts - d, tstz - d, ts + iv, tstz - iv, t + iv, t - iv, t - t, t + d, tz + iv, tz - iv, tz + d, iv + iv, iv - iv, iv * i4, iv / f8, iv * n, i4 * iv, f4 * iv, iv + d, iv + ts, iv + tstz, iv + t, iv + tz FROM o">
		>
	>().toEqualTypeOf<
		[
			"date", // d + i4
			"date", // i2 + d
			"date", // d - i2
			"int4", // d - d
			"timestamp", // d + iv
			"timestamp", // d - iv
			"timestamp", // d + t
			"timestamptz", // d + tz
			"interval", // d - ts
			"interval", // d - tstz
			"interval", // ts - ts
			"interval", // tstz - ts
			"interval", // ts - d
			"interval", // tstz - d
			"timestamp", // ts + iv
			"timestamptz", // tstz - iv
			"time", // t + iv
			"time", // t - iv
			"interval", // t - t
			"timestamp", // t + d
			"timetz", // tz + iv
			"timetz", // tz - iv
			"timestamptz", // tz + d
			"interval", // iv + iv
			"interval", // iv - iv
			"interval", // iv * i4
			"interval", // iv / f8
			"interval", // iv * n
			"interval", // i4 * iv
			"interval", // f4 * iv
			"timestamp", // iv + d
			"timestamp", // iv + ts
			"timestamptz", // iv + tstz
			"time", // iv + t
			"timetz", // iv + tz
		]
	>();
	// a time with no operator of its own casts implicitly to interval
	expectTypeOf<
		Typed<
			Ops<"SELECT ts - t, tstz + t, d - t, iv - t, tz - t, t + tz, t * i4, f8 * t, t / n, - t FROM o">
		>
	>().toEqualTypeOf<
		[
			"timestamp", // ts - t
			"timestamptz", // tstz + t
			"timestamp", // d - t
			"interval", // iv - t
			"timetz", // tz - t
			"timetz", // t + tz
			"interval", // t * i4
			"interval", // f8 * t
			"interval", // t / n
			"interval", // - t
		]
	>();
	// an untyped side is first assumed to have the other side's type (ts - $1 is timestamp - timestamp), else the only candidate
	expectTypeOf<
		Typed<
			Ops<"SELECT d - NULL, NULL - d, ts - NULL, NULL + tstz, tstz - NULL, t + NULL, NULL - t, tz - NULL, iv + NULL, NULL - iv, iv * NULL, NULL * iv, iv / NULL, t * NULL, NULL * t, t / NULL FROM o">
		>
	>().toEqualTypeOf<
		[
			"int4 | null", // d - NULL
			"int4 | null", // NULL - d
			"interval | null", // ts - NULL
			"timestamptz | null", // NULL + tstz
			"interval | null", // tstz - NULL
			"time | null", // t + NULL
			"interval | null", // NULL - t
			"timetz | null", // tz - NULL
			"interval | null", // iv + NULL
			"interval | null", // NULL - iv
			"interval | null", // iv * NULL
			"interval | null", // NULL * iv
			"interval | null", // iv / NULL
			"interval | null", // t * NULL
			"interval | null", // NULL * t
			"interval | null", // t / NULL
		]
	>();
});

test("money, inet, jsonb, range and point arithmetic (exact types)", () => {
	// money / money is float8, so is money / $1
	expectTypeOf<
		Typed<
			Ops<"SELECT m + m, m - m, m / m, m * i4, m / f8, m * n, i4 * m, f4 * m, m + NULL, NULL - m, m * NULL, NULL * m, m / NULL, NULL / m FROM o">
		>
	>().toEqualTypeOf<
		[
			"money", // m + m
			"money", // m - m
			"float8", // m / m
			"money", // m * i4
			"money", // m / f8
			"money", // m * n
			"money", // i4 * m
			"money", // f4 * m
			"money | null", // m + NULL
			"money | null", // NULL - m
			"money | null", // m * NULL
			"money | null", // NULL * m
			"float8 | null", // m / NULL
			"float8 | null", // NULL / m
		]
	>();
	// inet ± integer, inet - inet → int8
	expectTypeOf<
		Typed<
			Ops<"SELECT ip + i4, cd - i8, ip - ip, ip - cd, i4 + ip, i2 + cd, ip + NULL, NULL + ip, ip - NULL, NULL - cd FROM o">
		>
	>().toEqualTypeOf<
		[
			"inet", // ip + i4
			"inet", // cd - i8
			"int8", // ip - ip
			"int8", // ip - cd
			"inet", // i4 + ip
			"inet", // i2 + cd
			"inet | null", // ip + NULL
			"inet | null", // NULL + ip
			"int8 | null", // ip - NULL
			"int8 | null", // NULL - cd
		]
	>();
	// jsonb - key / index / keys; range and multirange union, difference and intersection with their own type; point arithmetic
	expectTypeOf<
		Typed<
			Ops<"SELECT jb - txt, jb - vc, jb - i4, jb - i2, jb - ta, jb - NULL, r + r, r - r, r * r, mr + mr, mr * mr, r + NULL, NULL - mr, NULL * r, pt + pt, pt - pt, pt * pt, pt / pt, pt + NULL, NULL / pt FROM o">
		>
	>().toEqualTypeOf<
		[
			"jsonb", // jb - txt
			"jsonb", // jb - vc
			"jsonb", // jb - i4
			"jsonb", // jb - i2
			"jsonb", // jb - ta
			"jsonb | null", // jb - NULL
			"int4range", // r + r
			"int4range", // r - r
			"int4range", // r * r
			"int4multirange", // mr + mr
			"int4multirange", // mr * mr
			"int4range | null", // r + NULL
			"int4multirange | null", // NULL - mr
			"int4range | null", // NULL * r
			"point", // pt + pt
			"point", // pt - pt
			"point", // pt * pt
			"point", // pt / pt
			"point | null", // pt + NULL
			"point | null", // NULL / pt
		]
	>();
});

test("|| concatenation (exact types)", () => {
	// anynonarray || text: one side a string type or untyped
	expectTypeOf<
		Typed<
			Ops<"SELECT txt || txt, vc || i4, i4 || bp, nm || d, ch || i4, cit || i4, txt || NULL, NULL || i4, i4 || NULL, NULL || NULL, vc || b, n_txt || txt FROM o">
		>
	>().toEqualTypeOf<
		[
			"text", // txt || txt
			"text", // vc || i4
			"text", // i4 || bp
			"text", // nm || d
			"text", // ch || i4
			"text", // cit || i4
			"text | null", // txt || NULL
			"text | null", // NULL || i4
			"text | null", // i4 || NULL
			"text | null", // NULL || NULL
			"text", // vc || b
			"text | null", // n_txt || txt
		]
	>();
	// jsonb, bytea, tsvector, tsquery and bit strings (as varbit) concatenate within their type; with text they are text
	expectTypeOf<
		Typed<
			Ops<"SELECT jb || jb, jb || NULL, NULL || jb, jb || txt, vc || jb, n_jb || jb, by || by, by || NULL, NULL || by, by || txt, txt || by, tsv || tsv, tsv || NULL, NULL || tsv, tsq || tsq, tsq || NULL, NULL || tsq, tsv || txt, txt || tsq, b || b, b || vb, vb || NULL, NULL || b, b || txt FROM o">
		>
	>().toEqualTypeOf<
		[
			"jsonb", // jb || jb
			"jsonb | null", // jb || NULL
			"jsonb | null", // NULL || jb
			"text", // jb || txt
			"text", // vc || jb
			"jsonb | null", // n_jb || jb
			"bytea", // by || by
			"bytea | null", // by || NULL
			"bytea | null", // NULL || by
			"text", // by || txt
			"text", // txt || by
			"tsvector", // tsv || tsv
			"tsvector | null", // tsv || NULL
			"tsvector | null", // NULL || tsv
			"tsquery", // tsq || tsq
			"tsquery | null", // tsq || NULL
			"tsquery | null", // NULL || tsq
			"text", // tsv || txt
			"text", // txt || tsq
			"varbit", // b || b
			"varbit", // b || vb
			"varbit | null", // vb || NULL
			"varbit | null", // NULL || b
			"text", // b || txt
		]
	>();
	// arrays and elements of a common element type
	expectTypeOf<
		Typed<
			Ops<"SELECT ia || ia, ia || i4, i4 || ia, ia || NULL, NULL || ia, ia || NULL, ia || i8, i8 || ia, ia || f4, ta || vc, vc || ta, nm || ta, ta || nm, ARRAY[d] || ARRAY[ts] FROM o">
		>
	>().toEqualTypeOf<
		[
			"int4[]", // ia || ia
			"int4[]", // ia || i4
			"int4[]", // i4 || ia
			"int4[] | null", // ia || NULL
			"int4[] | null", // NULL || ia
			"int4[] | null", // ia || NULL
			"int8[]", // ia || i8
			"int8[]", // i8 || ia
			"float4[]", // ia || f4
			"text[]", // ta || vc
			"varchar[]", // vc || ta
			"name[]", // nm || ta
			"text[]", // ta || nm
			"timestamp[]", // ARRAY[d] || ARRAY[ts]
		]
	>();
});

test("bit, shift, tsquery and distance operators (exact types)", () => {
	// & | # promote integers; bit strings give bit (varbit casts to it); inet gives inet
	expectTypeOf<
		Typed<
			Ops<"SELECT i2 & i2, i2 | i4, i8 # i4, i4 & NULL, NULL | i8, NULL # i2, b & b, vb | b, vb # vb, b & NULL, NULL & vb, ip & ip, cd | ip, ip & NULL, NULL | cd, NULL & ip, ~ i8, ~ b, ~ vb, ~ ip, ~ cd FROM o">
		>
	>().toEqualTypeOf<
		[
			"int2", // i2 & i2
			"int4", // i2 | i4
			"int8", // i8 # i4
			"int4 | null", // i4 & NULL
			"int8 | null", // NULL | i8
			"int2 | null", // NULL # i2
			"bit", // b & b
			"bit", // vb | b
			"bit", // vb # vb
			"bit | null", // b & NULL
			"bit | null", // NULL & vb
			"inet", // ip & ip
			"inet", // cd | ip
			"inet | null", // ip & NULL
			"inet | null", // NULL | cd
			"inet | null", // NULL & ip
			"int8", // ~ i8
			"bit", // ~ b
			"bit", // ~ vb
			"inet", // ~ ip
			"inet", // ~ cd
		]
	>();
	// << >> shift integers and bit strings by an int4 ($1 << 2 is int4 << int4); otherwise strictly left / right of (bool)
	expectTypeOf<
		Typed<
			Ops<"SELECT i2 << i4, i8 >> i2, i4 << NULL, b << i4, vb >> i2, NULL << i4, r << r, ip << cd, ip >> ip, pt << pt, NULL >> r FROM o">
		>
	>().toEqualTypeOf<
		[
			"int2", // i2 << i4
			"int8", // i8 >> i2
			"int4 | null", // i4 << NULL
			"bit", // b << i4
			"bit", // vb >> i2
			"int4 | null", // NULL << i4
			"bool", // r << r
			"bool", // ip << cd
			"bool", // ip >> ip
			"bool", // pt << pt
			"bool | null", // NULL >> r
		]
	>();
	// && and <-> of tsqueries are tsqueries (the left side may be untyped); otherwise overlap (bool) and distance (float8)
	expectTypeOf<
		Typed<
			Ops<"SELECT tsq && tsq, NULL && tsq, tsq && NULL, r && r, NULL && r, ia && ia, tsq <-> tsq, NULL <-> tsq, pt <-> pt, pt ## ls FROM o">
		>
	>().toEqualTypeOf<
		[
			"tsquery", // tsq && tsq
			"tsquery | null", // NULL && tsq
			"tsquery | null", // tsq && NULL
			"bool", // r && r
			"bool | null", // NULL && r
			"bool", // ia && ia
			"tsquery", // tsq <-> tsq
			"tsquery | null", // NULL <-> tsq
			"float8", // pt <-> pt
			"point", // pt ## ls
		]
	>();
});

test("operators that yield bool, and JSON extraction (exact types and nullability)", () => {
	expectTypeOf<
		Typed<
			Ops<"SELECT i4 = i4, i4 < i8, i4 > n, i4 <= f8, i4 >= i2, i4 <> i4, i4 != i4, bo AND bo, bo OR bo, txt ~ txt, txt ~* txt, txt !~ txt, txt !~* txt, txt ~~ txt, txt ~~* txt, txt !~~ txt, txt !~~* txt, n_i4 = i4 FROM o">
		>
	>().toEqualTypeOf<
		[
			"bool", // i4 = i4
			"bool", // i4 < i8
			"bool", // i4 > n
			"bool", // i4 <= f8
			"bool", // i4 >= i2
			"bool", // i4 <> i4
			"bool", // i4 != i4
			"bool", // bo AND bo
			"bool", // bo OR bo
			"bool", // txt ~ txt
			"bool", // txt ~* txt
			"bool", // txt !~ txt
			"bool", // txt !~* txt
			"bool", // txt ~~ txt
			"bool", // txt ~~* txt
			"bool", // txt !~~ txt
			"bool", // txt !~~* txt
			"bool | null", // n_i4 = i4
		]
	>();
	// strict: nullable with a nullable operand; jsonb @@ jsonpath is NULL for a non-boolean result
	expectTypeOf<
		Typed<
			Ops<"SELECT jb @> jb, jb <@ jb, jb ? txt, jb ?| ta, jb ?& ta, jb @? jp, r -|- r, pt ~= pt, ia @> ia, tsv @@ tsq, jb @@ jp, n_jb @> jb FROM o">
		>
	>().toEqualTypeOf<
		[
			"bool", // jb @> jb
			"bool", // jb <@ jb
			"bool", // jb ? txt
			"bool", // jb ?| ta
			"bool", // jb ?& ta
			"bool", // jb @? jp
			"bool", // r -|- r
			"bool", // pt ~= pt
			"bool", // ia @> ia
			"bool", // tsv @@ tsq
			"bool | null", // jb @@ jp
			"bool | null", // n_jb @> jb
		]
	>();
	expectTypeOf<
		Typed<
			Ops<"SELECT bx <<| bx, bx |>> bx, bx &<| bx, bx |&> bx, pt <^ pt, pt >^ pt, r &< r, r &> r, ls ?# ls, pt ?- pt, ls ?-| ls, ls ?|| ls, ip <<= ip, ip >>= ip, (d, d) OVERLAPS (d, d) FROM o">
		>
	>().toEqualTypeOf<
		[
			"bool", // bx <<| bx
			"bool", // bx |>> bx
			"bool", // bx &<| bx
			"bool", // bx |&> bx
			"bool", // pt <^ pt
			"bool", // pt >^ pt
			"bool", // r &< r
			"bool", // r &> r
			"bool", // ls ?# ls
			"bool", // pt ?- pt
			"bool", // ls ?-| ls
			"bool", // ls ?|| ls
			"bool", // ip <<= ip
			"bool", // ip >>= ip
			"bool", // (d, d) OVERLAPS (d, d)
		]
	>();
	// -> ->> #> #>> are NULL for a missing key; #- is strict
	expectTypeOf<
		Typed<
			Ops<"SELECT jb -> 'a', j -> 'a', jb ->> 'a', j #> '{a}', jb #>> '{a}', jb #- '{a}', n_jb #- '{a}' FROM o">
		>
	>().toEqualTypeOf<
		[
			"jsonb | null", // jb -> 'a'
			"json | null", // j -> 'a'
			"text | null", // jb ->> 'a'
			"json | null", // j #> '{a}'
			"text | null", // jb #>> '{a}'
			"jsonb", // jb #- '{a}'
			"jsonb | null", // n_jb #- '{a}'
		]
	>();
});

test("prefix operators (exact types)", () => {
	// + and @ of an untyped operand are float8 (numeric's preferred type); - of one is ambiguous with interval; - of a time is an interval
	expectTypeOf<
		Typed<
			Ops<"SELECT - i2, - n, - f4, - iv, + i8, + f8, + NULL, + NULL, @ i2, @ f4, @ NULL, !! tsq, !! NULL, !! NULL, |/ f8, ||/ i4, @-@ ls, @@ bx, # pa, # pg, ?- ls, ?| ls, NOT bo, - n_i4 FROM o">
		>
	>().toEqualTypeOf<
		[
			"int2", // - i2
			"numeric", // - n
			"float4", // - f4
			"interval", // - iv
			"int8", // + i8
			"float8", // + f8
			"float8 | null", // + NULL
			"float8 | null", // + NULL
			"int2", // @ i2
			"float4", // @ f4
			"float8 | null", // @ NULL
			"tsquery", // !! tsq
			"tsquery | null", // !! NULL
			"tsquery | null", // !! NULL
			"float8", // |/ f8
			"float8", // ||/ i4
			"float8", // @-@ ls
			"point", // @@ bx
			"int4", // # pa
			"int4", // # pg
			"bool", // ?- ls
			"bool", // ?| ls
			"bool", // NOT bo
			"int4 | null", // - n_i4
		]
	>();
});

test("common types of two branches (COALESCE, CASE, UNION, ARRAY)", () => {
	// string types keep the first unless only it casts implicitly to the second (varchar → name); citext gives way to text and varchar
	expectTypeOf<
		Typed<
			Ops<"SELECT coalesce(i2, i2), coalesce(i2, i4), coalesce(i4, i8), coalesce(i8, n), coalesce(n, f4), coalesce(f4, f8), coalesce(f8, i2), coalesce(i4, f4), coalesce(txt, vc), coalesce(vc, txt), coalesce(vc, bp), coalesce(bp, vc), coalesce(txt, nm), coalesce(vc, nm), coalesce(bp, nm), coalesce(nm, txt), coalesce(nm, vc), coalesce(cit, txt), coalesce(cit, vc), coalesce(txt, cit), coalesce(vc, cit), coalesce(b, vb), coalesce(vb, b), coalesce(tstz, ts), coalesce(tstz, d), coalesce(ts, tstz), coalesce(ts, d), coalesce(d, ts), coalesce(d, tstz), coalesce(t, tz), coalesce(tz, t), coalesce(cd, ip), coalesce(ip, cd), coalesce(ia, ARRAY[i8]), coalesce(ta, ARRAY[vc]) FROM o">
		>
	>().toEqualTypeOf<
		[
			"int2", // coalesce(i2, i2)
			"int4", // coalesce(i2, i4)
			"int8", // coalesce(i4, i8)
			"numeric", // coalesce(i8, n)
			"float4", // coalesce(n, f4)
			"float8", // coalesce(f4, f8)
			"float8", // coalesce(f8, i2)
			"float4", // coalesce(i4, f4)
			"text", // coalesce(txt, vc)
			"varchar", // coalesce(vc, txt)
			"varchar", // coalesce(vc, bp)
			"bpchar", // coalesce(bp, vc)
			"text", // coalesce(txt, nm)
			"name", // coalesce(vc, nm)
			"name", // coalesce(bp, nm)
			"name", // coalesce(nm, txt)
			"name", // coalesce(nm, vc)
			"text", // coalesce(cit, txt)
			"varchar", // coalesce(cit, vc)
			"text", // coalesce(txt, cit)
			"varchar", // coalesce(vc, cit)
			"bit", // coalesce(b, vb)
			"varbit", // coalesce(vb, b)
			"timestamptz", // coalesce(tstz, ts)
			"timestamptz", // coalesce(tstz, d)
			"timestamptz", // coalesce(ts, tstz)
			"timestamp", // coalesce(ts, d)
			"timestamp", // coalesce(d, ts)
			"timestamptz", // coalesce(d, tstz)
			"timetz", // coalesce(t, tz)
			"timetz", // coalesce(tz, t)
			"inet", // coalesce(cd, ip)
			"inet", // coalesce(ip, cd)
			"int8[]", // coalesce(ia, ARRAY[i8])
			"text[]", // coalesce(ta, ARRAY[vc])
		]
	>();
	// a structured value keeps its shape with one of the same shape, not with plain jsonb
	expectTypeOf<
		OpsRow<"SELECT coalesce(jsonb_build_object('a', 1), jb) AS a, coalesce(jsonb_build_object('a', 1), jsonb_build_object('a', 1)) AS b FROM o">
	>().toEqualTypeOf<{ a: unknown; b: { a: number } }>();
	// a string literal takes the other branch's type, and a parameter among polymorphic
	// arguments the type of the others (a literal one gives way)
	expectTypeOf<Typed<Ops<"SELECT 1 UNION SELECT '2'">>>().toEqualTypeOf<
		[
			"int4", // 1 UNION SELECT '2'
		]
	>();
	expectTypeOf<Typed<Ops<"SELECT '1' UNION SELECT 2">>>().toEqualTypeOf<
		[
			"int4", // '1' UNION SELECT 2
		]
	>();
	expectTypeOf<
		[
			Params<"SELECT greatest($1, '1', 2)">,
			Params<"SELECT greatest($1, 2, '1')">,
		]
	>().toEqualTypeOf<[[number | null], [number | null]]>();
});

test("parameters as operands resolve like NULL and untyped literals", () => {
	// The parameters' own types are inferred as the other operand's type, which is not always the
	// argument type of the operator Postgres picks (`$1 ^ i4` is float8 ^ float8, `m * $3` money * float8):
	// a known disagreement in the types oracle's baseline.
	expectTypeOf<
		Typed<
			Ops<"SELECT $1 ^ i4, t * $2, m * $3, ip + $4, $5 + ip, cd - $6, $7 || $8, vb || $9, $10 & vb, + $11, @ $12, !! $13 FROM o">
		>
	>().toEqualTypeOf<
		[
			"float8 | null", // $1 ^ i4
			"interval | null", // t * $2
			"money | null", // m * $3
			"inet | null", // ip + $4
			"inet | null", // $5 + ip
			"int8 | null", // cd - $6
			"text | null", // $7 || $8
			"varbit | null", // vb || $9
			"bit | null", // $10 & vb
			"float8 | null", // + $11
			"float8 | null", // @ $12
			"tsquery | null", // !! $13
		]
	>();
});

test("combinations Postgres rejects yield unknown, never an error", () => {
	expectTypeOf<
		Typed<
			Ops<"SELECT $1 + $2, f8 % i4, i4 % f4, i4 + iv, i8 + d, i4 - d, i4 + m, n + ip, i4 - ip, i4 + txt, d * i4, d + d, d * iv, d * t, d - tz, d + ts, d - txt, ts + ts, ts * iv, ts + i4, t * iv, t * t, t - d, t + txt, tz * iv, tz - d, tz + txt, iv * iv, iv + i4, iv - d, iv - ts, iv + txt, m * m, m + i4, m * txt, ip * i4, ip + ip, ip - txt, jb - i8, jb + txt, r / r, r + mr, pt % pt, pt + i4, bo + pt FROM o">
		>
	>().toEqualTypeOf<
		[
			"unknown | null", // $1 + $2
			"unknown", // f8 % i4
			"unknown", // i4 % f4
			"unknown", // i4 + iv
			"unknown", // i8 + d
			"unknown", // i4 - d
			"unknown", // i4 + m
			"unknown", // n + ip
			"unknown", // i4 - ip
			"unknown", // i4 + txt
			"unknown", // d * i4
			"unknown", // d + d
			"unknown", // d * iv
			"unknown", // d * t
			"unknown", // d - tz
			"unknown", // d + ts
			"unknown", // d - txt
			"unknown", // ts + ts
			"unknown", // ts * iv
			"unknown", // ts + i4
			"unknown", // t * iv
			"unknown", // t * t
			"unknown", // t - d
			"unknown", // t + txt
			"unknown", // tz * iv
			"unknown", // tz - d
			"unknown", // tz + txt
			"unknown", // iv * iv
			"unknown", // iv + i4
			"unknown", // iv - d
			"unknown", // iv - ts
			"unknown", // iv + txt
			"unknown", // m * m
			"unknown", // m + i4
			"unknown", // m * txt
			"unknown", // ip * i4
			"unknown", // ip + ip
			"unknown", // ip - txt
			"unknown", // jb - i8
			"unknown", // jb + txt
			"unknown", // r / r
			"unknown", // r + mr
			"unknown", // pt % pt
			"unknown", // pt + i4
			"unknown", // bo + pt
		]
	>();
	// an untyped side with no (or more than one) candidate operator
	expectTypeOf<
		Typed<
			Ops<"SELECT f4 % $1, d + $2, ts * $3, tz + $4, $5 - tz, iv % $6, $7 / iv, m % $8, jb + $9, $10 - jb, r / $11, pt % $12, ip * $13, $14 + txt FROM o">
		>
	>().toEqualTypeOf<
		[
			"unknown | null", // f4 % $1
			"unknown | null", // d + $2
			"unknown | null", // ts * $3
			"unknown | null", // tz + $4
			"unknown | null", // $5 - tz
			"unknown | null", // iv % $6
			"unknown | null", // $7 / iv
			"unknown | null", // m % $8
			"unknown | null", // jb + $9
			"unknown | null", // $10 - jb
			"unknown | null", // r / $11
			"unknown | null", // pt % $12
			"unknown | null", // ip * $13
			"unknown | null", // $14 + txt
		]
	>();
	// (the last two: the left operand's operator decides, even when Postgres rejects the right one)
	expectTypeOf<
		Typed<
			Ops<"SELECT ip ^ i4, i4 & txt, $1 & txt, txt & i4, i4 || i4, jb || i4, ia || txt, txt -> 'a', i4 *= i4, - m, + iv, ~ txt, !! txt, @ txt, @@ $2, # i4, @#@ i4, r && tsq, ip << i4 FROM o">
		>
	>().toEqualTypeOf<
		[
			"unknown", // ip ^ i4
			"unknown", // i4 & txt
			"unknown | null", // $1 & txt
			"unknown", // txt & i4
			"unknown", // i4 || i4
			"unknown", // jb || i4
			"unknown", // ia || txt
			"unknown | null", // txt -> 'a'
			"unknown", // i4 *= i4
			"unknown", // - m
			"unknown", // + iv
			"unknown", // ~ txt
			"unknown", // !! txt
			"unknown", // @ txt
			"unknown | null", // @@ $2
			"unknown", // # i4
			"unknown | null", // @#@ i4
			"bool", // r && tsq
			"bool", // ip << i4
		]
	>();
	// no common type: "char" with other strings, citext with bpchar / name, time with timestamp or interval
	expectTypeOf<
		Typed<
			Ops<"SELECT coalesce(i4, txt), coalesce(txt, i4), coalesce(txt, ch), coalesce(ch, txt), coalesce(cit, bp), coalesce(cit, nm), coalesce(bp, cit), coalesce(nm, cit), coalesce(b, i4), coalesce(tstz, t), coalesce(ts, t), coalesce(d, t), coalesce(t, iv), coalesce(tz, iv), coalesce(cd, txt), coalesce(ip, txt), coalesce(ia, ta), coalesce(ia, i4), coalesce(j, jb) FROM o">
		>
	>().toEqualTypeOf<
		[
			"unknown", // coalesce(i4, txt)
			"unknown", // coalesce(txt, i4)
			"unknown", // coalesce(txt, ch)
			"unknown", // coalesce(ch, txt)
			"unknown", // coalesce(cit, bp)
			"unknown", // coalesce(cit, nm)
			"unknown", // coalesce(bp, cit)
			"unknown", // coalesce(nm, cit)
			"unknown", // coalesce(b, i4)
			"unknown", // coalesce(tstz, t)
			"unknown", // coalesce(ts, t)
			"unknown", // coalesce(d, t)
			"unknown", // coalesce(t, iv)
			"unknown", // coalesce(tz, iv)
			"unknown", // coalesce(cd, txt)
			"unknown", // coalesce(ip, txt)
			"unknown", // coalesce(ia, ta)
			"unknown", // coalesce(ia, i4)
			"unknown", // coalesce(j, jb)
		]
	>();
});
