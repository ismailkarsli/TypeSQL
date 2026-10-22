import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// Functions in FROM, verified against PostgreSQL 17. They are implicitly LATERAL. A
// set-returning function yields no row for NULL input, so its column is not nullable
// unless the function can return NULL elements.

test("generate_series", () => {
  expectTypeOf<Row<"SELECT * FROM generate_series(1, 3)">>().toEqualTypeOf<{ generate_series: number }>();
  expectTypeOf<Row<"SELECT * FROM generate_series(1, 3) g">>().toEqualTypeOf<{ g: number }>();
  expectTypeOf<Row<"SELECT g FROM generate_series(1, 3) AS g">>().toEqualTypeOf<{ g: number }>();
  expectTypeOf<Row<"SELECT n FROM generate_series(1::int8, 3) AS g(n)">>().toEqualTypeOf<{ n: string }>();
  expectTypeOf<Row<"SELECT * FROM generate_series(now(), now() + interval '1 day', interval '1 hour') AS d">>().toEqualTypeOf<{ d: Date }>();
  expectTypeOf<Row<"SELECT * FROM generate_series(1, NULL::int4) g">>().toEqualTypeOf<{ g: number }>();
  expectTypeOf<Row<"SELECT * FROM generate_series(1, 2) WITH ORDINALITY">>().toEqualTypeOf<{ generate_series: number; ordinality: string }>();
});

test("unnest, WITH ORDINALITY", () => {
  expectTypeOf<Row<"SELECT * FROM unnest(ARRAY['a', 'b'])">>().toEqualTypeOf<{ unnest: string }>();
  expectTypeOf<Row<"SELECT t FROM things, unnest(nums) t">>().toEqualTypeOf<{ t: number }>();
  expectTypeOf<Row<"SELECT * FROM unnest(ARRAY['a', 'b']) WITH ORDINALITY">>().toEqualTypeOf<{ unnest: string; ordinality: string }>();
  expectTypeOf<Row<"SELECT x, i FROM posts, unnest(tags) WITH ORDINALITY AS u(x, i)">>().toEqualTypeOf<{ x: string; i: string }>();
  expectTypeOf<Row<"SELECT * FROM unnest(ARRAY['a', 'b']) WITH ORDINALITY AS u(x)">>().toEqualTypeOf<{ x: string; ordinality: string }>();
  expectTypeOf<Row<"SELECT * FROM unnest(ARRAY['a', 'b']) WITH ORDINALITY u">>().toEqualTypeOf<{ u: string; ordinality: string }>();
  // several arrays: one column each, padded with NULLs
  expectTypeOf<Row<"SELECT * FROM unnest(ARRAY[1, 2], ARRAY['a']) AS u(n, s)">>().toEqualTypeOf<{ n: number | null; s: string | null }>();
});

test("JSON functions", () => {
  expectTypeOf<Row<"SELECT * FROM jsonb_array_elements('[1]')">>().toEqualTypeOf<{ value: unknown }>();
  expectTypeOf<Row<"SELECT e FROM posts, jsonb_array_elements(meta) AS e">>().toEqualTypeOf<{ e: unknown }>();
  expectTypeOf<Row<"SELECT * FROM jsonb_array_elements_text('[1]')">>().toEqualTypeOf<{ value: string | null }>();
  expectTypeOf<Row<"SELECT * FROM jsonb_each('{}')">>().toEqualTypeOf<{ key: string; value: unknown }>();
  expectTypeOf<Row<"SELECT * FROM jsonb_each('{}') j">>().toEqualTypeOf<{ key: string; value: unknown }>();
  expectTypeOf<Row<"SELECT k, v FROM jsonb_each('{}') AS j(k, v)">>().toEqualTypeOf<{ k: string; v: unknown }>();
  expectTypeOf<Row<"SELECT * FROM jsonb_each('{}') WITH ORDINALITY AS j(k)">>().toEqualTypeOf<{ k: string; value: unknown; ordinality: string }>();
  expectTypeOf<Row<"SELECT * FROM json_each_text('{}')">>().toEqualTypeOf<{ key: string; value: string | null }>();
  expectTypeOf<Row<"SELECT * FROM jsonb_object_keys('{}')">>().toEqualTypeOf<{ jsonb_object_keys: string }>();
  expectTypeOf<Row<"SELECT * FROM json_to_recordset('[]') AS (a int, b text)">>().toEqualTypeOf<{ a: number | null; b: string | null }>();
  expectTypeOf<Row<"SELECT r.a, r.b FROM json_to_record('{}') AS r(a int4, b text[])">>().toEqualTypeOf<{ a: number | null; b: string[] | null }>();
  expectTypeOf<Row<"SELECT x.id FROM posts p, jsonb_to_recordset(p.meta) AS x(id bigint, tag varchar(10))">>().toEqualTypeOf<{ id: string | null }>();
});

test("string functions and plain (non set-returning) functions", () => {
  expectTypeOf<Row<"SELECT * FROM string_to_table('a,b', ',')">>().toEqualTypeOf<{ string_to_table: string }>();
  expectTypeOf<Row<"SELECT * FROM string_to_table('a,b', ',') AS s">>().toEqualTypeOf<{ s: string }>();
  expectTypeOf<Row<"SELECT * FROM regexp_matches('ab', '(a)(b)')">>().toEqualTypeOf<{ regexp_matches: string[] }>();
  expectTypeOf<Row<"SELECT m FROM regexp_matches('ab', '(a)(b)', 'g') AS m">>().toEqualTypeOf<{ m: string[] }>();
  expectTypeOf<Row<"SELECT * FROM regexp_split_to_table('a b', ' ')">>().toEqualTypeOf<{ regexp_split_to_table: string }>();
  // a scalar function: one row, one column named after the alias or the function
  expectTypeOf<Row<"SELECT * FROM now()">>().toEqualTypeOf<{ now: Date }>();
  expectTypeOf<Row<"SELECT * FROM now() AS t">>().toEqualTypeOf<{ t: Date }>();
  expectTypeOf<Row<"SELECT * FROM now() AS t(x)">>().toEqualTypeOf<{ x: Date }>();
  expectTypeOf<Row<"SELECT * FROM lower('A') WITH ORDINALITY">>().toEqualTypeOf<{ lower: string; ordinality: string }>();
  expectTypeOf<Row<"SELECT l FROM users u, lower(u.display_name) l">>().toEqualTypeOf<{ l: string | null }>();
  // unknown functions are an error; with a column definition list the columns are known
  expectTypeOf<V<"SELECT * FROM my_unknown_srf(1) AS f">>().toEqualTypeOf<SqlError<"function my_unknown_srf(int4) does not exist. Declare it in the schema's $functions or in FunctionCatalog", 3>>();
  expectTypeOf<Row<"SELECT * FROM my_unknown_rec(1) AS f(a int4, b text)">>().toEqualTypeOf<{ a: number | null; b: string | null }>();
});

test("implicitly LATERAL", () => {
  expectTypeOf<Row<"SELECT p.id, t, g FROM posts p, unnest(p.tags) t, generate_series(1, p.author_id) g">>().toEqualTypeOf<{ id: string; t: string; g: number }>();
  expectTypeOf<Row<"SELECT p.id, t FROM posts p JOIN LATERAL unnest(p.tags) t ON true">>().toEqualTypeOf<{ id: string; t: string }>();
  expectTypeOf<Row<"SELECT p.id, t FROM posts p LEFT JOIN unnest(p.tags) t ON true">>().toEqualTypeOf<{ id: string; t: string | null }>();
});

test("errors", () => {
  expectTypeOf<V<"SELECT * FROM ROWS FROM (generate_series(1, 2), generate_series(3, 4))">>().toEqualTypeOf<SqlError<"ROWS FROM (...) is not supported", 3>>();
  expectTypeOf<V<"SELECT * FROM jsonb_to_recordset('[]')">>().toEqualTypeOf<SqlError<'a column definition list is required for functions returning "record"', 0>>();
  expectTypeOf<V<"SELECT * FROM json_to_recordset('[]') WITH ORDINALITY AS (a int, b text)">>()
    .toEqualTypeOf<SqlError<"WITH ORDINALITY cannot be used with a column definition list", 10>>();
  expectTypeOf<V<"SELECT * FROM generate_series(1, 2) AS g(a, b)">>().toEqualTypeOf<SqlError<'table "g" has 1 columns available but 2 columns specified', 10>>();
  expectTypeOf<V<"SELECT * FROM jsonb_each('{}') WITH ORDINALITY AS j(k, v, o, p)">>().toEqualTypeOf<SqlError<'table "j" has 3 columns available but 4 columns specified', 10>>();
  expectTypeOf<V<"SELECT * FROM generate_series(1, nope)">>().toEqualTypeOf<SqlError<'column "nope" does not exist', 7>>();
  expectTypeOf<V<"SELECT * FROM posts p, (SELECT t FROM unnest(p.tags) t) s">>().toEqualTypeOf<SqlError<'invalid reference to FROM-clause entry for table "p"', 4>>();
});
