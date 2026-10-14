import { expectTypeOf, test } from "vitest";
import type { Row, Interval } from "./_schema.js";

// Output column names follow Postgres's FigureColname; every case below was checked
// against PostgreSQL 17 by reading the result headers.

test("literals and operators are ?column?; the last duplicate wins", () => {
  expectTypeOf<Row<"SELECT 1, 'a', true, 1.5, NULL FROM users">>().toEqualTypeOf<{ "?column?": null }>();
  expectTypeOf<Row<"SELECT -1, 1 + 1, NOT true, 1 IS NULL, 1 IN (1), 'a' LIKE 'b', 1 BETWEEN 0 AND 2">>().toEqualTypeOf<{ "?column?": boolean }>();
  expectTypeOf<Row<"SELECT id + 1, id FROM users">>().toEqualTypeOf<{ "?column?": number; id: number }>();
  expectTypeOf<Row<"SELECT $1::text, 1 AS one, 1 AS one FROM users">>().toEqualTypeOf<{ text: string; one: number }>();
});

test("function calls are named after the function; special-syntax functions use their internal name", () => {
  expectTypeOf<Row<"SELECT lower('x'), coalesce(1, 2), nullif(1, 2), greatest(1, 2), least(1, 2), count(*), now() FROM users">>()
    .toEqualTypeOf<{ lower: string; coalesce: number; nullif: number | null; greatest: number; least: number; count: string; now: Date }>();
  expectTypeOf<Row<"SELECT EXTRACT(year FROM now()), substring('abc' FROM 1), substring('abc', 1, 2), trim('x'), trim(both 'x' FROM 'y'), position('a' IN 'abc'), overlay('abc' PLACING 'x' FROM 1)">>()
    .toEqualTypeOf<{ extract: string; substring: string; btrim: string; position: number; overlay: string }>();
  expectTypeOf<Row<"SELECT count(*) FILTER (WHERE true), string_agg(email, ','), array_agg(DISTINCT id), percentile_cont(0.5) WITHIN GROUP (ORDER BY id), mode() WITHIN GROUP (ORDER BY id) FROM users">>()
    .toEqualTypeOf<{ count: string; string_agg: string | null; array_agg: number[] | null; percentile_cont: number | null; mode: number | null }>();
  expectTypeOf<Row<"SELECT sum(id) OVER (), row_number() OVER (), lag(id) OVER (ORDER BY id) FROM users">>()
    .toEqualTypeOf<{ sum: string; row_number: string; lag: number | null }>();
});

test("special value functions keep their keyword name", () => {
  expectTypeOf<Row<"SELECT current_date, current_time, current_timestamp, current_timestamp(3), localtime, localtimestamp">>()
    .toEqualTypeOf<{ current_date: Date; current_time: string; current_timestamp: Date; localtime: string; localtimestamp: Date }>();
  expectTypeOf<Row<"SELECT current_user, current_role, session_user, user, current_catalog, current_schema, current_schema()">>()
    .toEqualTypeOf<{ current_user: string; current_role: string; session_user: string; user: string; current_catalog: string; current_schema: string }>();
});

test("typed literals are named after the type", () => {
  expectTypeOf<Row<"SELECT interval '1 day', interval '1 day' hour to minute, date '2020-01-01', timestamp '2020-01-01', timestamptz '2020-01-01', time '12:00'">>()
    .toEqualTypeOf<{ interval: Interval; date: Date; timestamp: Date; timestamptz: Date; time: string }>();
  expectTypeOf<Row<"SELECT int4 '1', text 'a', numeric '1.5', bool 'true'">>()
    .toEqualTypeOf<{ int4: number; text: string; numeric: string; bool: boolean }>();
});

test("casts: inner name if any, else the outermost type's canonical name (array suffix stripped)", () => {
  expectTypeOf<Row<"SELECT 1::int, 1::bigint, 'a'::text, 'a'::varchar, 'a'::char, 1::double precision, 1::boolean, 1::numeric(10, 2), 1::real, 1::smallint">>()
    .toEqualTypeOf<{ int4: number; int8: string; text: string; varchar: string; bpchar: string; float8: number; bool: boolean; numeric: string; float4: number; int2: number }>();
  expectTypeOf<Row<"SELECT '{1}'::int[], '{a}'::text[], (1 + 1)::text AS plus, CAST(1 AS text) AS c, '2020-01-01'::timestamptz">>()
    .toEqualTypeOf<{ int4: number[]; text: string[]; plus: string; c: string; timestamptz: Date }>();
  expectTypeOf<Row<"SELECT id::text, now()::date, (id + 1)::int8, (lower(email))::varchar, ARRAY['a']::varchar[] FROM users">>()
    .toEqualTypeOf<{ id: string; now: Date; int8: string; lower: string; array: string[] }>();
  // nested casts: innermost real name, else the OUTERMOST type
  expectTypeOf<Row<"SELECT 1::int4::int8, 'a'::text::varchar, now()::date::text, (now()::date)::text AS p, CAST(CAST(1 AS int8) AS text) AS cc">>()
    .toEqualTypeOf<{ int8: string; varchar: string; now: string; p: string; cc: string }>();
  // typed literals are casts of constants, so an outer cast renames them
  expectTypeOf<Row<"SELECT interval '1 day'::text, (date '2020-01-01')::text AS d">>().toEqualTypeOf<{ text: string; d: string }>();
  // CASE's own name is weak (a cast replaces it); a scalar subquery's name is strong, even ?column?
  expectTypeOf<Row<"SELECT (CASE WHEN true THEN 1 END)::text, (SELECT 1)::text AS s, (SELECT id FROM users LIMIT 1)::text FROM users">>()
    .toEqualTypeOf<{ text: string | null; s: string | null; id: string | null }>();
  expectTypeOf<Row<"SELECT (SELECT 1)::text FROM users">>().toEqualTypeOf<{ "?column?": string | null }>();
  // -1::int is a negated cast, not a cast of -1
  expectTypeOf<Row<"SELECT -1::int, (-1)::int AS p">>().toEqualTypeOf<{ "?column?": number; p: number }>();
});

test("CASE takes the ELSE branch's name when it is a real name", () => {
  expectTypeOf<Row<"SELECT CASE WHEN true THEN 1 ELSE id END, CASE WHEN true THEN 'a' ELSE lower(email) END FROM users">>()
    .toEqualTypeOf<{ id: number; lower: string }>();
  expectTypeOf<Row<"SELECT CASE WHEN true THEN id END, CASE WHEN true THEN 1 ELSE -id END AS b, CASE WHEN true THEN 1 ELSE 1::int END AS c, (CASE WHEN true THEN 1 ELSE id END)::text AS d FROM users">>()
    .toEqualTypeOf<{ case: number | null; b: number; c: number; d: string }>();
  expectTypeOf<Row<"SELECT CASE WHEN true THEN 1 ELSE 1::int END, CASE WHEN true THEN 1 ELSE (SELECT 1) END AS s FROM users">>()
    .toEqualTypeOf<{ case: number; s: number | null }>();
});

test("CASE, subqueries, EXISTS, ARRAY, ROW, AT TIME ZONE", () => {
  expectTypeOf<Row<"SELECT CASE WHEN true THEN 1 END, (SELECT 1), (SELECT 1 AS x), (SELECT id FROM users LIMIT 1), EXISTS(SELECT 1) FROM users">>()
    .toEqualTypeOf<{ case: number | null; "?column?": number | null; x: number | null; id: number | null; exists: boolean }>();
  expectTypeOf<Row<"SELECT now() AT TIME ZONE 'utc', ARRAY[1], ARRAY(SELECT 1), ROW(1), (1, 2)">>()
    .toEqualTypeOf<{ timezone: Date; array: number[]; row: unknown }>();
});

test("subscripts, slices, field access and COLLATE take the base expression's name", () => {
  expectTypeOf<Row<"SELECT (ARRAY[1])[1], nums[1:2], t.nums[1], (ROW(1, 2)).f1, label COLLATE \"C\", 'a' COLLATE \"C\", data -> 'a' FROM things t">>()
    .toEqualTypeOf<{ array: number | null; nums: number | null; f1: unknown; label: string; "?column?": unknown }>();
});

test("aliases: AS, bare, quoted (case preserved), unquoted (folded)", () => {
  expectTypeOf<Row<"SELECT 1 AS \"A\", 1 AS a, CAST(1 AS text) AS \"Alias\", 1 \"bare\", 1 bare2, 1 AS Folded FROM users">>()
    .toEqualTypeOf<{ A: number; a: number; Alias: string; bare: number; bare2: number; folded: number }>();
  expectTypeOf<Row<"SELECT u.id, u.*, \"Quoted\" FROM (SELECT 1 AS id, 2 AS \"Quoted\") u">>().toEqualTypeOf<{ id: number; Quoted: number }>();
  expectTypeOf<Row<"SELECT x FROM (SELECT 1) AS s(x)">>().toEqualTypeOf<{ x: number }>();
});

test("enums resolve through $types", () => {
  expectTypeOf<Row<"SELECT mood, n_mood FROM things">>().toEqualTypeOf<{ mood: "happy" | "sad"; n_mood: "happy" | "sad" | null }>();
});
