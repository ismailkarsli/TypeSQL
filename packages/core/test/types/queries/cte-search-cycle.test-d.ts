import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../../src/index.js";
import type { Row, V } from "../_schema.js";

// WITH RECURSIVE ... SEARCH / CYCLE, verified against PostgreSQL 18. The columns they add are
// never NULL: the search sequence is record[] (DEPTH FIRST) or record (BREADTH FIRST), the
// cycle mark bool or the common type of TO / DEFAULT, the cycle path record[].

type Rec<Tail extends string> =
	`WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) ${Tail}`;

test("added columns", () => {
	expectTypeOf<
		Row<Rec<"SEARCH DEPTH FIRST BY n SET ord SELECT * FROM t">>
	>().toEqualTypeOf<{ n: number; ord: unknown[] }>();
	expectTypeOf<
		Row<Rec<"SEARCH BREADTH FIRST BY n SET ord SELECT * FROM t">>
	>().toEqualTypeOf<{ n: number; ord: unknown }>();
	expectTypeOf<
		Row<Rec<"CYCLE n SET is_cycle USING path SELECT * FROM t">>
	>().toEqualTypeOf<{ n: number; is_cycle: boolean; path: unknown[] }>();
	expectTypeOf<
		Row<
			Rec<"CYCLE n SET is_cycle TO 'Y' DEFAULT 'N' USING path SELECT is_cycle FROM t">
		>
	>().toEqualTypeOf<{ is_cycle: string }>();
	expectTypeOf<
		Row<Rec<"CYCLE n SET c TO 1 DEFAULT 0 USING p SELECT c FROM t">>
	>().toEqualTypeOf<{ c: number }>();
	// a string literal yields to the other value; a value of type unknown yields too, but not to
	// NULL or another unknown: then the mark is text
	expectTypeOf<
		Row<Rec<"CYCLE n SET c TO '1' DEFAULT 0 USING p SELECT c FROM t">>
	>().toEqualTypeOf<{ c: number }>();
	expectTypeOf<
		Row<
			Rec<"CYCLE n SET c TO unknown 'a' DEFAULT unknown 'b' USING p SELECT c FROM t">
		>
	>().toEqualTypeOf<{ c: string }>();
	expectTypeOf<
		Row<
			Rec<"CYCLE n SET c TO NULL DEFAULT unknown 'b' USING p SELECT c FROM t">
		>
	>().toEqualTypeOf<{ c: string }>();
	expectTypeOf<
		Row<Rec<"CYCLE n SET c TO 'a' DEFAULT unknown 'b' USING p SELECT c FROM t">>
	>().toEqualTypeOf<{ c: string }>();
	expectTypeOf<
		Row<
			Rec<"SEARCH DEPTH FIRST BY n SET ord CYCLE n SET c USING p SELECT * FROM t">
		>
	>().toEqualTypeOf<{ n: number; ord: unknown[]; c: boolean; p: unknown[] }>();
	// visible to later CTEs and to the recursive term itself
	expectTypeOf<
		Row<
			Rec<"SEARCH DEPTH FIRST BY n SET ord, u AS (SELECT ord FROM t) SELECT * FROM u">
		>
	>().toEqualTypeOf<{ ord: unknown[] }>();
	expectTypeOf<
		Row<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3 AND ord IS NULL) SEARCH DEPTH FIRST BY n SET ord SELECT n FROM t">
	>().toEqualTypeOf<{ n: number }>();
});

test("errors", () => {
	expectTypeOf<
		V<Rec<"SEARCH DEPTH FIRST BY foo SET ord SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<'search column "foo" not in WITH query column list', 27>
	>();
	expectTypeOf<
		V<Rec<"SEARCH DEPTH FIRST BY n, n SET ord SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<'search column "n" specified more than once', 4>
	>();
	expectTypeOf<
		V<Rec<"SEARCH DEPTH FIRST BY n SET n SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<
			'search sequence column name "n" already used in WITH query column list',
			4
		>
	>();
	expectTypeOf<
		V<Rec<"CYCLE foo SET c USING p SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<'cycle column "foo" not in WITH query column list', 24>
	>();
	// (with a recursive term that does not name n, which would be ambiguous first)
	expectTypeOf<
		V<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT 2 FROM t WHERE false) CYCLE n SET n USING p SELECT 1 FROM t">
	>().toEqualTypeOf<
		SqlError<
			'cycle mark column name "n" already used in WITH query column list',
			4
		>
	>();
	expectTypeOf<
		V<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT 2 FROM t WHERE false) CYCLE n SET c USING n SELECT 1 FROM t">
	>().toEqualTypeOf<
		SqlError<
			'cycle path column name "n" already used in WITH query column list',
			4
		>
	>();
	expectTypeOf<
		V<
			Rec<"SEARCH DEPTH FIRST BY n SET s CYCLE n SET s USING p SELECT * FROM t">
		>
	>().toEqualTypeOf<
		SqlError<
			"search sequence column name and cycle mark column name are the same",
			0
		>
	>();
	// the SEARCH clause is checked first
	expectTypeOf<
		V<
			Rec<"SEARCH DEPTH FIRST BY foo SET s CYCLE bar SET c USING p SELECT * FROM t">
		>
	>().toEqualTypeOf<
		SqlError<'search column "foo" not in WITH query column list', 27>
	>();
	expectTypeOf<V<Rec<"CYCLE n SET c USING c SELECT * FROM t">>>().toEqualTypeOf<
		SqlError<
			"cycle mark column name and cycle path column name are the same",
			0
		>
	>();
	expectTypeOf<
		V<
			Rec<"SEARCH DEPTH FIRST BY n SET s CYCLE n SET c USING s SELECT * FROM t">
		>
	>().toEqualTypeOf<
		SqlError<
			"search sequence column name and cycle path column name are the same",
			0
		>
	>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO true DEFAULT 55 USING p SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"CYCLE types boolean and integer cannot be matched", 23>
	>();
	expectTypeOf<
		V<
			Rec<"CYCLE n SET c TO point '(1,1)' DEFAULT point '(0,0)' USING p SELECT * FROM t">
		>
	>().toEqualTypeOf<
		SqlError<"could not identify an equality operator for type point", 0>
	>();
	// types without an equality operator (no default btree or hash operator class) or without <>
	type Mark<T extends string, L extends string> = V<
		Rec<`CYCLE n SET c TO ${T} '${L}' DEFAULT ${T} '${L}' USING p SELECT * FROM t`>
	>;
	expectTypeOf<
		[
			Mark<"polygon", "((0,0),(1,1),(1,0))">,
			Mark<"json", "1">,
			Mark<"xml", "<a/>">,
			Mark<"box", "(0,0),(1,1)">,
			Mark<"circle", "<(0,0),1>">,
			Mark<"jsonpath", "$">,
			Mark<"line", "{1,1,1}">,
			Mark<"lseg", "[(0,0),(1,1)]">,
			Mark<"path", "((0,0),(1,1))">,
			Mark<"pg_snapshot", "10:20:">,
			Mark<"refcursor", "a">,
			Mark<"txid_snapshot", "10:20:">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"could not identify an equality operator for type polygon", 0>,
			SqlError<"could not identify an equality operator for type json", 0>,
			SqlError<"could not identify an equality operator for type xml", 0>,
			SqlError<"could not identify an equality operator for type box", 0>,
			SqlError<"could not identify an equality operator for type circle", 0>,
			SqlError<"could not identify an equality operator for type jsonpath", 0>,
			SqlError<"could not identify an equality operator for type line", 0>,
			SqlError<"could not identify an equality operator for type lseg", 0>,
			SqlError<"could not identify an equality operator for type path", 0>,
			SqlError<
				"could not identify an equality operator for type pg_snapshot",
				0
			>,
			SqlError<"could not identify an equality operator for type refcursor", 0>,
			SqlError<
				"could not identify an equality operator for type txid_snapshot",
				0
			>,
		]
	>();
	expectTypeOf<
		[Mark<"aclitem", "postgres=r/postgres">, Mark<"cid", "1">]
	>().toEqualTypeOf<
		[
			SqlError<"could not identify an inequality operator for type aclitem", 0>,
			SqlError<"could not identify an inequality operator for type cid", 0>,
		]
	>();
	// jsonb, ranges, varchar, regclass, money compare
	expectTypeOf<
		[
			Row<
				Rec<"CYCLE n SET c TO jsonb '1' DEFAULT jsonb '2' USING p SELECT c FROM t">
			>,
			Row<
				Rec<"CYCLE n SET c TO int4range '[1,2)' DEFAULT int4range '[1,3)' USING p SELECT c FROM t">
			>,
		]
	>().toEqualTypeOf<[{ c: unknown }, { c: string }]>();
	// TO / DEFAULT are constants
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO -1 DEFAULT 0 USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near -", 28>>();
	expectTypeOf<
		V<"WITH t(n) AS (SELECT 1) SEARCH DEPTH FIRST BY n SET ord SELECT * FROM t">
	>().toEqualTypeOf<SqlError<"WITH query is not recursive", 0>>();
	expectTypeOf<
		V<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT n + 1 FROM t WHERE n < 3) SEARCH DEPTH FIRST BY n SET s SELECT * FROM t">
	>().toEqualTypeOf<
		SqlError<
			"with a SEARCH or CYCLE clause, the left side of the UNION must be a SELECT",
			0
		>
	>();
	expectTypeOf<
		V<"WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL (SELECT 2 UNION ALL SELECT n + 1 FROM t WHERE n < 3)) SEARCH DEPTH FIRST BY n SET s SELECT * FROM t">
	>().toEqualTypeOf<
		SqlError<
			"with a SEARCH or CYCLE clause, the right side of the UNION must be a SELECT",
			0
		>
	>();
});
