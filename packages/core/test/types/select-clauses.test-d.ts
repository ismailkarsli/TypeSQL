import { expectTypeOf, test } from "vitest";
import type { Lex, ParseProgram } from "../../src/engine/index.js";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// The FROM-item aliases, joins, GROUP BY, WINDOW and WITH clauses as PostgreSQL 18 parses them:
// what each accepts, and where a syntax error is (the token PostgreSQL reports it at).

type Rec<Tail extends string> =
	`WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) ${Tail}`;

test("a function's alias, column aliases and column definition list", () => {
	// `alias (` opens a column definition list unless its first name is followed by `,` or `)`
	expectTypeOf<
		Row<"SELECT r.a FROM json_to_record('{\"a\":1}') r(a int)">
	>().toEqualTypeOf<{ a: number | null }>();
	expectTypeOf<Row<"SELECT * FROM jsonb_each('{}') j(k)">>().toEqualTypeOf<{
		k: string;
		value: unknown;
	}>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') r(a, b int)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near int', 12>
	>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') r(a int, b)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near )", 13>
	>();
	// a column definition list needs the alias, and comes instead of column aliases
	expectTypeOf<V<"SELECT * FROM json_to_record('{}') (a int)">>().toEqualTypeOf<
		SqlError<"syntax error at or near (", 7>
	>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') r(a)(b int)">
	>().toEqualTypeOf<SqlError<"syntax error at or near (", 11>>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') WITH ORDINALITY (a int)">
	>().toEqualTypeOf<SqlError<"syntax error at or near (", 9>>();
	expectTypeOf<
		V<"SELECT * FROM json_to_recordset('[]') WITH ORDINALITY AS r(a int)">
	>().toEqualTypeOf<
		SqlError<"WITH ORDINALITY cannot be used with a column definition list", 11>
	>();
	expectTypeOf<
		V<"SELECT * FROM json_to_recordset('[]') WITH ORDINALITY r(a int)">
	>().toEqualTypeOf<
		SqlError<"WITH ORDINALITY cannot be used with a column definition list", 10>
	>();
	expectTypeOf<
		V<"SELECT * FROM generate_series(1, 2) AS order">
	>().toEqualTypeOf<SqlError<"syntax error at or near order", 10>>();
});

test("column definition list syntax errors", () => {
	expectTypeOf<V<"SELECT * FROM json_to_record('{}') AS (a)">>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near )", 10>
	>();
	expectTypeOf<V<"SELECT * FROM json_to_record('{}') AS ()">>().toEqualTypeOf<
		SqlError<"syntax error: expected column definition at or near )", 9>
	>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') AS r(a int b)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near b', 12>
	>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') AS r(a int,)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column definition at or near )", 13>
	>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') AS r(a 1)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected type name at or near 1", 11>
	>();
	expectTypeOf<
		V<"SELECT * FROM json_to_record('{}') AS r(1 int)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column definition at or near 1", 10>
	>();
});

test("the column alias list of a table or subquery is a list of names", () => {
	expectTypeOf<V<"SELECT 1 FROM users u(a b)">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near b', 7>
	>();
	expectTypeOf<V<"SELECT * FROM (SELECT 1) s(a b)">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near b', 10>
	>();
	expectTypeOf<Row<"SELECT s.a FROM (SELECT 1) s(a)">>().toEqualTypeOf<{
		a: number;
	}>();
});

test("join words", () => {
	expectTypeOf<
		Row<"SELECT u.id, p.id AS pid FROM users u INNER JOIN posts p ON true">
	>().toEqualTypeOf<{ id: number; pid: string }>();
	expectTypeOf<
		Row<"SELECT u.id, p.id AS pid FROM users u LEFT OUTER JOIN posts p ON true">
	>().toEqualTypeOf<{ id: number; pid: string | null }>();
	expectTypeOf<
		Row<"SELECT u.id, p.id AS pid FROM users u RIGHT OUTER JOIN posts p ON true">
	>().toEqualTypeOf<{ id: number | null; pid: string }>();
	expectTypeOf<
		Row<"SELECT u.id, p.id AS pid FROM users u FULL OUTER JOIN posts p ON true">
	>().toEqualTypeOf<{ id: number | null; pid: string | null }>();
	// NATURAL merges the common columns; CROSS does not
	expectTypeOf<Row<"SELECT id FROM users NATURAL JOIN posts">>().toEqualTypeOf<{
		id: string;
	}>();
	expectTypeOf<V<"SELECT id FROM users CROSS JOIN posts">>().toEqualTypeOf<
		SqlError<'column reference "id" is ambiguous', 1>
	>();
	// a join word without JOIN: the error is where JOIN is missing
	expectTypeOf<V<"SELECT * FROM users CROSS posts">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near posts", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users NATURAL posts">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near posts", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users INNER posts">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near posts", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users LEFT posts">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near posts", 5>
	>();
	expectTypeOf<V<"SELECT * FROM users LEFT OUTER posts">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near posts", 6>
	>();
	expectTypeOf<V<"SELECT 1 FROM users u RIGHT OUTER posts">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near posts", 7>
	>();
	expectTypeOf<V<"SELECT 1 FROM users u LEFT">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near end of input", 6>
	>();
	expectTypeOf<V<"SELECT 1 FROM users u NATURAL INNER posts">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near posts", 7>
	>();
	expectTypeOf<
		V<"SELECT 1 FROM users NATURAL CROSS JOIN posts">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near cross", 5>
	>();
	expectTypeOf<
		V<"SELECT * FROM users u WHERE JOIN posts ON true">
	>().toEqualTypeOf<SqlError<"syntax error at or near posts", 7>>();
});

test("the right side and the qualification of a join", () => {
	expectTypeOf<V<"SELECT * FROM users JOIN 1">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near 1",
			5
		>
	>();
	expectTypeOf<V<"SELECT * FROM users JOIN posts WHERE true">>().toEqualTypeOf<
		SqlError<"syntax error: expected ON or USING at or near where", 6>
	>();
	expectTypeOf<V<"SELECT * FROM users JOIN posts CROSS x">>().toEqualTypeOf<
		SqlError<"syntax error: expected JOIN at or near x", 7>
	>();
	expectTypeOf<V<"SELECT * FROM users JOIN posts ON )">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 7>
	>();
	// USING (...) AS alias: the alias is a ColId
	expectTypeOf<
		Row<"SELECT 1 AS one FROM users JOIN posts USING (id) AS j">
	>().toEqualTypeOf<{ one: number }>();
	expectTypeOf<
		V<"SELECT 1 FROM users JOIN posts USING (id) AS 1">
	>().toEqualTypeOf<SqlError<"syntax error at or near 1", 11>>();
	expectTypeOf<
		V<"SELECT 1 FROM users JOIN posts USING (id) AS order">
	>().toEqualTypeOf<SqlError<"syntax error at or near order", 11>>();
	expectTypeOf<
		V<"SELECT 1 FROM users JOIN posts USING (id) j">
	>().toEqualTypeOf<SqlError<"syntax error at or near j", 10>>();
});

test("GROUP BY items", () => {
	expectTypeOf<
		Row<"SELECT id FROM users GROUP BY DISTINCT id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT id FROM users GROUP BY ALL id">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT id FROM users GROUP BY (id)">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT count(*) FROM users GROUP BY ()">>().toEqualTypeOf<{
		count: string;
	}>();
	// CUBE, ROLLUP and GROUPING not followed by `(` / SETS are column names
	expectTypeOf<
		Row<"SELECT g.cube FROM (SELECT 1 AS cube) g GROUP BY cube">
	>().toEqualTypeOf<{ cube: number }>();
	expectTypeOf<
		Row<"SELECT g.rollup FROM (SELECT 1 AS rollup) g GROUP BY rollup">
	>().toEqualTypeOf<{ rollup: number }>();
	expectTypeOf<
		Row<"SELECT g.grouping FROM (SELECT 1 AS grouping) g GROUP BY grouping">
	>().toEqualTypeOf<{ grouping: number }>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY ROLLUP (id">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 9>
	>();
	expectTypeOf<
		V<"SELECT id FROM users GROUP BY ROLLUP (id email)">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near email', 9>
	>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY ROLLUP ()">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 8>
	>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY CUBE (1 +)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 10>
	>();
	expectTypeOf<
		V<"SELECT id FROM users GROUP BY GROUPING SETS id">
	>().toEqualTypeOf<SqlError<'syntax error: expected "(" at or near id', 8>>();
});

test("WINDOW syntax errors", () => {
	expectTypeOf<
		V<"SELECT 1 FROM users WINDOW w (PARTITION BY id)">
	>().toEqualTypeOf<SqlError<"syntax error: expected AS at or near (", 6>>();
	expectTypeOf<V<"SELECT 1 FROM users WINDOW w AS x">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near x', 7>
	>();
});

test("WITH syntax errors", () => {
	expectTypeOf<V<"WITH x SELECT 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected AS at or near select", 2>
	>();
	expectTypeOf<V<"WITH x AS SELECT 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near select', 3>
	>();
	expectTypeOf<V<"WITH x AS (SELECT 1 2) SELECT 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near 2', 6>
	>();
	expectTypeOf<V<"WITH x AS (SELEC 1) SELECT 1">>().toEqualTypeOf<
		SqlError<"syntax error at or near selec", 4>
	>();
	expectTypeOf<V<"WITH x(a b) AS (SELECT 1, 2) SELECT 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near b', 4>
	>();
});

test("SEARCH syntax errors", () => {
	expectTypeOf<
		V<Rec<"SEARCH WIDTH FIRST BY n SET o SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"syntax error: expected DEPTH or BREADTH at or near width", 24>
	>();
	expectTypeOf<
		V<Rec<"SEARCH DEPTH BY n SET o SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"syntax error: expected FIRST BY at or near by", 25>
	>();
	expectTypeOf<
		V<Rec<"SEARCH DEPTH FIRST BY n o SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error: expected SET at or near o", 28>>();
	expectTypeOf<
		V<Rec<"SEARCH DEPTH FIRST BY 1 SET o SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near 1", 27>
	>();
	expectTypeOf<
		V<Rec<"SEARCH DEPTH FIRST BY n, SET o SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error: expected SET at or near o", 30>>();
	expectTypeOf<
		V<Rec<"SEARCH BREADTH FIRST BY n SET 1 SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near 1", 29>
	>();
});

test("CYCLE syntax errors", () => {
	expectTypeOf<V<Rec<"CYCLE 1 SET c USING p SELECT * FROM t">>>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near 1", 24>
	>();
	expectTypeOf<V<Rec<"CYCLE n USING p SELECT * FROM t">>>().toEqualTypeOf<
		SqlError<"syntax error: expected SET at or near using", 25>
	>();
	expectTypeOf<V<Rec<"CYCLE n SET 1 USING p SELECT * FROM t">>>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near 1", 26>
	>();
	expectTypeOf<V<Rec<"CYCLE n SET c p SELECT * FROM t">>>().toEqualTypeOf<
		SqlError<"syntax error: expected USING at or near p", 27>
	>();
	expectTypeOf<V<Rec<"CYCLE n SET c USING 1 SELECT * FROM t">>>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near 1", 28>
	>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO true USING p SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"syntax error: expected DEFAULT at or near using", 29>
	>();
	expectTypeOf<
		V<Rec<"SEARCH DEPTH FIRST BY n SET o CYCLE n USING p SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"syntax error: expected SET at or near using", 32>
	>();
});

test("CYCLE's TO and DEFAULT take constants", () => {
	expectTypeOf<
		Row<Rec<"CYCLE n SET c TO int4 '1' DEFAULT 0 USING p SELECT c FROM t">>
	>().toEqualTypeOf<{ c: number }>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO ) DEFAULT false USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 28>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO true DEFAULT ) USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near )", 30>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO (1) DEFAULT 0 USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near (", 28>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO -1 DEFAULT 0 USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near -", 28>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO ARRAY[1] DEFAULT 0 USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near array", 28>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO 1 + 1 DEFAULT 0 USING p SELECT * FROM t">>
	>().toEqualTypeOf<
		SqlError<"syntax error: expected DEFAULT at or near +", 29>
	>();
	// after a name Postgres expects the string of a `type 'literal'`
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO x DEFAULT false USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near default", 29>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO x.y DEFAULT false USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near default", 31>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO f(1) DEFAULT 0 USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near default", 32>>();
	expectTypeOf<
		V<Rec<"CYCLE n SET c TO true DEFAULT x USING p SELECT * FROM t">>
	>().toEqualTypeOf<SqlError<"syntax error at or near using", 31>>();
});

test("the parsed SEARCH and CYCLE clauses", () => {
	type Cte<Q extends string> =
		ParseProgram<Lex<Q>> extends {
			readonly with: { readonly ctes: readonly [infer C] };
		}
			? C
			: never;
	type C =
		Cte<"WITH RECURSIVE t(n) AS (SELECT 1) SEARCH BREADTH FIRST BY n SET o CYCLE n SET c TO 1 DEFAULT 0 USING p SELECT 1">;
	expectTypeOf<C["search"]>().toEqualTypeOf<{
		breadth: true;
		cols: ["n"];
		set: "o";
	}>();
	expectTypeOf<C["cycle"]>().toEqualTypeOf<{
		cols: ["n"];
		set: "c";
		to: { t: "num"; v: "1" };
		default: { t: "num"; v: "0" };
		using: "p";
	}>();
	expectTypeOf<
		Cte<"WITH RECURSIVE t(n) AS (SELECT 1) SEARCH DEPTH FIRST BY n SET o SELECT 1">["search"]
	>().toEqualTypeOf<{ breadth: false; cols: ["n"]; set: "o" }>();
});
