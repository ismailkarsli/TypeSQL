import { expectTypeOf, test } from "vitest";
import type {
	Col,
	DefaultTypeMap,
	Nullable,
	ParamsOf,
	RowOf,
	SqlError,
	Validate,
} from "../../../src/index.js";

// SQL/XML syntax, verified against PostgreSQL 18 (output names, types, nullability).

interface DB {
	docs: {
		id: Col<"int4">;
		data: Col<"xml">;
		n_data: Nullable<"xml">;
		name: Col<"text">;
		n_name: Nullable<"text">;
		age: Nullable<"int4">;
		path: Col<"text">;
	};
}
type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;
/** xml rows and parameters as their own TS type, to tell them from text. */
interface XmlMap extends Omit<DefaultTypeMap, "xml"> {
	xml: { readonly xml: string };
}
type XmlParams<Q extends string> = ParamsOf<DB, XmlMap, Q>;

test("XMLELEMENT, XMLATTRIBUTES, XMLFOREST", () => {
	expectTypeOf<Row<"SELECT xmlelement(name foo)">>().toEqualTypeOf<{
		xmlelement: string;
	}>();
	expectTypeOf<
		Row<"SELECT xmlelement(name element, xmlattributes(1 as one, 'deuce' as two), 'content')">
	>().toEqualTypeOf<{ xmlelement: string }>();
	// NULL content and attributes are skipped: never null
	expectTypeOf<
		Row<"SELECT xmlelement(name e, xmlattributes(n_name), n_data, null) FROM docs">
	>().toEqualTypeOf<{ xmlelement: string }>();
	expectTypeOf<
		Row<'SELECT xmlelement(name "x-y", xmlelement(name name, name)) AS e FROM docs'>
	>().toEqualTypeOf<{ e: string }>();
	// XMLFOREST is null only when every value is
	expectTypeOf<
		Row<"SELECT xmlforest(name, age, id AS num) FROM docs">
	>().toEqualTypeOf<{ xmlforest: string }>();
	expectTypeOf<
		Row<"SELECT xmlforest(n_name, age AS a) FROM docs">
	>().toEqualTypeOf<{ xmlforest: string | null }>();
	// a value without AS must be a column reference; attribute names are distinct
	expectTypeOf<
		V<"SELECT xmlelement(name e, xmlattributes('x'))">
	>().toEqualTypeOf<
		SqlError<"unnamed XML attribute value must be a column reference", 8>
	>();
	expectTypeOf<V<"SELECT xmlforest(1)">>().toEqualTypeOf<
		SqlError<"unnamed XML element value must be a column reference", 3>
	>();
	expectTypeOf<
		V<"SELECT xmlelement(name d, xmlattributes(1 as a, 2 as b, 3 as a))">
	>().toEqualTypeOf<
		SqlError<'XML attribute name "a" appears more than once', 16>
	>();
	expectTypeOf<V<"SELECT xmlelement(name e, nope) FROM docs">>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			6
		>
	>();
	expectTypeOf<
		V<"SELECT xmlelement(name e, xmlattributes(nope)) FROM docs">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			8
		>
	>();
	expectTypeOf<V<"SELECT xmlforest(nope) FROM docs">>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			3
		>
	>();
	// attributes alone; XMLATTRIBUTES without "(" is a column
	expectTypeOf<
		Row<"SELECT xmlelement(name e, xmlattributes(1 as a)) AS x">
	>().toEqualTypeOf<{ x: string }>();
	expectTypeOf<
		Row<"SELECT xmlelement(name e, xmlattributes) FROM (SELECT 1 AS xmlattributes) s">
	>().toEqualTypeOf<{ xmlelement: string }>();
	// XMLFOREST names may repeat; one non-null value makes it non-null, wherever it is
	expectTypeOf<Row<"SELECT xmlforest(1 as a, 2 as a)">>().toEqualTypeOf<{
		xmlforest: string;
	}>();
	expectTypeOf<
		Row<"SELECT xmlforest(n_name, id AS i) FROM docs">
	>().toEqualTypeOf<{ xmlforest: string }>();
	expectTypeOf<
		Row<"SELECT json_array(xmlforest(n_name)), json_array(xmlforest(name)) AS j FROM docs">
	>().toEqualTypeOf<{ json_array: unknown; j: [string] }>();
	// syntax
	expectTypeOf<V<"SELECT xmlelement(foo)">>().toEqualTypeOf<
		SqlError<"syntax error: expected NAME at or near foo", 3>
	>();
	expectTypeOf<V<"SELECT xmlelement(name 1)">>().toEqualTypeOf<
		SqlError<"syntax error: expected name at or near 1", 4>
	>();
	expectTypeOf<V<"SELECT xmlelement(name e x)">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near x', 5>
	>();
	expectTypeOf<V<"SELECT xmlelement(name e, 1 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 8>
	>();
	expectTypeOf<V<"SELECT xmlforest(1 as 2)">>().toEqualTypeOf<
		SqlError<"syntax error: expected name at or near 2", 5>
	>();
	expectTypeOf<V<"SELECT xmlforest(1 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<V<"SELECT xmlforest(id id) FROM docs">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near id', 4>
	>();
});

test("XMLCONCAT, XMLPI, XMLROOT, XMLPARSE", () => {
	expectTypeOf<
		Row<"SELECT xmlconcat(data, '<a/>') FROM docs">
	>().toEqualTypeOf<{ xmlconcat: string }>();
	expectTypeOf<
		Row<"SELECT xmlconcat(n_data, NULL) FROM docs">
	>().toEqualTypeOf<{ xmlconcat: string | null }>();
	expectTypeOf<V<"SELECT xmlconcat(1, 2)">>().toEqualTypeOf<
		SqlError<"argument of XMLCONCAT must be type xml, not type integer", 0>
	>();
	expectTypeOf<Row<"SELECT xmlpi(name php)">>().toEqualTypeOf<{
		xmlpi: string;
	}>();
	expectTypeOf<
		Row<"SELECT xmlpi(name xml, n_name), xmlpi(name \"xml-stylesheet\", 'href') AS s FROM docs">
	>().toEqualTypeOf<{ xmlpi: string | null; s: string }>();
	expectTypeOf<
		Row<"SELECT xmlroot(data, version no value, standalone yes) FROM docs">
	>().toEqualTypeOf<{ xmlroot: string }>();
	expectTypeOf<
		Row<"SELECT xmlroot(n_data, version '1.0') FROM docs">
	>().toEqualTypeOf<{ xmlroot: string | null }>();
	expectTypeOf<
		Row<"SELECT xmlroot(data, version n_name, standalone no value) FROM docs">
	>().toEqualTypeOf<{ xmlroot: string }>();
	expectTypeOf<
		Row<"SELECT xmlparse(document name), xmlparse(content n_name strip whitespace) AS c FROM docs">
	>().toEqualTypeOf<{ xmlparse: string; c: string | null }>();
	expectTypeOf<
		Row<"SELECT xmlroot(data, version '1', standalone no), xmlparse(content name preserve whitespace) FROM docs">
	>().toEqualTypeOf<{ xmlroot: string; xmlparse: string }>();
	expectTypeOf<V<"SELECT xmlroot(1, version '1')">>().toEqualTypeOf<
		SqlError<"argument of XMLROOT must be type xml, not type integer", 0>
	>();
	// the xml operand is checked before the version
	expectTypeOf<V<"SELECT xmlroot(1, version nope)">>().toEqualTypeOf<
		SqlError<"argument of XMLROOT must be type xml, not type integer", 0>
	>();
	expectTypeOf<
		V<"SELECT xmlroot(data, version nope) FROM docs">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			6
		>
	>();
	expectTypeOf<V<"SELECT xmlparse(content nope) FROM docs">>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			4
		>
	>();
	// syntax
	expectTypeOf<V<"SELECT xmlconcat(1 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<V<"SELECT xmlconcat(data data) FROM docs">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near data', 4>
	>();
	expectTypeOf<V<"SELECT xmlpi(foo)">>().toEqualTypeOf<
		SqlError<"syntax error: expected NAME at or near foo", 3>
	>();
	expectTypeOf<V<"SELECT xmlpi(name x y)">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near y', 5>
	>();
	expectTypeOf<V<"SELECT xmlpi(name x, 1 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 8>
	>();
	expectTypeOf<V<"SELECT xmlroot(data) FROM docs">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," at or near )', 4>
	>();
	expectTypeOf<V<"SELECT xmlroot(data, '1.0') FROM docs">>().toEqualTypeOf<
		SqlError<"syntax error: expected VERSION at or near '1.0'", 5>
	>();
	expectTypeOf<
		V<"SELECT xmlroot(data, version '1.0', standalone maybe) FROM docs">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected YES, NO or NO VALUE at or near maybe", 9>
	>();
	expectTypeOf<
		V<"SELECT xmlroot(data, version '1', yes) FROM docs">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected STANDALONE at or near yes", 8>
	>();
	expectTypeOf<
		V<"SELECT xmlroot(data, version 1 +) FROM docs">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 8>>();
	expectTypeOf<V<"SELECT xmlroot(1 +, version '1')">>().toEqualTypeOf<
		SqlError<"syntax error at or near ,", 5>
	>();
	expectTypeOf<V<"SELECT xmlparse(data) FROM docs">>().toEqualTypeOf<
		SqlError<"syntax error: expected DOCUMENT or CONTENT at or near data", 3>
	>();
	expectTypeOf<V<"SELECT xmlparse(document 1 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 6>
	>();
	expectTypeOf<
		V<"SELECT xmlparse(content name strip) FROM docs">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near strip', 5>
	>();
});

test("XMLSERIALIZE, IS DOCUMENT, XMLEXISTS, xmlagg", () => {
	expectTypeOf<
		Row<"SELECT xmlserialize(content data AS text) FROM docs">
	>().toEqualTypeOf<{ xmlserialize: string }>();
	expectTypeOf<
		Row<"SELECT xmlserialize(document n_data AS character varying(20) no indent) FROM docs">
	>().toEqualTypeOf<{ xmlserialize: string | null }>();
	expectTypeOf<
		Row<"SELECT xmlserialize(content '<a/>' AS char(10) indent) AS s">
	>().toEqualTypeOf<{ s: string }>();
	expectTypeOf<
		V<"SELECT xmlserialize(content name AS text) FROM docs">
	>().toEqualTypeOf<
		SqlError<"argument of XMLSERIALIZE must be type xml, not type text", 0>
	>();
	expectTypeOf<
		Row<"SELECT data IS DOCUMENT, n_data IS NOT DOCUMENT AS nd FROM docs">
	>().toEqualTypeOf<{ "?column?": boolean; nd: boolean | null }>();
	expectTypeOf<
		Row<"SELECT xmlexists('//a' PASSING BY REF data BY VALUE), xmlexists(path PASSING n_data) AS e FROM docs">
	>().toEqualTypeOf<{ xmlexists: boolean; e: boolean | null }>();
	expectTypeOf<
		Row<"SELECT count(*) FROM docs WHERE xmlexists('/menu' PASSING data)">
	>().toEqualTypeOf<{ count: string }>();
	expectTypeOf<
		Row<"SELECT xmlelement(name all, xmlagg(xmlelement(name n, name))) FROM docs">
	>().toEqualTypeOf<{ xmlelement: string }>();
	expectTypeOf<
		Row<"SELECT xpath('/a', data), xmlcomment('c') FROM docs">
	>().toEqualTypeOf<{ xpath: string[]; xmlcomment: string }>();
	expectTypeOf<Row<"SELECT n_data IS NOT DOCUMENT FROM docs">>().toEqualTypeOf<{
		"?column?": boolean | null;
	}>();
	// syntax
	expectTypeOf<
		V<"SELECT xmlserialize(data AS text) FROM docs">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected DOCUMENT or CONTENT at or near data", 3>
	>();
	expectTypeOf<
		V<"SELECT xmlserialize(content data) FROM docs">
	>().toEqualTypeOf<SqlError<"syntax error: expected AS at or near )", 5>>();
	expectTypeOf<
		V<"SELECT xmlserialize(content data AS 1) FROM docs">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near 1", 6>
	>();
	expectTypeOf<V<"SELECT xmlserialize(content 1 + AS text)">>().toEqualTypeOf<
		SqlError<"syntax error at or near as", 6>
	>();
	expectTypeOf<V<"SELECT xmlexists('//a' data) FROM docs">>().toEqualTypeOf<
		SqlError<"syntax error: expected PASSING at or near data", 4>
	>();
	expectTypeOf<V<"SELECT xmlexists('/a' PASSING)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<V<"SELECT xmlexists()">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 3>
	>();
	expectTypeOf<
		V<"SELECT xmlexists('/a' PASSING data BY) FROM docs">
	>().toEqualTypeOf<SqlError<'syntax error: expected ")" at or near by', 6>>();
	// the keywords stay usable as column names
	expectTypeOf<
		Row<"SELECT x.xmlpi FROM (SELECT 1 AS xmlpi) x">
	>().toEqualTypeOf<{ xmlpi: number }>();
});

test("XMLTABLE", () => {
	expectTypeOf<
		Row<`SELECT xmltable.* FROM docs, LATERAL XMLTABLE('/rows/row' PASSING data COLUMNS
      id int PATH '@id', _id FOR ORDINALITY, name text PATH 'NAME' NOT NULL, size float PATH 'SIZE',
      premier text PATH 'P' DEFAULT 'not specified', other text DEFAULT n_name NULL)`>
	>().toEqualTypeOf<{
		id: number | null;
		_id: number;
		name: string;
		size: number | null;
		premier: string;
		other: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM XMLTABLE(XMLNAMESPACES('http://x.y' AS zz), '/zz:rows/zz:row' PASSING '<rows/>' COLUMNS a int PATH 'zz:a') AS t">
	>().toEqualTypeOf<{ a: number | null }>();
	expectTypeOf<
		Row<"SELECT t.x FROM docs, xmltable(('/d/' || path) PASSING data COLUMNS a xml PATH '.') AS t(x)">
	>().toEqualTypeOf<{ x: string | null }>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(ROW() PASSING null COLUMNS v1 timestamp) AS f(v1, v2)">
	>().toEqualTypeOf<
		SqlError<
			"XMLTABLE function has 1 columns available but 2 columns specified",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES(DEFAULT 'http://x.y'), '/rows' PASSING '<rows/>' COLUMNS a int)">
	>().toEqualTypeOf<SqlError<"DEFAULT namespace is not supported", 0>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS v1 int __pg__is_not_null 1)">
	>().toEqualTypeOf<
		SqlError<'option name "__pg__is_not_null" cannot be used in XMLTABLE', 11>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS v1 int NOT 1)">
	>().toEqualTypeOf<SqlError<"syntax error at or near 1", 12>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int PATH 'a' PATH 'b')">
	>().toEqualTypeOf<
		SqlError<"only one PATH value per column is allowed", 13>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int, a text)">
	>().toEqualTypeOf<SqlError<'column name "a" is not unique', 9>>();
	expectTypeOf<
		V<"SELECT * FROM docs, XMLTABLE('/r' PASSING name COLUMNS a int)">
	>().toEqualTypeOf<
		SqlError<"argument of XMLTABLE must be type xml, not type text", 0>
	>();
	// a column is nullable without NOT NULL or DEFAULT (JSON_ARRAY reads that too)
	expectTypeOf<
		Row<"SELECT json_array(t.a), json_array(t.b) AS j FROM XMLTABLE('/r' PASSING null COLUMNS a int, b int NOT NULL) t">
	>().toEqualTypeOf<{ json_array: unknown; j: [number] }>();
	// XMLNAMESPACES without "(" is a column
	expectTypeOf<
		Row<"SELECT t.a FROM (SELECT '/a' AS xmlnamespaces) s, XMLTABLE(xmlnamespaces PASSING '<a/>' COLUMNS a int) t">
	>().toEqualTypeOf<{ a: number | null }>();
	expectTypeOf<
		Row<"SELECT * FROM XMLTABLE(XMLNAMESPACES('a' AS x, 'b' AS y), '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<{ a: number | null }>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a FOR ORDINALITY, b FOR ORDINALITY)">
	>().toEqualTypeOf<SqlError<"only one FOR ORDINALITY column is allowed", 0>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES(nope AS x), '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 7>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(nope PASSING null COLUMNS a int)">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 5>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int PATH nope)">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 12>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int DEFAULT nope)">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 12>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int DEFAULT 1 DEFAULT 2)">
	>().toEqualTypeOf<SqlError<"only one DEFAULT value is allowed", 13>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int NOT NULL NOT NULL)">
	>().toEqualTypeOf<
		SqlError<
			'conflicting or redundant NULL / NOT NULL declarations for column "a"',
			13
		>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int NOT NULL NULL)">
	>().toEqualTypeOf<
		SqlError<
			'conflicting or redundant NULL / NOT NULL declarations for column "a"',
			13
		>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int foo 1)">
	>().toEqualTypeOf<SqlError<'unrecognized column option "foo"', 11>>();
	expectTypeOf<
		V<`SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int "foo" 1)`>
	>().toEqualTypeOf<SqlError<'unrecognized column option "foo"', 11>>();
	// syntax
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int foo )">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 12>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int PATH)">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 12>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int DEFAULT)">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 12>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a 1)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near 1", 10>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS 1)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near 1", 9>
	>();
	expectTypeOf<V<"SELECT * FROM XMLTABLE('/r' PASSING)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 7>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES(DEFAULT), '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 8>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES('a' AS 1), '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<SqlError<"syntax error: expected name at or near 1", 9>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES('a' AS x y), '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near y', 10>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int FROM x)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 11>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' null COLUMNS a int)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected PASSING at or near null", 6>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null a int)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected COLUMNS at or near a", 8>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 11>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE('/r' PASSING null COLUMNS a int) AS 1">
	>().toEqualTypeOf<SqlError<"syntax error at or near 1", 13>>();
	expectTypeOf<V<"SELECT * FROM XMLTABLE()">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 5>
	>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES('http://x' zz), '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<SqlError<"syntax error: expected AS at or near zz", 8>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES(), '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 7>>();
	expectTypeOf<
		V<"SELECT * FROM XMLTABLE(XMLNAMESPACES('a' AS x) '/r' PASSING null COLUMNS a int)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected \",\" at or near '/r'", 11>
	>();
});

test("parameters", () => {
	expectTypeOf<
		Params<"SELECT xmlconcat('<a/>', $1), xmlpi(name x, $2), xmlparse(content $3), xmlserialize(content $4 AS text), $5 IS DOCUMENT">
	>().toEqualTypeOf<
		[string | null, string | null, string | null, string | null, string | null]
	>();
	expectTypeOf<
		Params<"SELECT xmlroot($1, version $2), xmlexists($3 PASSING $4)">
	>().toEqualTypeOf<
		[string | null, string | null, string | null, string | null]
	>();
	expectTypeOf<
		Params<"SELECT * FROM XMLTABLE($1 PASSING $2 COLUMNS a int PATH $3 DEFAULT $4)">
	>().toEqualTypeOf<
		[string | null, string | null, string | null, number | null]
	>();
	// XMLELEMENT / XMLFOREST values stay untyped
	expectTypeOf<
		Params<"SELECT xmlelement(name e, xmlattributes($1::int AS a), $2::text), xmlforest($3::int AS b)">
	>().toEqualTypeOf<[number, string, number]>();
	// which operands are xml and which text
	type X = { readonly xml: string } | null;
	expectTypeOf<
		XmlParams<"SELECT xmlconcat('<a/>', $1), xmlpi(name x, $2), xmlparse(content $3), xmlserialize(content $4 AS text), $5 IS DOCUMENT, xmlroot($6, version $7), xmlexists($8 PASSING $9)">
	>().toEqualTypeOf<
		[X, string | null, string | null, X, X, X, string | null, string | null, X]
	>();
	expectTypeOf<
		XmlParams<"SELECT * FROM XMLTABLE(XMLNAMESPACES($1 AS x), $2 PASSING $3 COLUMNS a int PATH $4 DEFAULT $5)">
	>().toEqualTypeOf<
		[string | null, string | null, X, string | null, number | null]
	>();
});
