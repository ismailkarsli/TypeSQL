import { expectTypeOf, test } from "vitest";
import type { DefaultTypeMap, RowOf, SqlError } from "../../src/index.js";
import type { DB, Row, V } from "./_schema.js";

// Typed JSON built in SQL, verified against PostgreSQL 17 through pg and postgres.js (see the
// JSON corpus in test/conformance). Inside JSON, values are serialized by Postgres: numbers
// (int8 and numeric included) are numbers, timestamps / dates / intervals / bytea / uuid are
// strings, enums are their values, arrays are arrays and nested JSON is embedded.

type User = { id: number; email: string; display_name: string | null; created_at: string };

test("json_build_object with literal keys is an object of the values' JSON types", () => {
  expectTypeOf<Row<"SELECT json_build_object('id', u.id, 'name', u.email, 'dn', u.display_name, 'at', u.created_at) AS o FROM users u">>()
    .toEqualTypeOf<{ o: { id: number; name: string; dn: string | null; at: string } }>();
  expectTypeOf<Row<"SELECT jsonb_build_object('big', big, 'price', price, 'day', day, 'dur', dur, 'bin', bin, 'uid', uid, 'mood', n_mood, 'nums', nums, 'flag', flag, 'data', data) AS o FROM things">>()
    .toEqualTypeOf<{ o: { big: number; price: number; day: string; dur: string; bin: string; uid: string; mood: "happy" | "sad" | null; nums: number[]; flag: boolean; data: unknown } }>();
  // literals, NULL, numeric keys, a repeated key (the last value wins), nesting
  expectTypeOf<Row<"SELECT json_build_object('s', 'x', 'n', NULL, 1, true, 'a', 1, 'a', 'two', 'in', json_build_object('k', 2.5)) AS o">>()
    .toEqualTypeOf<{ o: { s: string; n: null; "1": boolean; a: string; in: { k: number } } }>();
  expectTypeOf<Row<"SELECT json_build_object() AS o">>().toEqualTypeOf<{ o: Record<string, never> }>();
  // a key that is not a literal: plain JSON
  expectTypeOf<Row<"SELECT json_build_object(email, id) AS o FROM users">>().toEqualTypeOf<{ o: unknown }>();
  expectTypeOf<V<"SELECT json_build_object('a') AS o">>().toEqualTypeOf<SqlError<"argument list must have even number of elements", 0>>();
  expectTypeOf<V<"SELECT json_build_object(NULL, 1) AS o">>().toEqualTypeOf<SqlError<"null value not allowed for object key", 0>>();
});

test("json_build_array is a tuple, to_json a serialized value", () => {
  expectTypeOf<Row<"SELECT json_build_array(1, 'x', NULL, at) AS a, jsonb_build_array() AS b FROM things">>()
    .toEqualTypeOf<{ a: [number, string, null, string]; b: [] }>();
  expectTypeOf<Row<"SELECT to_json(id) AS a, to_jsonb(n_text) AS b, to_json(nums) AS c, array_to_json(words) AS d, to_json(now()) AS e, to_jsonb(mood) AS f FROM things">>()
    .toEqualTypeOf<{ a: number; b: string | null; c: number[]; d: string[]; e: string; f: "happy" | "sad" }>();
  expectTypeOf<Row<"SELECT to_json(u) AS a, row_to_json(u) AS b, to_jsonb(u.*) AS c FROM users u">>().toEqualTypeOf<{ a: User; b: User; c: User }>();
  // an anonymous ROW(...) has no column names the engine tracks
  expectTypeOf<Row<"SELECT row_to_json(ROW(1, 2)) AS r">>().toEqualTypeOf<{ r: unknown }>();
});

test("json_agg is an array of the argument (NULL elements kept), nullable unless the query is grouped", () => {
  expectTypeOf<Row<"SELECT json_agg(id) AS a, jsonb_agg(n_id) AS b, json_agg_strict(n_id) AS c FROM things">>()
    .toEqualTypeOf<{ a: number[] | null; b: (number | null)[] | null; c: number[] | null }>();
  expectTypeOf<Row<"SELECT id, json_agg(n_id) AS a, jsonb_agg_strict(n_id) AS b FROM things GROUP BY id">>()
    .toEqualTypeOf<{ id: number; a: (number | null)[]; b: number[] }>();
  // FILTER can leave a group empty
  expectTypeOf<Row<"SELECT json_agg(id) FILTER (WHERE flag) AS a FROM things GROUP BY id">>().toEqualTypeOf<{ a: number[] | null }>();
  expectTypeOf<Row<"SELECT json_agg(u ORDER BY u.id) AS a FROM users u">>().toEqualTypeOf<{ a: User[] | null }>();
  expectTypeOf<Row<"SELECT json_object_agg(label, n_id) AS a, jsonb_object_agg_strict(label, n_id) AS b FROM things GROUP BY id">>()
    .toEqualTypeOf<{ a: { [key: string]: number | null }; b: { [key: string]: number } }>();
});

test("nested JSON: correlated json_agg subqueries, coalesce with '[]'", () => {
  expectTypeOf<Row<`SELECT u.id,
      (SELECT json_agg(json_build_object('id', p.id, 'title', p.title, 'tags', p.tags) ORDER BY p.id)
       FROM posts p WHERE p.author_id = u.id) AS posts
    FROM users u`>>()
    .toEqualTypeOf<{ id: number; posts: { id: number; title: string; tags: string[] }[] | null }>();
  expectTypeOf<Row<"SELECT coalesce((SELECT json_agg(p) FROM posts p WHERE p.author_id = u.id), '[]') AS posts FROM users u">>()
    .toEqualTypeOf<{ posts: { id: number; author_id: number; title: string; body: string | null; tags: string[]; meta: unknown }[] }>();
  expectTypeOf<Row<"SELECT coalesce(json_agg(p.id), '[]'::json) AS a FROM posts p">>().toEqualTypeOf<{ a: number[] }>();
  // the outer side of a join: the row may be NULL and so may its columns
  expectTypeOf<Row<"SELECT u.id, json_agg(p.title) AS titles FROM users u LEFT JOIN posts p ON p.author_id = u.id GROUP BY u.id">>()
    .toEqualTypeOf<{ id: number; titles: (string | null)[] }>();
  expectTypeOf<Row<"SELECT ARRAY(SELECT json_build_object('id', id) FROM users) AS a">>().toEqualTypeOf<{ a: { id: number }[] }>();
});

test("branches merge: CASE, COALESCE, UNION", () => {
  expectTypeOf<Row<"SELECT json_build_object('a', 1) AS x UNION ALL SELECT json_build_object('b', 'x')">>()
    .toEqualTypeOf<{ x: { a: number } | { b: string } }>();
  expectTypeOf<Row<"SELECT CASE WHEN flag THEN json_build_object('a', 1) ELSE '{}' END AS a, coalesce(n_data, jsonb_build_object('a', 1)) AS b FROM things">>()
    .toEqualTypeOf<{ a: { a: number } | Record<string, never>; b: unknown }>();
  // a literal that is not one of [] {} null true false makes the value plain JSON
  expectTypeOf<Row<"SELECT coalesce(json_agg(id), '[1]') AS a FROM things">>().toEqualTypeOf<{ a: unknown }>();
  // json and jsonb have no common type
  expectTypeOf<Row<"SELECT coalesce(json_build_object('a', 1), jsonb_build_object('a', 1)) AS a">>().toEqualTypeOf<{ a: unknown }>();
});

test("->, #> and subscripts follow the shape; ->> and #>> are text", () => {
  expectTypeOf<Row<"SELECT j -> 'id' AS a, j -> 'nope' AS b, j ->> 'id' AS c, j -> 'tags' -> 0 AS d, j -> 'tags' -> -1 AS e, j #> '{tags,0}' AS f, j #>> '{tags,0}' AS g FROM (SELECT json_build_object('id', id, 'tags', tags) AS j FROM posts) s">>()
    .toEqualTypeOf<{ a: number | null; b: null; c: string | null; d: string | null; e: string | null; f: string | null; g: string | null }>();
  expectTypeOf<Row<"SELECT json_build_array(1, 'x') -> 1 AS a, json_build_array(1, 'x') -> 5 AS b, json_build_array(1, 'x') -> 'k' AS c, jsonb_build_object('a', 1) -> 0 AS d">>()
    .toEqualTypeOf<{ a: string | null; b: null; c: null; d: null }>();
  expectTypeOf<Row<"SELECT jsonb_build_object('a', jsonb_build_object('b', 2.5))['a']['b'] AS a, to_jsonb(u) -> 'email' AS b FROM users u">>()
    .toEqualTypeOf<{ a: number | null; b: string | null }>();
  // a non-literal key or index follows every key / element
  expectTypeOf<Row<"SELECT jsonb_build_object('a', 1, 'b', 'x') -> label AS a, jsonb_agg(id) OVER () -> id AS b FROM things">>()
    .toEqualTypeOf<{ a: number | string | null; b: number | null }>();
  // plain json stays unknown
  expectTypeOf<Row<"SELECT data -> 'a' AS a, data #> '{a,b}' AS b FROM things">>().toEqualTypeOf<{ a: unknown; b: unknown }>();
});

test("json(b)_array_elements yields the element type", () => {
  expectTypeOf<Row<"SELECT value FROM jsonb_array_elements(jsonb_build_array(1, 2))">>().toEqualTypeOf<{ value: number }>();
  expectTypeOf<Row<"SELECT e -> 'id' AS id FROM json_array_elements((SELECT json_agg(u) FROM users u)) AS e">>().toEqualTypeOf<{ id: number | null }>();
});

test("casts: json <-> jsonb keep the shape, text does not", () => {
  expectTypeOf<Row<"SELECT json_build_object('a', 1)::jsonb AS a, json_build_object('a', 1)::text AS b, '[]'::jsonb AS c, jsonb '{}' AS d, 'null'::json AS e">>()
    .toEqualTypeOf<{ a: { a: number }; b: string; c: []; d: Record<string, never>; e: null }>();
});

test("a type map that reads JSON as text keeps the text", () => {
  interface TextJson extends Omit<DefaultTypeMap, "json"> { json: string }
  expectTypeOf<RowOf<DB, TextJson, "SELECT json_build_object('a', 1) AS a, jsonb_build_object('a', 1) AS b">>()
    .toEqualTypeOf<{ a: string; b: { a: number } }>();
});
