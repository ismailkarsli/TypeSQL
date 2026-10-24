import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, Interval, V } from "./_schema.js";

// Every expectation here was checked against PostgreSQL 18 with `select pg_typeof(...)`.
// Default type map: int2/int4/float4/float8 → number, int8/numeric → string, date/timestamp(tz) → Date,
// time/timetz → string, interval → Interval, json(b) → unknown, bool → boolean.

test("numeric promotion follows Postgres operator resolution (float8 preferred)", () => {
  expectTypeOf<Row<"SELECT small + small AS a, small + id AS b, id + big AS c, id + price AS d FROM things">>()
    .toEqualTypeOf<{ a: number; b: number; c: string; d: string }>();
  // int4 + float4 → float8, float4 * float4 → float4, numeric + float8 → float8 (not numeric)
  expectTypeOf<Row<"SELECT id + score AS a, score * score AS b, price + ratio AS c, price * score AS d FROM things">>()
    .toEqualTypeOf<{ a: number; b: number; c: number; d: number }>();
  expectTypeOf<Row<"SELECT id / id AS a, big % id AS b, small * small AS c, price / 2 AS d FROM things">>()
    .toEqualTypeOf<{ a: number; b: string; c: number; d: string }>();
  // ^ : float8 unless numeric is involved
  expectTypeOf<Row<"SELECT id ^ id AS a, price ^ id AS b, ratio ^ 2 AS c, 2 ^ 3 AS d FROM things">>()
    .toEqualTypeOf<{ a: number; b: string; c: number; d: number }>();
  // untyped literal / NULL takes the other side
  expectTypeOf<Row<"SELECT id + '1' AS a, big * NULL AS b, 1 + 1 AS c FROM things">>()
    .toEqualTypeOf<{ a: number; b: string | null; c: number }>();
});

test("numeric literals: int4 / int8 / numeric by value", () => {
  expectTypeOf<Row<"SELECT 1 AS a, 999999999 AS b, 2147483647 AS c, 2147483648 AS d, 1000000000 AS e">>()
    .toEqualTypeOf<{ a: number; b: number; c: number; d: string; e: number }>();
  expectTypeOf<Row<"SELECT 9223372036854775807 AS a, 9223372036854775808 AS b, 1.5 AS c, 1e3 AS d, .5 AS e">>()
    .toEqualTypeOf<{ a: string; b: string; c: string; d: string; e: string }>();
  // -2147483648 is folded to an int4 constant like Postgres does
  expectTypeOf<Row<"SELECT -1 AS a, -2147483648 AS b, -2147483649 AS c, -1.5 AS d">>()
    .toEqualTypeOf<{ a: number; b: number; c: string; d: string }>();
});

test("|| concatenation: text, arrays, jsonb, bytea, tsvector, bit", () => {
  expectTypeOf<Row<"SELECT label || 'x' AS a, label || id AS b, id || label AS c, vc || vc AS d, uid || 'x' AS e, day || label AS f FROM things">>()
    .toEqualTypeOf<{ a: string; b: string; c: string; d: string; e: string; f: string }>();
  expectTypeOf<Row<"SELECT nums || 1 AS a, 1 || nums AS b, nums || nums AS c, words || 'x' AS d FROM things">>()
    .toEqualTypeOf<{ a: number[]; b: number[]; c: number[]; d: string[] }>();
  expectTypeOf<Row<"SELECT data || data AS a, data || '{}' AS b, data || label AS c, bin || bin AS d, tsv || tsv AS e FROM things">>()
    .toEqualTypeOf<{ a: unknown; b: unknown; c: string; d: Uint8Array; e: string }>();
  expectTypeOf<Row<"SELECT 'a' || 'b' AS a, label || NULL AS b FROM things">>()
    .toEqualTypeOf<{ a: string; b: string | null }>();
});

test("JSON operators", () => {
  // ->> / #>> → text, always nullable (missing key); -> / #> keep the json kind
  expectTypeOf<Row<"SELECT data ->> 'a' AS a, data #>> '{a}' AS b, doc ->> 0 AS c, data -> 'a' AS d, doc #> '{a}' AS e FROM things">>()
    .toEqualTypeOf<{ a: string | null; b: string | null; c: string | null; d: unknown; e: unknown }>();
  expectTypeOf<Row<"SELECT data - 'a' AS a, data - 1 AS b, data - words AS c, data #- '{a}' AS d FROM things">>()
    .toEqualTypeOf<{ a: unknown; b: unknown; c: unknown; d: unknown }>();
  expectTypeOf<Row<"SELECT data @> '{}' AS a, data <@ data AS b, data ? 'a' AS c, data ?| words AS d, data ?& words AS e, data @? '$.a' AS f FROM things">>()
    .toEqualTypeOf<{ a: boolean; b: boolean; c: boolean; d: boolean; e: boolean; f: boolean }>();
  // jsonb @@ jsonpath yields NULL for a non-boolean result
  expectTypeOf<Row<"SELECT data @@ '$.a' AS a FROM things">>().toEqualTypeOf<{ a: boolean | null }>();
});

test("date/time arithmetic", () => {
  expectTypeOf<Row<"SELECT day + 1 AS a, day - 1 AS b, day - day AS c, day + dur AS d, day - dur AS e, day + clock AS f, 1 + day AS g FROM things">>()
    .toEqualTypeOf<{ a: Date; b: Date; c: number; d: Date; e: Date; f: Date; g: Date }>();
  expectTypeOf<Row<"SELECT at - at AS a, ts - ts AS b, at - ts AS c, ts - day AS d, day - ts AS e, at + dur AS f, ts - dur AS g, dur + at AS h FROM things">>()
    .toEqualTypeOf<{ a: Interval; b: Interval; c: Interval; d: Interval; e: Interval; f: Date; g: Date; h: Date }>();
  expectTypeOf<Row<"SELECT dur + dur AS a, dur - dur AS b, dur * 2 AS c, dur / 2.5 AS d, 2 * dur AS e, -dur AS f, dur * ratio AS g FROM things">>()
    .toEqualTypeOf<{ a: Interval; b: Interval; c: Interval; d: Interval; e: Interval; f: Interval; g: Interval }>();
  expectTypeOf<Row<"SELECT clock + dur AS a, clock - clock AS b, dur + clock AS c, clock + day AS d FROM things">>()
    .toEqualTypeOf<{ a: string; b: Interval; c: string; d: Date }>();
  // a literal is first assumed to have the other side's type (`at - '2020-01-01'` is
  // timestamptz - timestamptz, so `at - '1 day'` is a Postgres error); otherwise the only candidate wins
  expectTypeOf<Row<"SELECT at + '1 day' AS a, at - '2020-01-01' AS b, dur * '2' AS c, day - '2020-01-01' AS d FROM things">>()
    .toEqualTypeOf<{ a: Date; b: Interval; c: Interval; d: number }>();
  // date + '1' is ambiguous in Postgres too
  expectTypeOf<Row<"SELECT day + '1' AS a FROM things">>().toEqualTypeOf<{ a: unknown }>();
});

test("AT TIME ZONE flips timestamp/timestamptz; EXTRACT → numeric, date_part → float8", () => {
  expectTypeOf<Row<"SELECT at AT TIME ZONE 'utc' AS a, ts AT TIME ZONE 'utc' AS b, clock AT TIME ZONE 'utc' AS c, day AT TIME ZONE 'utc' AS d FROM things">>()
    .toEqualTypeOf<{ a: Date; b: Date; c: string; d: Date }>();
  expectTypeOf<Row<"SELECT EXTRACT(year FROM at) AS a, EXTRACT(epoch FROM dur) AS b, date_part('year', at) AS c, EXTRACT(hour FROM n_at) AS d FROM things">>()
    .toEqualTypeOf<{ a: string; b: string; c: number; d: string | null }>();
});

test("comparison, pattern, containment and range operators → bool", () => {
  expectTypeOf<Row<"SELECT id = 1 AS a, id <> 2 AS b, label ~ 'x' AS c, label !~* 'x' AS d, label LIKE 'x' AS e, label ILIKE 'x' AS f, label SIMILAR TO 'x' AS g FROM things">>()
    .toEqualTypeOf<{ a: boolean; b: boolean; c: boolean; d: boolean; e: boolean; f: boolean; g: boolean }>();
  expectTypeOf<Row<"SELECT id BETWEEN 1 AND 2 AS a, id NOT BETWEEN 1 AND 2 AS b, id IN (1, 2) AS c, id NOT IN (1, 2) AS d, id = ANY(nums) AS e, id <> ALL(nums) AS f FROM things">>()
    .toEqualTypeOf<{ a: boolean; b: boolean; c: boolean; d: boolean; e: boolean; f: boolean }>();
  expectTypeOf<Row<"SELECT nums @> nums AS a, nums && nums AS b, nums <@ nums AS c, rng @> 1 AS d, rng << rng AS e, rng -|- rng AS f, rng && rng AS g, tsv @@ to_tsquery('x') AS h FROM things">>()
    .toEqualTypeOf<{ a: boolean; b: boolean; c: boolean; d: boolean; e: boolean; f: boolean; g: boolean; h: boolean }>();
  // range arithmetic keeps the range type
  expectTypeOf<Row<"SELECT rng * rng AS a, rng + rng AS b, rng - rng AS c FROM things">>()
    .toEqualTypeOf<{ a: string; b: string; c: string }>();
  expectTypeOf<Row<"SELECT day < at AS a, day = '2020-01-01' AS b, uid = 'x' AS c FROM things">>()
    .toEqualTypeOf<{ a: boolean; b: boolean; c: boolean }>();
});

test("bit, shift and unary operators", () => {
  expectTypeOf<Row<"SELECT id & id AS a, id | big AS b, id # small AS c, id << 2 AS d, big >> 1 AS e, ~id AS f, ~small AS g FROM things">>()
    .toEqualTypeOf<{ a: number; b: string; c: number; d: number; e: string; f: number; g: number }>();
  expectTypeOf<Row<"SELECT -id AS a, +id AS b, -price AS c, -score AS d, @ id AS e, @ price AS f, |/ id AS g, ||/ price AS h, -big AS i FROM things">>()
    .toEqualTypeOf<{ a: number; b: number; c: string; d: number; e: number; f: string; g: number; h: number; i: string }>();
  expectTypeOf<Row<"SELECT !! to_tsquery('x') AS a FROM things">>().toEqualTypeOf<{ a: string }>();
});

test("arrays, subscripts, slices, ARRAY / ROW constructors", () => {
  // subscript always nullable (out of range → NULL); slice keeps the array type
  expectTypeOf<Row<"SELECT nums[1] AS a, nums[1:2] AS b, words[1] AS c, n_nums[1] AS d, n_nums[1:2] AS e, (ARRAY[1])[1] AS f FROM things">>()
    .toEqualTypeOf<{ a: number | null; b: number[]; c: string | null; d: number | null; e: number[] | null; f: number | null }>();
  expectTypeOf<Row<"SELECT ARRAY[1, 2] AS a, ARRAY[1, 2.5] AS b, ARRAY['a', 'b'] AS c, ARRAY[id, big] AS d, ARRAY[nums] AS e, ARRAY[n_id] AS f, ARRAY(SELECT id FROM users) AS g FROM things">>()
    .toEqualTypeOf<{ a: number[]; b: string[]; c: string[]; d: string[]; e: number[]; f: number[]; g: number[] }>();
  expectTypeOf<Row<"SELECT ROW(1, 'a') AS a, (1, 2) AS b, ROW(n_id) AS c FROM things">>()
    .toEqualTypeOf<{ a: unknown; b: unknown; c: unknown }>();
  expectTypeOf<Row<"SELECT data[0] AS a, doc['a'] AS b FROM things">>().toEqualTypeOf<{ a: unknown; b: unknown }>();
});

test("casts and typed literals", () => {
  expectTypeOf<Row<"SELECT id::text AS a, label::int4 AS b, n_text::int8 AS c, CAST(price AS float8) AS d, '{1}'::int[] AS e, id::numeric(10, 2) AS f, big::bigint AS g FROM things">>()
    .toEqualTypeOf<{ a: string; b: number; c: string | null; d: number; e: number[]; f: string; g: string }>();
  expectTypeOf<Row<"SELECT interval '1 day' AS a, date '2020-01-01' AS b, timestamptz '2020-01-01' AS c, int4 '1' AS d, numeric '1.5' AS e, bool 'true' AS f, time '12:00' AS g">>()
    .toEqualTypeOf<{ a: Interval; b: Date; c: Date; d: number; e: string; f: boolean; g: string }>();
  expectTypeOf<Row<"SELECT id::mood AS a, n_text::mood AS b FROM things">>().toEqualTypeOf<{ a: "happy" | "sad"; b: "happy" | "sad" | null }>();
});

test("unsupported combinations yield unknown, never an error", () => {
  expectTypeOf<Row<"SELECT flag + flag AS a, day * 2 AS b, at + at AS c, nums + nums AS d, id + label AS e FROM things">>()
    .toEqualTypeOf<{ a: unknown; b: unknown; c: unknown; d: unknown; e: unknown }>();
});

test("any operator: prefix operators bind looser than arithmetic, unknown operators type as unknown", () => {
  // `@ a + b` is `@ (a + b)` in Postgres (prefix operators take `%prec Op`); `-` binds tightest
  expectTypeOf<Row<"SELECT @ small + small AS a, - small + 1 AS b, |/ ratio AS c FROM things">>()
    .toEqualTypeOf<{ a: number; b: number; c: number }>();
  // user-defined operators parse; their result is unknown until cast
  expectTypeOf<Row<"SELECT id *= id AS a, (id ~<~ id)::bool AS b, @#@ id AS c, OPERATOR(pg_catalog.+) id AS d FROM things">>()
    .toEqualTypeOf<{ a: unknown; b: boolean; c: unknown; d: unknown }>();
  // MathOp tokens cannot be prefix operators
  expectTypeOf<V<"SELECT < id FROM things">>().toEqualTypeOf<SqlError<"syntax error at or near <", 1>>();
});
