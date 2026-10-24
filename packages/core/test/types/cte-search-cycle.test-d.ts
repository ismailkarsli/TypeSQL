import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

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
