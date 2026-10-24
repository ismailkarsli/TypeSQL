import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Params, Row, V } from "./_schema.js";

// SQL/JSON syntax of PostgreSQL 16–18 (constructors, aggregates, query functions, IS JSON,
// JSON_TABLE), checked against PostgreSQL 18's regression tests (sqljson*.sql). Output columns
// are named like functions (`json_object`, `json_value`, …). `k : v` pairs are written with
// VALUE here: `: name` is the named-parameter sugar.

test("JSON, JSON_SCALAR, JSON_SERIALIZE", () => {
  expectTypeOf<Row<"SELECT JSON('[]') AS a, JSON(n_text) AS b, JSON(label FORMAT JSON WITH UNIQUE KEYS) AS c FROM things">>()
    .toEqualTypeOf<{ a: []; b: unknown; c: unknown }>();
  expectTypeOf<Row<"SELECT JSON_SCALAR(id) AS a, JSON_SCALAR(n_at) AS b, JSON_SCALAR(label) FROM things">>()
    .toEqualTypeOf<{ a: number; b: string | null; json_scalar: string }>();
  expectTypeOf<Row<"SELECT JSON_SERIALIZE(doc), JSON_SERIALIZE(n_data RETURNING bytea) AS b, JSON_SERIALIZE(data RETURNING varchar(10)) AS c FROM things">>()
    .toEqualTypeOf<{ json_serialize: string; b: Uint8Array | null; c: string }>();
  expectTypeOf<V<"SELECT JSON(id) FROM things">>().toEqualTypeOf<SqlError<"cannot cast type integer to json", 0>>();
  expectTypeOf<V<"SELECT JSON_SERIALIZE('1' RETURNING jsonb)">>().toEqualTypeOf<SqlError<"cannot use type jsonb in RETURNING clause of JSON_SERIALIZE()", 0>>();
  // JSON() needs an argument
  expectTypeOf<V<"SELECT JSON()">>().toEqualTypeOf<SqlError<"syntax error at or near )", 3>>();
});

test("JSON_OBJECT is an object like json_build_object, never NULL", () => {
  expectTypeOf<Row<"SELECT JSON_OBJECT('a' VALUE id, 'b' VALUE n_text, 1.5 VALUE flag) FROM things">>()
    .toEqualTypeOf<{ json_object: { a: number; b: string | null; "1.5": boolean } }>();
  expectTypeOf<Row<"SELECT JSON_OBJECT('a': 1, 'b': 'x' RETURNING jsonb) AS o, JSON_OBJECT() AS e, JSON_OBJECT(RETURNING jsonb) AS f">>()
    .toEqualTypeOf<{ o: { a: number; b: string }; e: Record<string, never>; f: Record<string, never> }>();
  // FORMAT JSON embeds the text as JSON; ABSENT ON NULL can leave a key out; other RETURNING types
  expectTypeOf<Row<"SELECT JSON_OBJECT('d' VALUE label FORMAT JSON) AS a, JSON_OBJECT('n' VALUE n_id ABSENT ON NULL) AS b, JSON_OBJECT('n' VALUE id ABSENT ON NULL WITH UNIQUE KEYS) AS c, JSON_OBJECT('a': 1 RETURNING text) AS d FROM things">>()
    .toEqualTypeOf<{ a: { d: unknown }; b: unknown; c: { n: number }; d: string }>();
  // a key that is not a literal: plain JSON; json_object(text[]) is the ordinary function
  expectTypeOf<Row<"SELECT JSON_OBJECT(label VALUE id) AS a, json_object('{a,1}') AS b FROM things">>().toEqualTypeOf<{ a: unknown; b: unknown }>();
  expectTypeOf<V<"SELECT JSON_OBJECT(NULL: 1)">>().toEqualTypeOf<SqlError<"null value not allowed for object key", 0>>();
  expectTypeOf<V<"SELECT JSON_OBJECT(nums VALUE 1) FROM things">>().toEqualTypeOf<SqlError<"key value must be scalar, not array, composite, or json", 0>>();
  expectTypeOf<V<"SELECT JSON_OBJECT('a' VALUE id FORMAT JSON) FROM things">>().toEqualTypeOf<SqlError<"cannot use non-string types with explicit FORMAT JSON clause", 0>>();
});

test("JSON_ARRAY: a tuple of the values (NULLs skipped by default), or a query's column", () => {
  expectTypeOf<Row<"SELECT JSON_ARRAY(id, label) AS a, JSON_ARRAY(id, n_text NULL ON NULL RETURNING jsonb) AS b, JSON_ARRAY(id, n_text) AS c, JSON_ARRAY() AS d FROM things">>()
    .toEqualTypeOf<{ a: [number, string]; b: [number, string | null]; c: unknown; d: [] }>();
  // JSON_ARRAY(query) is a scalar subquery aggregating the column: NULL when there are no rows
  expectTypeOf<Row<"SELECT JSON_ARRAY(SELECT n_id FROM things ORDER BY 1) AS a, JSON_ARRAY(VALUES (1), (2) RETURNING text) AS b">>()
    .toEqualTypeOf<{ a: number[] | null; b: string | null }>();
  expectTypeOf<V<"SELECT JSON_ARRAY(SELECT 1, 2)">>().toEqualTypeOf<SqlError<"subquery must return only one column", 0>>();
});

test("JSON_ARRAYAGG / JSON_OBJECTAGG are json_agg / json_object_agg", () => {
  expectTypeOf<Row<"SELECT JSON_ARRAYAGG(n_id) AS a, JSON_ARRAYAGG(n_id NULL ON NULL RETURNING jsonb) AS b, JSON_OBJECTAGG(label VALUE n_id) AS c, JSON_OBJECTAGG(label VALUE id ABSENT ON NULL WITH UNIQUE KEYS RETURNING text) AS d FROM things">>()
    .toEqualTypeOf<{ a: number[] | null; b: (number | null)[] | null; c: { [key: string]: number | null } | null; d: string | null }>();
  expectTypeOf<Row<"SELECT id, JSON_ARRAYAGG(label ORDER BY label DESC) AS a, JSON_ARRAYAGG(id) FILTER (WHERE flag) AS b, JSON_OBJECTAGG(label VALUE id) OVER (ORDER BY id) AS c FROM things GROUP BY id, label">>()
    .toEqualTypeOf<{ id: number; a: string[]; b: number[] | null; c: { [key: string]: number } }>();
  expectTypeOf<Row<"SELECT JSON_ARRAYAGG(label), JSON_OBJECTAGG(label VALUE 1) FROM things">>()
    .toEqualTypeOf<{ json_arrayagg: string[] | null; json_objectagg: { [key: string]: number } | null }>();
});

test("JSON_EXISTS, JSON_VALUE, JSON_QUERY", () => {
  expectTypeOf<Row<"SELECT JSON_EXISTS(data, '$.a') AS a, JSON_EXISTS(n_data, '$.a ? (@ > $x)' PASSING id AS x) AS b, JSON_EXISTS(data, 'strict $.a' UNKNOWN ON ERROR) AS c FROM things">>()
    .toEqualTypeOf<{ a: boolean; b: boolean | null; c: boolean | null }>();
  expectTypeOf<Row<"SELECT JSON_VALUE(data, '$.a'), JSON_VALUE(doc, '$.a' RETURNING int DEFAULT -1 ON EMPTY ERROR ON ERROR) AS b, JSON_VALUE(data, '$.d' RETURNING date) AS c FROM things">>()
    .toEqualTypeOf<{ json_value: string | null; b: number | null; c: Date | null }>();
  expectTypeOf<Row<"SELECT JSON_QUERY(data, '$.a' WITH CONDITIONAL WRAPPER EMPTY ARRAY ON EMPTY), JSON_QUERY(data, '$.a' RETURNING text OMIT QUOTES ON SCALAR STRING) AS b, JSON_QUERY(label FORMAT JSON, '$' RETURNING int[]) AS c FROM things">>()
    .toEqualTypeOf<{ json_query: unknown; b: string | null; c: number[] | null }>();
  // JSON_EXISTS has no ON EMPTY
  expectTypeOf<V<"SELECT JSON_EXISTS(data, '$.a' FALSE ON EMPTY) FROM things">>().toEqualTypeOf<SqlError<"syntax error at or near empty", 8>>();
});

test("IS JSON", () => {
  expectTypeOf<Row<"SELECT label IS JSON AS a, n_text IS NOT JSON OBJECT WITH UNIQUE KEYS AS b, data IS JSON ARRAY, bin IS JSON SCALAR AS d FROM things">>()
    .toEqualTypeOf<{ a: boolean; b: boolean | null; "?column?": boolean; d: boolean }>();
  expectTypeOf<V<"SELECT id IS JSON FROM things">>().toEqualTypeOf<SqlError<"cannot use type integer in IS JSON predicate", 0>>();
});

test("JSON_TABLE: declared column types, nullable; nested paths' columns last", () => {
  expectTypeOf<Row<`SELECT * FROM JSON_TABLE(jsonb '[]', '$[*]' COLUMNS (
      n FOR ORDINALITY,
      NESTED PATH '$.c[*]' AS pc COLUMNS (cn FOR ORDINALITY, c numeric PATH '$'),
      a int PATH '$.a' DEFAULT 0 ON EMPTY,
      b text FORMAT JSON PATH '$.b' WITH WRAPPER,
      e bool EXISTS PATH '$.e' ERROR ON ERROR
    ) ERROR ON ERROR) AS jt`>>()
    .toEqualTypeOf<{ n: number; a: number | null; b: string | null; e: boolean | null; cn: number | null; c: string | null }>();
  // implicitly LATERAL; the default alias is json_table; column aliases rename
  expectTypeOf<Row<"SELECT t.id, j.x FROM things t LEFT JOIN JSON_TABLE(t.data, '$' COLUMNS (a text)) j(x) ON true">>()
    .toEqualTypeOf<{ id: number; x: string | null }>();
  expectTypeOf<Row<"SELECT json_table.v FROM things, JSON_TABLE(doc, '$' COLUMNS (v date))">>().toEqualTypeOf<{ v: Date | null }>();
  expectTypeOf<V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' AS a COLUMNS (b int, NESTED PATH '$' AS a COLUMNS (c int)))">>()
    .toEqualTypeOf<SqlError<"duplicate JSON_TABLE column or path name: a", 0>>();
  expectTypeOf<V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' COLUMNS (b int)) AS f(x, y)">>()
    .toEqualTypeOf<SqlError<"JSON_TABLE function has 1 columns available but 2 columns specified", 0>>();
  expectTypeOf<V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' || '.a' COLUMNS (b int))">>()
    .toEqualTypeOf<SqlError<"only string constants are supported in JSON_TABLE path specification", 0>>();
  // JSON_TABLE is only allowed in FROM
  expectTypeOf<V<"SELECT JSON_TABLE(jsonb '[]', '$' COLUMNS (a int))">>().toEqualTypeOf<SqlError<"syntax error at or near (", 2>>();
  expectTypeOf<V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' COLUMNS (a FOR ORDINALITY, b FOR ORDINALITY))">>()
    .toEqualTypeOf<SqlError<"only one FOR ORDINALITY column is allowed", 15>>();
  expectTypeOf<V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' COLUMNS (a int) NULL ON ERROR)">>().toEqualTypeOf<SqlError<"invalid ON ERROR behavior", 14>>();
});

test("parameters", () => {
  expectTypeOf<Params<"SELECT JSON_VALUE($1, $2 PASSING $3 AS x RETURNING int DEFAULT $4 ON EMPTY), JSON_OBJECT('a' VALUE $5), $6 IS JSON, JSON_ARRAYAGG($7) FILTER (WHERE $8)">>()
    .toEqualTypeOf<[string | null, string | null, string | null, number | null, string | null, string | null, string | null, boolean | null]>();
  expectTypeOf<Params<"SELECT * FROM JSON_TABLE($1, '$' COLUMNS (a int PATH '$.a' DEFAULT $2 ON EMPTY))">>().toEqualTypeOf<[string | null, number | null]>();
});
