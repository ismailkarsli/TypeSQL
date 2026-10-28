import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../../src/index.js";
import type { Row, V } from "../_schema.js";

// FROM items: column order and names, renames, joins and their errors. Every expectation was
// checked against PostgreSQL 18; error positions are token indexes (see errors.test-d.ts).

test("a name in several FROM items: the later one's column, as the row object keeps it", () => {
	expectTypeOf<
		[
			Row<"SELECT * FROM users, posts">["id"],
			Row<"SELECT * FROM users CROSS JOIN posts">["id"],
			Row<"SELECT * FROM users a LEFT JOIN users b USING (id)">["email"],
		]
	>().toEqualTypeOf<[string, string, string | null]>();
	// renamed columns come first, then the rest
	expectTypeOf<
		Row<"SELECT * FROM (SELECT 1 AS a, 'x' AS b) AS x(b)">
	>().toEqualTypeOf<{ b: string }>();
});

test("function columns renamed by position", () => {
	expectTypeOf<
		[
			Row<"SELECT * FROM json_each('{}') AS t(a, b)">,
			Row<"SELECT * FROM json_each_text('{}') AS t(a, b)">,
			Row<"SELECT * FROM jsonb_each_text('{}') AS t(a, b)">,
			Row<"SELECT * FROM CAST(1 AS int) WITH ORDINALITY AS t(a, b)">,
		]
	>().toEqualTypeOf<
		[
			{ a: string; b: unknown },
			{ a: string; b: string | null },
			{ a: string; b: string | null },
			{ a: number; b: string },
		]
	>();
});

test("set-returning functions named by an OUT parameter: value", () => {
	expectTypeOf<
		[
			Row<"SELECT * FROM json_array_elements('[]')">,
			Row<"SELECT * FROM json_array_elements_text('[]')">,
			Row<"SELECT * FROM jsonb_array_elements('[]')">,
			Row<"SELECT * FROM jsonb_array_elements_text('[]')">,
			Row<"SELECT * FROM unnest(ARRAY[1])">,
		]
	>().toEqualTypeOf<
		[
			{ value: unknown },
			{ value: string | null },
			{ value: unknown },
			{ value: string | null },
			{ unnest: number },
		]
	>();
});

test("column definition lists, ROWS FROM", () => {
	expectTypeOf<
		[
			Row<"SELECT * FROM json_to_record('{\"a\":1}') AS x(a int)">,
			Row<"SELECT * FROM ROWS FROM (json_to_record('{}') AS (a int))">,
			// named after the first function
			Row<"SELECT generate_series.* FROM ROWS FROM (generate_series(1, 2), generate_series(1, 3))">,
		]
	>().toEqualTypeOf<
		[
			{ a: number | null },
			{ a: number | null },
			{ generate_series: number | null },
		]
	>();
	expectTypeOf<
		[
			V<"SELECT * FROM json_to_record('{}')">,
			V<"SELECT * FROM jsonb_to_record('{}')">,
			V<"SELECT * FROM json_to_recordset('[]')">,
			V<"SELECT * FROM jsonb_to_recordset('[]')">,
			V<"SELECT * FROM ROWS FROM (json_to_record('{}'), generate_series(1, 2))">,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				'a column definition list is required for functions returning "record"',
				0
			>,
			SqlError<
				'a column definition list is required for functions returning "record"',
				0
			>,
			SqlError<
				'a column definition list is required for functions returning "record"',
				0
			>,
			SqlError<
				'a column definition list is required for functions returning "record"',
				0
			>,
			SqlError<
				'a column definition list is required for functions returning "record"',
				0
			>,
		]
	>();
});

test("USING keeps an outer join's nullability on each side; it finds a column in any item", () => {
	expectTypeOf<
		[
			Row<"SELECT a.n_id AS l, b.n_id AS r FROM things a LEFT JOIN things b USING (n_id)">,
			Row<"SELECT a.n_id AS l, b.n_id AS r FROM things a RIGHT JOIN things b USING (n_id)">,
		]
	>().toEqualTypeOf<
		[
			{ l: number | null; r: number | null },
			{ l: number | null; r: number | null },
		]
	>();
	expectTypeOf<
		V<"SELECT 1 FROM users u CROSS JOIN posts p JOIN posts q USING (author_id)">
	>().toEqualTypeOf<"SELECT 1 FROM users u CROSS JOIN posts p JOIN posts q USING (author_id)">();
});

test("the merged USING column: never NULL in an inner join, the kept side's in LEFT / RIGHT, either side's in FULL", () => {
	type K<Q extends string> = Row<Q>["k"];
	expectTypeOf<
		[
			K<"SELECT k FROM (SELECT id AS k FROM things) a LEFT JOIN (SELECT n_id AS k FROM things) b USING (k)">,
			K<"SELECT k FROM (SELECT n_id AS k FROM things) a LEFT JOIN (SELECT id AS k FROM things) b USING (k)">,
			K<"SELECT k FROM (SELECT id AS k FROM things) a RIGHT JOIN (SELECT n_id AS k FROM things) b USING (k)">,
			K<"SELECT k FROM (SELECT n_id AS k FROM things) a RIGHT JOIN (SELECT id AS k FROM things) b USING (k)">,
			K<"SELECT k FROM (SELECT id AS k FROM things) a FULL JOIN (SELECT n_id AS k FROM things) b USING (k)">,
			K<"SELECT k FROM (SELECT n_id AS k FROM things) a FULL JOIN (SELECT id AS k FROM things) b USING (k)">,
			K<"SELECT k FROM (SELECT id AS k FROM things) a FULL JOIN (SELECT id AS k FROM things) b USING (k)">,
			K<"SELECT k FROM (SELECT n_id AS k FROM things) a NATURAL FULL JOIN (SELECT id AS k FROM things) b">,
			K<"SELECT k FROM (SELECT n_id AS k FROM things) a JOIN (SELECT n_id AS k FROM things) b USING (k)">,
		]
	>().toEqualTypeOf<
		[
			number,
			number | null,
			number | null,
			number,
			number | null,
			number | null,
			number,
			number | null,
			number,
		]
	>();
	// an inner join's USING columns are non-null on both sides too
	expectTypeOf<
		Row<"SELECT a.n_id AS l, b.n_id AS r FROM things a JOIN things b USING (n_id)">
	>().toEqualTypeOf<{ l: number; r: number }>();
});

test("XMLTABLE columns renamed by position", () => {
	expectTypeOf<
		Row<"SELECT *, 1 AS one FROM XMLTABLE('/a' PASSING '<a/>' COLUMNS b int) AS x(c)">
	>().toEqualTypeOf<{ c: number | null; one: number }>();
});

test("FROM item errors", () => {
	expectTypeOf<
		[
			V<"SELECT * FROM users u, generate_series(1, 2) u">,
			V<"SELECT * FROM users x, CAST(1 AS int) AS x">,
			V<"SELECT * FROM users x, XMLTABLE('/a' PASSING '<a/>' COLUMNS b int) AS x">,
			V<"SELECT * FROM users generate_series, ROWS FROM (generate_series(1, 2), generate_series(1, 2))">,
			V<"SELECT * FROM XMLTABLE('/a' PASSING '<a/>' COLUMNS b int) AS x(c, d)">,
			V<"SELECT * FROM CAST(1 AS int) AS t(a, b, c)">,
			V<"SELECT * FROM ROWS FROM (generate_series(1, 2), generate_series(1, 3)) AS t(a, b, c)">,
			V<"SELECT * FROM (SELECT * FROM users) AS x(a)">,
			V<"SELECT * FROM users u(a, b)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'table name "u" specified more than once', 4>,
			SqlError<'table name "x" specified more than once', 4>,
			SqlError<'table name "x" specified more than once', 4>,
			SqlError<'table name "generate_series" specified more than once', 4>,
			SqlError<
				"XMLTABLE function has 1 columns available but 2 columns specified",
				0
			>,
			SqlError<'table "t" has 1 columns available but 3 columns specified', 10>,
			SqlError<'table "t" has 2 columns available but 3 columns specified', 21>,
			SqlError<
				"a column alias list cannot rename the columns of a * projection",
				0
			>,
			SqlError<
				"column alias lists on table references are not supported; use a subquery to rename columns",
				0
			>,
		]
	>();
	expectTypeOf<
		[
			V<"SELECT * FROM CAST(nope AS int)">,
			V<"SELECT * FROM json_to_record(nope) AS x(a int)">,
			V<"SELECT * FROM nope JOIN users ON true">,
			V<"SELECT * FROM things, (SELECT nope.id) s">,
			V<"SELECT * FROM users u FULL JOIN LATERAL (SELECT u.id) s ON true">,
			V<"SELECT * FROM users u RIGHT JOIN LATERAL (SELECT u.id) s ON true">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'column "nope" does not exist', 5>,
			SqlError<'column "nope" does not exist', 5>,
			SqlError<'relation "nope" does not exist', 3>,
			SqlError<'missing FROM-clause entry for table "nope"', 7>,
			SqlError<'invalid reference to FROM-clause entry for table "u"', 4>,
			SqlError<'invalid reference to FROM-clause entry for table "u"', 4>,
		]
	>();
});

test("TABLESAMPLE arguments: numbers, unknowns and literals; not NULL; not the sampled table", () => {
	expectTypeOf<
		V<"SELECT 1 FROM things TABLESAMPLE bernoulli(1::int2), things t2 TABLESAMPLE system(1::int8), things t3 TABLESAMPLE bernoulli(1.5), things t4 TABLESAMPLE bernoulli(1::float4), things t5 TABLESAMPLE bernoulli(1::float8) REPEATABLE (1::int4), things t6 TABLESAMPLE bernoulli('10'), things t7 TABLESAMPLE bernoulli($1)">
	>().toEqualTypeOf<"SELECT 1 FROM things TABLESAMPLE bernoulli(1::int2), things t2 TABLESAMPLE system(1::int8), things t3 TABLESAMPLE bernoulli(1.5), things t4 TABLESAMPLE bernoulli(1::float4), things t5 TABLESAMPLE bernoulli(1::float8) REPEATABLE (1::int4), things t6 TABLESAMPLE bernoulli('10'), things t7 TABLESAMPLE bernoulli($1)">();
	expectTypeOf<
		[
			V<"SELECT 1 FROM things TABLESAMPLE bernoulli(NULL)">,
			V<"SELECT 1 FROM things TABLESAMPLE bernoulli(1) REPEATABLE (NULL)">,
			V<"SELECT 1 FROM things TABLESAMPLE bernoulli(CASE WHEN true THEN NULL END)">,
			V<"SELECT 1 FROM things t TABLESAMPLE bernoulli(t.score)">,
			V<"SELECT 1 FROM things TABLESAMPLE bernoulli(things.score)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"TABLESAMPLE parameter cannot be null", 0>,
			SqlError<"TABLESAMPLE REPEATABLE parameter cannot be null", 0>,
			SqlError<"argument of TABLESAMPLE must be type real, not type text", 0>,
			SqlError<'invalid reference to FROM-clause entry for table "t"', 4>,
			SqlError<'invalid reference to FROM-clause entry for table "things"', 3>,
		]
	>();
});
