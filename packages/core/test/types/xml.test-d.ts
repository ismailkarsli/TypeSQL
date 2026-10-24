import { expectTypeOf, test } from "vitest";
import type {
	Col,
	DefaultTypeMap,
	Nullable,
	ParamsOf,
	RowOf,
	SqlError,
	Validate,
} from "../../src/index.js";

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
});
