import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Params, Row, V } from "./_schema.js";

// SQL/JSON syntax of PostgreSQL 16–18 (constructors, aggregates, query functions, IS JSON,
// JSON_TABLE), checked against PostgreSQL 18's regression tests (sqljson*.sql). Output columns
// are named like functions (`json_object`, `json_value`, …). `k : v` pairs are written with
// VALUE here: `: name` is the named-parameter sugar.

test("JSON, JSON_SCALAR, JSON_SERIALIZE", () => {
	expectTypeOf<
		Row<"SELECT JSON('[]') AS a, JSON(n_text) AS b, JSON(label FORMAT JSON WITH UNIQUE KEYS) AS c FROM things">
	>().toEqualTypeOf<{ a: []; b: unknown; c: unknown }>();
	expectTypeOf<
		Row<"SELECT JSON_SCALAR(id) AS a, JSON_SCALAR(n_at) AS b, JSON_SCALAR(label) FROM things">
	>().toEqualTypeOf<{ a: number; b: string | null; json_scalar: string }>();
	expectTypeOf<
		Row<"SELECT JSON_SERIALIZE(doc), JSON_SERIALIZE(n_data RETURNING bytea) AS b, JSON_SERIALIZE(data RETURNING varchar(10)) AS c FROM things">
	>().toEqualTypeOf<{
		json_serialize: string;
		b: Uint8Array | null;
		c: string;
	}>();
	expectTypeOf<V<"SELECT JSON(id) FROM things">>().toEqualTypeOf<
		SqlError<"cannot cast type integer to json", 0>
	>();
	expectTypeOf<V<"SELECT JSON_SERIALIZE('1' RETURNING jsonb)">>().toEqualTypeOf<
		SqlError<"cannot use type jsonb in RETURNING clause of JSON_SERIALIZE()", 0>
	>();
	// JSON() needs an argument
	expectTypeOf<V<"SELECT JSON()">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 3>
	>();
});

test("JSON_OBJECT is an object like json_build_object, never NULL", () => {
	expectTypeOf<
		Row<"SELECT JSON_OBJECT('a' VALUE id, 'b' VALUE n_text, 1.5 VALUE flag) FROM things">
	>().toEqualTypeOf<{
		json_object: { a: number; b: string | null; "1.5": boolean };
	}>();
	expectTypeOf<
		Row<"SELECT JSON_OBJECT('a': 1, 'b': 'x' RETURNING jsonb) AS o, JSON_OBJECT() AS e, JSON_OBJECT(RETURNING jsonb) AS f">
	>().toEqualTypeOf<{
		o: { a: number; b: string };
		e: Record<string, never>;
		f: Record<string, never>;
	}>();
	// FORMAT JSON embeds the text as JSON; ABSENT ON NULL can leave a key out; other RETURNING types
	expectTypeOf<
		Row<"SELECT JSON_OBJECT('d' VALUE label FORMAT JSON) AS a, JSON_OBJECT('n' VALUE n_id ABSENT ON NULL) AS b, JSON_OBJECT('n' VALUE id ABSENT ON NULL WITH UNIQUE KEYS) AS c, JSON_OBJECT('a': 1 RETURNING text) AS d FROM things">
	>().toEqualTypeOf<{
		a: { d: unknown };
		b: unknown;
		c: { n: number };
		d: string;
	}>();
	// a key that is not a literal: plain JSON; json_object(text[]) is the ordinary function
	expectTypeOf<
		Row<"SELECT JSON_OBJECT(label VALUE id) AS a, json_object('{a,1}') AS b FROM things">
	>().toEqualTypeOf<{ a: unknown; b: unknown }>();
	expectTypeOf<V<"SELECT JSON_OBJECT(NULL: 1)">>().toEqualTypeOf<
		SqlError<"null value not allowed for object key", 0>
	>();
	expectTypeOf<
		V<"SELECT JSON_OBJECT(nums VALUE 1) FROM things">
	>().toEqualTypeOf<
		SqlError<"key value must be scalar, not array, composite, or json", 0>
	>();
	expectTypeOf<
		V<"SELECT JSON_OBJECT('a' VALUE id FORMAT JSON) FROM things">
	>().toEqualTypeOf<
		SqlError<"cannot use non-string types with explicit FORMAT JSON clause", 0>
	>();
});

test("JSON_ARRAY: a tuple of the values (NULLs skipped by default), or a query's column", () => {
	expectTypeOf<
		Row<"SELECT JSON_ARRAY(id, label) AS a, JSON_ARRAY(id, n_text NULL ON NULL RETURNING jsonb) AS b, JSON_ARRAY(id, n_text) AS c, JSON_ARRAY() AS d FROM things">
	>().toEqualTypeOf<{
		a: [number, string];
		b: [number, string | null];
		c: unknown;
		d: [];
	}>();
	// JSON_ARRAY(query) is a scalar subquery aggregating the column: NULL when there are no rows
	expectTypeOf<
		Row<"SELECT JSON_ARRAY(SELECT n_id FROM things ORDER BY 1) AS a, JSON_ARRAY(VALUES (1), (2) RETURNING text) AS b">
	>().toEqualTypeOf<{ a: number[] | null; b: string | null }>();
	expectTypeOf<V<"SELECT JSON_ARRAY(SELECT 1, 2)">>().toEqualTypeOf<
		SqlError<"subquery must return only one column", 0>
	>();
});

test("JSON_ARRAYAGG / JSON_OBJECTAGG are json_agg / json_object_agg", () => {
	expectTypeOf<
		Row<"SELECT JSON_ARRAYAGG(n_id) AS a, JSON_ARRAYAGG(n_id NULL ON NULL RETURNING jsonb) AS b, JSON_OBJECTAGG(label VALUE n_id) AS c, JSON_OBJECTAGG(label VALUE id ABSENT ON NULL WITH UNIQUE KEYS RETURNING text) AS d FROM things">
	>().toEqualTypeOf<{
		a: number[] | null;
		b: (number | null)[] | null;
		c: { [key: string]: number | null } | null;
		d: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT id, JSON_ARRAYAGG(label ORDER BY label DESC) AS a, JSON_ARRAYAGG(id) FILTER (WHERE flag) AS b, JSON_OBJECTAGG(label VALUE id) OVER (ORDER BY id) AS c FROM things GROUP BY id, label">
	>().toEqualTypeOf<{
		id: number;
		a: string[];
		b: number[] | null;
		c: { [key: string]: number };
	}>();
	expectTypeOf<
		Row<"SELECT JSON_ARRAYAGG(label), JSON_OBJECTAGG(label VALUE 1) FROM things">
	>().toEqualTypeOf<{
		json_arrayagg: string[] | null;
		json_objectagg: { [key: string]: number } | null;
	}>();
});

test("JSON_EXISTS, JSON_VALUE, JSON_QUERY", () => {
	expectTypeOf<
		Row<"SELECT JSON_EXISTS(data, '$.a') AS a, JSON_EXISTS(n_data, '$.a ? (@ > $x)' PASSING id AS x) AS b, JSON_EXISTS(data, 'strict $.a' UNKNOWN ON ERROR) AS c FROM things">
	>().toEqualTypeOf<{ a: boolean; b: boolean | null; c: boolean | null }>();
	expectTypeOf<
		Row<"SELECT JSON_VALUE(data, '$.a'), JSON_VALUE(doc, '$.a' RETURNING int DEFAULT -1 ON EMPTY ERROR ON ERROR) AS b, JSON_VALUE(data, '$.d' RETURNING date) AS c FROM things">
	>().toEqualTypeOf<{
		json_value: string | null;
		b: number | null;
		c: Date | null;
	}>();
	expectTypeOf<
		Row<"SELECT JSON_QUERY(data, '$.a' WITH CONDITIONAL WRAPPER EMPTY ARRAY ON EMPTY), JSON_QUERY(data, '$.a' RETURNING text OMIT QUOTES ON SCALAR STRING) AS b, JSON_QUERY(label FORMAT JSON, '$' RETURNING int[]) AS c FROM things">
	>().toEqualTypeOf<{
		json_query: unknown;
		b: string | null;
		c: number[] | null;
	}>();
	// JSON_EXISTS has no ON EMPTY
	expectTypeOf<
		V<"SELECT JSON_EXISTS(data, '$.a' FALSE ON EMPTY) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near empty", 8>>();
});

test("IS JSON", () => {
	expectTypeOf<
		Row<"SELECT label IS JSON AS a, n_text IS NOT JSON OBJECT WITH UNIQUE KEYS AS b, data IS JSON ARRAY, bin IS JSON SCALAR AS d FROM things">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean | null;
		"?column?": boolean;
		d: boolean;
	}>();
	expectTypeOf<V<"SELECT id IS JSON FROM things">>().toEqualTypeOf<
		SqlError<"cannot use type integer in IS JSON predicate", 0>
	>();
});

test("JSON_TABLE: declared column types, nullable; nested paths' columns last", () => {
	expectTypeOf<
		Row<`SELECT * FROM JSON_TABLE(jsonb '[]', '$[*]' COLUMNS (
      n FOR ORDINALITY,
      NESTED PATH '$.c[*]' AS pc COLUMNS (cn FOR ORDINALITY, c numeric PATH '$'),
      a int PATH '$.a' DEFAULT 0 ON EMPTY,
      b text FORMAT JSON PATH '$.b' WITH WRAPPER,
      e bool EXISTS PATH '$.e' ERROR ON ERROR
    ) ERROR ON ERROR) AS jt`>
	>().toEqualTypeOf<{
		n: number;
		a: number | null;
		b: string | null;
		e: boolean | null;
		cn: number | null;
		c: string | null;
	}>();
	// implicitly LATERAL; the default alias is json_table; column aliases rename
	expectTypeOf<
		Row<"SELECT t.id, j.x FROM things t LEFT JOIN JSON_TABLE(t.data, '$' COLUMNS (a text)) j(x) ON true">
	>().toEqualTypeOf<{ id: number; x: string | null }>();
	expectTypeOf<
		Row<"SELECT json_table.v FROM things, JSON_TABLE(doc, '$' COLUMNS (v date))">
	>().toEqualTypeOf<{ v: Date | null }>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' AS a COLUMNS (b int, NESTED PATH '$' AS a COLUMNS (c int)))">
	>().toEqualTypeOf<
		SqlError<"duplicate JSON_TABLE column or path name: a", 0>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' COLUMNS (b int)) AS f(x, y)">
	>().toEqualTypeOf<
		SqlError<
			"JSON_TABLE function has 1 columns available but 2 columns specified",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' || '.a' COLUMNS (b int))">
	>().toEqualTypeOf<
		SqlError<
			"only string constants are supported in JSON_TABLE path specification",
			0
		>
	>();
	// JSON_TABLE is only allowed in FROM
	expectTypeOf<
		V<"SELECT JSON_TABLE(jsonb '[]', '$' COLUMNS (a int))">
	>().toEqualTypeOf<SqlError<"syntax error at or near (", 2>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' COLUMNS (a FOR ORDINALITY, b FOR ORDINALITY))">
	>().toEqualTypeOf<
		SqlError<"only one FOR ORDINALITY column is allowed", 15>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' COLUMNS (a int) NULL ON ERROR)">
	>().toEqualTypeOf<SqlError<"invalid ON ERROR behavior", 14>>();
});

test("ON EMPTY / ON ERROR: the behaviors each function or column allows", () => {
	expectTypeOf<
		Row<"SELECT JSON_EXISTS(data, '$' TRUE ON ERROR) AS a, JSON_EXISTS(data, '$' FALSE ON ERROR) AS b, JSON_EXISTS(data, '$' ERROR ON ERROR) AS c FROM things">
	>().toEqualTypeOf<{ a: boolean; b: boolean; c: boolean }>();
	expectTypeOf<
		V<"SELECT JSON_EXISTS(data, '$' NULL ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<"invalid ON ERROR behavior", 6>>();
	expectTypeOf<
		Row<"SELECT JSON_VALUE(data, '$' NULL ON EMPTY ERROR ON ERROR) AS a, JSON_VALUE(data, '$' RETURNING int DEFAULT '1'::int ON EMPTY DEFAULT 1 + 2 ON ERROR) AS b, JSON_VALUE(data, '$' DEFAULT NULL ON ERROR) AS c FROM things">
	>().toEqualTypeOf<{ a: string | null; b: number | null; c: string | null }>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' EMPTY ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<"invalid ON ERROR behavior", 6>>();
	expectTypeOf<
		Row<"SELECT JSON_QUERY(data, '$' EMPTY OBJECT ON EMPTY EMPTY ARRAY ON ERROR) AS a, JSON_QUERY(data, '$' EMPTY ON EMPTY NULL ON ERROR) AS b FROM things">
	>().toEqualTypeOf<{ a: unknown; b: unknown }>();
	expectTypeOf<
		V<"SELECT JSON_QUERY(data, '$' FALSE ON EMPTY) FROM things">
	>().toEqualTypeOf<SqlError<"invalid ON EMPTY behavior", 6>>();
	expectTypeOf<
		V<"SELECT JSON_QUERY(data, '$' UNKNOWN ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<"invalid ON ERROR behavior", 6>>();
	// the kinds are checked before the DEFAULT expressions
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' DEFAULT $1 ON EMPTY TRUE ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<"invalid ON ERROR behavior", 10>>();
	// columns: scalar ones like JSON_VALUE, formatted ones (FORMAT JSON, a wrapper or quotes
	// clause, a JSON, array or composite type) like JSON_QUERY, EXISTS ones like JSON_EXISTS
	expectTypeOf<
		Row<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int[] EMPTY ON ERROR, b text FORMAT JSON EMPTY OBJECT ON EMPTY, c text KEEP QUOTES EMPTY ON EMPTY, d text WITHOUT WRAPPER EMPTY ON EMPTY, e jsonb EMPTY ARRAY ON ERROR, f int NULL ON EMPTY DEFAULT 1 ON ERROR, g bool EXISTS UNKNOWN ON ERROR) EMPTY ARRAY ON ERROR)">
	>().toEqualTypeOf<{
		a: number[] | null;
		b: string | null;
		c: string | null;
		d: string | null;
		e: unknown;
		f: number | null;
		g: boolean | null;
	}>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int EMPTY ON ERROR))">
	>().toEqualTypeOf<SqlError<'invalid ON ERROR behavior for column "a"', 13>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int PATH '$' EMPTY ON ERROR))">
	>().toEqualTypeOf<SqlError<'invalid ON ERROR behavior for column "a"', 15>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int TRUE ON EMPTY))">
	>().toEqualTypeOf<SqlError<'invalid ON EMPTY behavior for column "a"', 13>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a text FORMAT JSON UNKNOWN ON ERROR))">
	>().toEqualTypeOf<SqlError<'invalid ON ERROR behavior for column "a"', 15>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int, b bool EXISTS DEFAULT true ON ERROR))">
	>().toEqualTypeOf<SqlError<'invalid ON ERROR behavior for column "b"', 17>>();
});

test("a DEFAULT is a constant, function or operator expression", () => {
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' RETURNING int DEFAULT $1 ON EMPTY) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"can only specify a constant, non-aggregate function, or operator expression for DEFAULT",
			9
		>
	>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' DEFAULT $1::int ON EMPTY) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"can only specify a constant, non-aggregate function, or operator expression for DEFAULT",
			7
		>
	>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' DEFAULT 'x' ON EMPTY DEFAULT id ON ERROR) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"can only specify a constant, non-aggregate function, or operator expression for DEFAULT",
			11
		>
	>();
	expectTypeOf<
		V<"SELECT JSON_QUERY(data, '$' DEFAULT (SELECT 1) ON ERROR) FROM things">
	>().toEqualTypeOf<
		SqlError<
			"can only specify a constant, non-aggregate function, or operator expression for DEFAULT",
			7
		>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int DEFAULT $1 ON EMPTY))">
	>().toEqualTypeOf<
		SqlError<
			"can only specify a constant, non-aggregate function, or operator expression for DEFAULT",
			14
		>
	>();
});

test("SQL/JSON clauses: FORMAT JSON, UNIQUE KEYS, wrappers, quotes, PASSING, behaviors", () => {
	// FORMAT JSON [ENCODING …] on a value or after RETURNING; WITH / WITHOUT UNIQUE [KEYS]
	expectTypeOf<
		Row<"SELECT JSON_OBJECT('a' VALUE bin FORMAT JSON ENCODING UTF8) AS a, JSON_SERIALIZE(doc RETURNING bytea FORMAT JSON) AS b FROM things">
	>().toEqualTypeOf<{ a: { a: unknown }; b: Uint8Array }>();
	expectTypeOf<
		Row<`SELECT JSON('{}' WITHOUT UNIQUE KEYS) AS a, JSON('{}' WITH UNIQUE) AS b, JSON('[]' FORMAT JSON) AS c, JSON('{"a": 1}') AS d`>
	>().toEqualTypeOf<{
		a: Record<string, never>;
		b: Record<string, never>;
		c: [];
		d: unknown;
	}>();
	expectTypeOf<
		V<"SELECT JSON_OBJECT('a' VALUE bin FORMAT JSON ENCODING) FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near encoding', 8>
	>();
	expectTypeOf<V<"SELECT JSON('{}' x UNIQUE)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near x', 4>
	>();
	expectTypeOf<V<"SELECT JSON('{}' WITH KEYS)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near with', 4>
	>();
	// JSON_QUERY's wrapper and quotes clauses; JSON_VALUE has neither
	expectTypeOf<
		Row<"SELECT JSON_QUERY(data, '$' WITHOUT WRAPPER) AS a, JSON_QUERY(data, '$' WITH UNCONDITIONAL ARRAY WRAPPER) AS b, JSON_QUERY(data, '$' RETURNING text KEEP QUOTES) AS c FROM things">
	>().toEqualTypeOf<{ a: unknown; b: unknown; c: string | null }>();
	expectTypeOf<
		V<"SELECT JSON_QUERY(data, '$' x WRAPPER) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near x', 6>>();
	expectTypeOf<
		V<"SELECT JSON_QUERY(data, '$' WITH ARRAY) FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near with', 6>
	>();
	expectTypeOf<
		V<"SELECT JSON_QUERY(data, '$' x QUOTES) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near x', 6>>();
	expectTypeOf<
		V<"SELECT JSON_QUERY(data, '$' KEEP x) FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near keep', 6>
	>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' WITH WRAPPER) FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near with', 6>
	>();
	// PASSING value AS name, …
	expectTypeOf<
		Row<"SELECT JSON_EXISTS(data, '$ ? (@ > $x && @ < $y)' PASSING 1 AS x, n_id AS y) AS a FROM things">
	>().toEqualTypeOf<{ a: boolean }>();
	expectTypeOf<
		V<"SELECT JSON_EXISTS(data, '$' PASSING 1 x) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error: expected AS at or near x", 8>>();
	expectTypeOf<
		V<"SELECT JSON_EXISTS(data, '$' PASSING 1 AS 2) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error: expected name at or near 2", 9>>();
	// a behavior needs ON EMPTY / ON ERROR (JSON_EXISTS has only ON ERROR)
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' foo ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near foo', 6>>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' NULL) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ON EMPTY or ON ERROR at or near )", 7>
	>();
	expectTypeOf<
		V<"SELECT JSON_EXISTS(data, '$' TRUE) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ON ERROR at or near )", 7>
	>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' NULL ON EMPTY NULL) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ON ERROR at or near )", 10>
	>();
	// DEFAULT expressions are typed in order: ON EMPTY's, then ON ERROR's, after the PASSING values
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' DEFAULT nosuch1 + 1 ON EMPTY DEFAULT nosuch2 + 1 ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch1" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' DEFAULT 'a' ON EMPTY DEFAULT nosuch + 1 ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 11>>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' DEFAULT nosuch + 1 ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' PASSING nosuch1 AS x DEFAULT nosuch2 + 1 ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch1" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(nosuch1, nosuch2) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch1" does not exist', 3>>();
	expectTypeOf<
		V<"SELECT JSON_EXISTS(nosuch1, nosuch2) FROM things">
	>().toEqualTypeOf<SqlError<'column "nosuch1" does not exist', 3>>();
});

test("SQL/JSON syntax errors", () => {
	// a missing ")" or ","
	expectTypeOf<V<"SELECT JSON_SCALAR(1 2)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near 2', 4>
	>();
	expectTypeOf<V<"SELECT JSON_SCALAR('1' FORMAT JSON)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near format', 4>
	>();
	expectTypeOf<
		V<"SELECT JSON_OBJECTAGG(label VALUE id x) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near x', 6>>();
	expectTypeOf<V<"SELECT JSON_ARRAYAGG(id x) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near x', 4>
	>();
	expectTypeOf<V<"SELECT JSON_VALUE(data) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," at or near )', 4>
	>();
	expectTypeOf<
		V<"SELECT JSON_EXISTS(data, '$' RETURNING text) FROM things">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near returning', 6>
	>();
	expectTypeOf<V<"SELECT JSON_OBJECT('a' VALUE 1, 'b')">>().toEqualTypeOf<
		SqlError<'syntax error: expected ":" or VALUE at or near )', 8>
	>();
	expectTypeOf<V<"SELECT JSON_OBJECTAGG(label) FROM things">>().toEqualTypeOf<
		SqlError<'syntax error: expected ":" or VALUE at or near )', 4>
	>();
	// an error inside a part is the call's error
	expectTypeOf<V<"SELECT JSON_SCALAR(,)">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 3>
	>();
	expectTypeOf<
		V<"SELECT JSON_SERIALIZE(doc RETURNING 1) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near 1", 5>
	>();
	expectTypeOf<V<"SELECT JSON_OBJECT(,)">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 3>
	>();
	expectTypeOf<V<"SELECT JSON_OBJECT('a' VALUE 1, ,)">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 7>
	>();
	expectTypeOf<V<"SELECT JSON_OBJECT('a' VALUE ,)">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 5>
	>();
	expectTypeOf<
		V<"SELECT JSON_OBJECT('a' VALUE 1 RETURNING ,)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near ,", 7>
	>();
	expectTypeOf<V<"SELECT JSON_ARRAY(SELECT ,)">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 4>
	>();
	expectTypeOf<V<"SELECT JSON_ARRAY(SELECT 1 RETURNING ,)">>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near ,", 6>
	>();
	expectTypeOf<V<"SELECT JSON_ARRAY(1, ,)">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 5>
	>();
	expectTypeOf<V<"SELECT JSON_ARRAY(1 RETURNING ,)">>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near ,", 5>
	>();
	expectTypeOf<V<"SELECT JSON_OBJECTAGG(,) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 3>
	>();
	expectTypeOf<
		V<"SELECT JSON_OBJECTAGG(label VALUE ,) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 5>>();
	expectTypeOf<
		V<"SELECT JSON_OBJECTAGG(label VALUE id RETURNING ,) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near ,", 7>
	>();
	expectTypeOf<V<"SELECT JSON_ARRAYAGG(,) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 3>
	>();
	expectTypeOf<
		V<"SELECT JSON_ARRAYAGG(id ORDER BY ,) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 6>>();
	expectTypeOf<
		V<"SELECT JSON_ARRAYAGG(id RETURNING ,) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near ,", 5>
	>();
	expectTypeOf<
		V<"SELECT JSON_ARRAYAGG(id) FILTER (WHERE ,) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 8>>();
	expectTypeOf<
		V<"SELECT JSON_ARRAYAGG(id) OVER (,) FROM things">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near ,', 7>>();
	expectTypeOf<V<"SELECT JSON_VALUE(,) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 3>
	>();
	expectTypeOf<V<"SELECT JSON_VALUE(data, ,) FROM things">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 5>
	>();
	expectTypeOf<
		V<"SELECT JSON_EXISTS(data, '$' PASSING ,) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 7>>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' RETURNING ,) FROM things">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near ,", 7>
	>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' DEFAULT , ON EMPTY) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 7>>();
	expectTypeOf<
		V<"SELECT JSON_VALUE(data, '$' NULL ON EMPTY DEFAULT , ON ERROR) FROM things">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 10>>();
});

test("SQL/JSON constructors and aggregates: RETURNING, FORMAT JSON, queries", () => {
	// JSON_ARRAY with only options, or a WITH / TABLE query
	expectTypeOf<
		Row<"WITH q AS (SELECT 1) SELECT JSON_ARRAY(RETURNING jsonb) AS a, JSON_ARRAY(WITH r AS (SELECT 1) SELECT * FROM r) AS b, JSON_ARRAY(TABLE q) AS c, JSON_ARRAY(SELECT 1 RETURNING jsonb) AS d, JSON_ARRAY(1 RETURNING text) AS e">
	>().toEqualTypeOf<{
		a: [];
		b: number[] | null;
		c: number[] | null;
		d: number[] | null;
		e: string;
	}>();
	// json by default, jsonb for RETURNING jsonb (a UNION with a json / jsonb column tells them apart)
	expectTypeOf<
		Row<"SELECT JSON_OBJECT('a' VALUE 1) AS a, JSON_OBJECT('a' VALUE 1 RETURNING jsonb) AS b, JSON_ARRAYAGG(id) AS c, JSON_ARRAYAGG(id RETURNING jsonb) AS d, JSON_OBJECTAGG(label VALUE id) AS e, JSON_OBJECTAGG(label VALUE id RETURNING jsonb) AS f FROM things UNION ALL SELECT doc, data, doc, data, doc, data FROM things">
	>().toEqualTypeOf<{
		a: unknown;
		b: unknown;
		c: unknown;
		d: unknown;
		e: unknown;
		f: unknown;
	}>();
	expectTypeOf<
		V<"SELECT JSON_OBJECT('a' VALUE 1) UNION ALL SELECT data FROM things">
	>().toEqualTypeOf<
		SqlError<"UNION types json and jsonb cannot be matched", 7>
	>();
	expectTypeOf<
		V<"SELECT JSON_ARRAYAGG(id RETURNING jsonb) FROM things UNION ALL SELECT doc FROM things">
	>().toEqualTypeOf<
		SqlError<"UNION types jsonb and json cannot be matched", 9>
	>();
	// ABSENT ON NULL is json_object_agg_strict; RETURNING json keeps the aggregate's shape; a window sees its row
	expectTypeOf<
		Row<"SELECT JSON_OBJECTAGG(label VALUE n_id ABSENT ON NULL) AS a, JSON_ARRAYAGG(id RETURNING json) AS b FROM things">
	>().toEqualTypeOf<{
		a: { [key: string]: number } | null;
		b: number[] | null;
	}>();
	expectTypeOf<
		Row<"SELECT JSON_ARRAYAGG(id) OVER () AS a FROM things">
	>().toEqualTypeOf<{ a: number[] }>();
	// FORMAT JSON keeps a json / jsonb value
	expectTypeOf<
		Row<"SELECT JSON_ARRAY(jsonb '[]' FORMAT JSON RETURNING jsonb) AS a, JSON_ARRAY(json '{}' FORMAT JSON) AS b">
	>().toEqualTypeOf<{ a: [[]]; b: [Record<string, never>] }>();
	expectTypeOf<
		V<"SELECT JSON_OBJECT('a' VALUE nosuch FORMAT JSON)">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 5>>();
	expectTypeOf<V<"SELECT nosuch IS JSON">>().toEqualTypeOf<
		SqlError<'column "nosuch" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT JSON_ARRAYAGG(nosuch)">>().toEqualTypeOf<
		SqlError<'column "nosuch" does not exist', 3>
	>();
	expectTypeOf<
		V<"SELECT JSON_OBJECT(NULL VALUE 1 RETURNING text)">
	>().toEqualTypeOf<SqlError<"null value not allowed for object key", 0>>();
	expectTypeOf<
		Params<"SELECT JSON_ARRAY(SELECT n_id FROM things WHERE id = $1) AS a">
	>().toEqualTypeOf<[number | null]>();
});

test("JSON_TABLE: clauses, column order, names, errors", () => {
	// errors in Postgres's order: a non-constant path, a repeated name, the context item, then the alias
	expectTypeOf<
		V<"SELECT * FROM things j, JSON_TABLE(nosuch, 1 AS a COLUMNS (a int)) j">
	>().toEqualTypeOf<
		SqlError<
			"only string constants are supported in JSON_TABLE path specification",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT * FROM things j, JSON_TABLE(nosuch, '$' AS a COLUMNS (a int)) j">
	>().toEqualTypeOf<
		SqlError<"duplicate JSON_TABLE column or path name: a", 0>
	>();
	expectTypeOf<
		V<"SELECT * FROM things j, JSON_TABLE(nosuch, '$' COLUMNS (a int)) j">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 8>>();
	expectTypeOf<
		Row<"SELECT * FROM JSON_TABLE(jsonb '1', '$ ? (@ > $x)' PASSING 1 AS x COLUMNS (nested int, NESTED '$' COLUMNS (b int))) AS j">
	>().toEqualTypeOf<{ b: number | null; nested: number | null }>();
	// a level's own columns come first, then its nested paths' (as column aliases see them)
	expectTypeOf<
		Row<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' COLUMNS (NESTED PATH '$' COLUMNS (b text), a int, NESTED PATH '$' COLUMNS (c date))) AS j(x, y, z)">
	>().toEqualTypeOf<{ x: number | null; y: string | null; z: Date | null }>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '[]', '$' AS x COLUMNS (y int, x int, NESTED PATH '$' AS y COLUMNS (z int)))">
	>().toEqualTypeOf<
		SqlError<"duplicate JSON_TABLE column or path name: x", 0>
	>();
	expectTypeOf<
		V<"SELECT * FROM things, JSON_TABLE(data, '$' COLUMNS (a int DEFAULT nosuch1 + 1 ON EMPTY, b int DEFAULT nosuch2 + 1 ON EMPTY))">
	>().toEqualTypeOf<SqlError<'column "nosuch1" does not exist', 15>>();
	expectTypeOf<
		V<"SELECT * FROM things, JSON_TABLE(data, '$' PASSING nosuch1 AS x COLUMNS (a int DEFAULT nosuch2 + 1 ON EMPTY))">
	>().toEqualTypeOf<SqlError<'column "nosuch1" does not exist', 11>>();
	expectTypeOf<
		V<"SELECT * FROM things, JSON_TABLE(nosuch, '$' COLUMNS (a int))">
	>().toEqualTypeOf<SqlError<'column "nosuch" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT * FROM things j, JSON_TABLE(data, '$' COLUMNS (a int)) j">
	>().toEqualTypeOf<SqlError<'table name "j" specified more than once', 4>>();
	expectTypeOf<V<"SELECT * FROM JSON_TABLE(jsonb '1')">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," at or near )', 7>
	>();
	expectTypeOf<V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' x)">>().toEqualTypeOf<
		SqlError<"syntax error: expected COLUMNS at or near x", 9>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS a)">
	>().toEqualTypeOf<SqlError<'syntax error: expected "(" at or near a', 10>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' AS 1 COLUMNS (a int))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected COLUMNS at or near as", 9>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int) ERROR ON EMPTY)">
	>().toEqualTypeOf<SqlError<"syntax error at or near empty", 16>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int) ERROR)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ON ERROR at or near )", 15>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' PASSING , COLUMNS (a int))">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 10>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', , COLUMNS (a int))">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 8>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(, '$' COLUMNS (a int))">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 5>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a '$' COLUMNS (b int)))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near '$'", 12>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int x))">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near x', 13>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a 1))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near 1", 12>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (1 int))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column definition at or near 1", 11>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int ERROR))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ON EMPTY or ON ERROR at or near )", 14>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (a int PATH 1))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected path string at or near 1", 14>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (e bool EXISTS ERROR ON EMPTY))">
	>().toEqualTypeOf<SqlError<"syntax error at or near empty", 16>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (e bool EXISTS ERROR))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected ON ERROR at or near )", 15>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (e bool EXISTS PATH 1))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected path string at or near 1", 15>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (NESTED PATH x COLUMNS (b int)))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected path string at or near x", 13>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (NESTED PATH '$' x))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected COLUMNS at or near x", 14>
	>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (NESTED PATH '$' COLUMNS x))">
	>().toEqualTypeOf<SqlError<'syntax error: expected "(" at or near x', 15>>();
	expectTypeOf<
		V<"SELECT * FROM JSON_TABLE(jsonb '1', '$' COLUMNS (NESTED PATH '$' COLUMNS (1)))">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column definition at or near 1", 16>
	>();
});

test("parameters", () => {
	expectTypeOf<
		Params<"SELECT JSON_VALUE($1, '$' PASSING $2 AS x RETURNING int DEFAULT $3 + 1 ON EMPTY), JSON_OBJECT('a' VALUE $4), $5 IS JSON, JSON_ARRAYAGG($6) FILTER (WHERE $7)">
	>().toEqualTypeOf<
		[
			string | null,
			string | null,
			number,
			string | null,
			string | null,
			string | null,
			boolean | null,
		]
	>();
	expectTypeOf<
		Params<"SELECT * FROM JSON_TABLE($1, '$' COLUMNS (a int PATH '$.a' DEFAULT $2 + 1 ON EMPTY))">
	>().toEqualTypeOf<[string | null, number]>();
});
