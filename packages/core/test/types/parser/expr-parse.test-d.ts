import { expectTypeOf, test } from "vitest";
import type { Lex, ParseProgram } from "../../../src/engine/index.js";
import type { SqlError } from "../../../src/index.js";
import type { Row, V } from "../_schema.js";

// The expression parser (parser/expr.ts) against PostgreSQL 18's grammar (gram.y): operator
// precedence, the operators each context takes, indirection, and the errors of each construct.
// `'a' op 'b' || 'c'` tells the precedence of `op` from that of `||` (Op): boolean when `op`
// binds looser, text when it binds as tightly. What no type shows (NOT of LIKE, the quantifier
// of ANY / ALL) is checked on the tree.

/** The select list's expressions of `SELECT …`. */
type Exprs<Q extends string> =
	ParseProgram<Lex<Q>> extends {
		readonly body: { readonly targets: infer T };
	}
		? { [K in keyof T]: T[K] extends { readonly e: infer E } ? E : never }
		: never;
type C<N extends string> = { t: "col"; tbl: null; name: N };

test("comparison operators bind looser than other operators", () => {
	expectTypeOf<
		Row<"SELECT 'a' = 'b' || 'c' AS a, 'a' < 'b' || 'c' AS b, 'a' > 'b' || 'c' AS c, 'a' <= 'b' || 'c' AS d, 'a' >= 'b' || 'c' AS e, 'a' <> 'b' || 'c' AS f, 'a' != 'b' || 'c' AS g">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
		g: boolean;
	}>();
});

test("arithmetic operators bind tighter than other operators", () => {
	expectTypeOf<
		Row<"SELECT 'x' || 1 + 2 AS a, 'x' || 1 - 2 AS b, 'x' || 2 * 3 AS c, 'x' || 4 / 2 AS d, 'x' || 5 % 2 AS e, 'x' || 2 ^ 2 AS f, 1 + 2 || 'x' AS g">
	>().toEqualTypeOf<{
		a: string;
		b: string;
		c: string;
		d: string;
		e: string;
		f: string;
		g: string;
	}>();
});

test("IS, ISNULL and NOTNULL bind looser than comparisons", () => {
	expectTypeOf<
		Row<"SELECT 1 = 2 IS NULL AS a, 1 = 2 ISNULL AS b, 1 = 2 NOTNULL AS c, 1 = 2 IS NOT TRUE AS d">
	>().toEqualTypeOf<{ a: boolean; b: boolean; c: boolean; d: boolean }>();
	expectTypeOf<
		Row<"SELECT 'a' || 'b' ISNULL AS a, 'a' || 'b' NOTNULL AS b, 'a' || 'b' IS NULL AS c">
	>().toEqualTypeOf<{ a: boolean; b: boolean; c: boolean }>();
	// ISNULL is IS NULL, NOTNULL is IS NOT NULL
	expectTypeOf<
		Row<"SELECT n_id FROM things WHERE n_id ISNULL">
	>().toEqualTypeOf<{ n_id: number | null }>();
	expectTypeOf<
		Row<"SELECT n_id FROM things WHERE n_id NOTNULL">
	>().toEqualTypeOf<{ n_id: number }>();
});

test("LIKE, ILIKE, SIMILAR TO, IN and BETWEEN bind looser than other operators", () => {
	expectTypeOf<
		Row<"SELECT 'a' || 'b' NOT LIKE 'c' AS a, 'a' || 'b' IN ('ab') AS b, 'a' || 'b' LIKE 'ab' AS c, 'a' || 'b' ILIKE 'ab' AS d, 'a' || 'b' SIMILAR TO 'ab' AS e, 1 + 1 BETWEEN 1 AND 3 AS f, 'a' || 'b' NOT IN ('ab') AS g, 1 + 1 NOT BETWEEN 1 AND 3 AS h, 'a' || 'b' NOT SIMILAR TO 'ab' AS i, 'a' || 'b' NOT ILIKE 'ab' AS j">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
		g: boolean;
		h: boolean;
		i: boolean;
		j: boolean;
	}>();
});

test("OPERATOR(schema.op) is the operator op, at the precedence of other operators", () => {
	expectTypeOf<
		Row<"SELECT 1 OPERATOR(pg_catalog.+) 2 * 3 AS a, 'a' || 'b' OPERATOR(pg_catalog.=) 'ab' AS b, 'a' OPERATOR(pg_catalog.=) 'b' || 'c' AS c, OPERATOR(pg_catalog.-) 2 ^ 2 AS d, OPERATOR(pg_catalog.|/) 4 AS e, 1 OPERATOR(=) ANY (ARRAY[1]) AS f">
	>().toEqualTypeOf<{
		a: number;
		b: boolean;
		c: string;
		d: number;
		e: number;
		f: boolean;
	}>();
	// named ?column?, like other operators
	expectTypeOf<
		Row<"SELECT OPERATOR(pg_catalog.-) id FROM things">
	>().toEqualTypeOf<{ "?column?": number }>();
	// a prefix OPERATOR() binds looser than `+` and as tightly as `||`
	expectTypeOf<
		Row<"SELECT OPERATOR(pg_catalog.-) 2 + 1 AS a, OPERATOR(pg_catalog.~) 1 || 'x' AS b">
	>().toEqualTypeOf<{ a: number; b: string }>();
});

test("operators that cannot start an operand", () => {
	expectTypeOf<
		[
			V<"SELECT / 1">,
			V<"SELECT % 1">,
			V<"SELECT ^ 1">,
			V<"SELECT > 1">,
			V<"SELECT = 1">,
			V<"SELECT <= 1">,
			V<"SELECT >= 1">,
			V<"SELECT <> 1">,
			V<"SELECT != 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near /", 1>,
			SqlError<"syntax error at or near %", 1>,
			SqlError<"syntax error at or near ^", 1>,
			SqlError<"syntax error at or near >", 1>,
			SqlError<"syntax error at or near =", 1>,
			SqlError<"syntax error at or near <=", 1>,
			SqlError<"syntax error at or near >=", 1>,
			SqlError<"syntax error at or near <>", 1>,
			SqlError<"syntax error at or near !=", 1>,
		]
	>();
	expectTypeOf<
		[
			V<"SELECT => 1">,
			V<"SELECT (;)">,
			V<"SELECT . 1">,
			V<"SELECT : 1">,
			V<"SELECT ::int">,
			V<"SELECT := 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near =>", 1>,
			SqlError<"syntax error at or near ;", 2>,
			SqlError<"syntax error at or near .", 1>,
			SqlError<"syntax error at or near :", 1>,
			SqlError<"syntax error at or near ::", 1>,
			SqlError<"syntax error at or near :=", 1>,
		]
	>();
});

test("=> and := are not infix operators", () => {
	expectTypeOf<[V<"SELECT 1 => 2">, V<"SELECT 1 := 2">]>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near =>", 2>,
			SqlError<"syntax error at or near :=", 2>,
		]
	>();
});

test("a c_expr takes no operators: FROM functions, XMLEXISTS operands", () => {
	expectTypeOf<
		[
			V<"SELECT * FROM generate_series(1, 2)::int">,
			V<"SELECT * FROM generate_series(1, 2)[1]">,
			V<"SELECT * FROM generate_series(1, 2) AT TIME ZONE 'utc'">,
			V<'SELECT * FROM generate_series(1, 2) COLLATE "C"'>,
			V<"SELECT xmlexists('//a' PASSING x::xml) FROM (SELECT '<a/>' AS x) s">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near ::", 9>,
			SqlError<"syntax error at or near [", 9>,
			SqlError<"syntax error at or near time", 10>,
			SqlError<"syntax error at or near collate", 9>,
			SqlError<'syntax error: expected ")" at or near ::', 6>,
		]
	>();
	// but a column with a subscript is a c_expr
	expectTypeOf<
		Row<"SELECT xmlexists('//a' PASSING x[1]) AS a FROM (SELECT ARRAY['<a/>'::xml] AS x) s">
	>().toEqualTypeOf<{ a: boolean | null }>();
});

test("subscripts and field selections follow columns, parameters, parentheses, subqueries and other indirections", () => {
	expectTypeOf<
		Row<"SELECT (nums)[1] AS a, (SELECT t.nums FROM things t LIMIT 1)[1] AS b, nums[1:2][1] AS c, (nums)[1:2] AS d FROM things">
	>().toEqualTypeOf<{
		a: number | null;
		b: number | null;
		c: number[];
		d: number[];
	}>();
	// the subscript is read (its error is reported) after each of them
	expectTypeOf<
		[
			V<"SELECT $1[)">,
			V<"SELECT nums[1][) FROM things">,
			V<"SELECT nums[1:2][) FROM things">,
			V<"SELECT (SELECT nums FROM things)[)">,
			V<"SELECT (ROW(1, 2)).f1[)">,
			V<"SELECT nums[1:2].) FROM things">,
			V<"SELECT (SELECT 1).)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near )", 3>,
			SqlError<"syntax error at or near )", 6>,
			SqlError<"syntax error at or near )", 8>,
			SqlError<"syntax error at or near )", 8>,
			SqlError<"syntax error at or near )", 12>,
			SqlError<"syntax error: expected field name at or near )", 8>,
			SqlError<"syntax error: expected field name at or near )", 6>,
		]
	>();
	// `.*` of a subquery's row
	expectTypeOf<
		Row<"SELECT (SELECT u FROM users u LIMIT 1).*">
	>().toEqualTypeOf<{
		id: number | null;
		email: string | null;
		display_name: string | null;
		created_at: Date | null;
	}>();
	expectTypeOf<V<"SELECT (SELECT 1).*">>().toEqualTypeOf<
		SqlError<"(e).* needs a whole-row value such as (t).*", 0>
	>();
	// Postgres: a function call, a constant, ARRAY[…] and a row constructor take no indirection
	expectTypeOf<
		[
			V<"SELECT now().x">,
			V<"SELECT now()[1]">,
			V<"SELECT 'a'[1]">,
			V<"SELECT ARRAY[1][1]">,
			V<"SELECT ROW(1, 2).f1">,
			V<"SELECT (1, 2).f1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near .", 4>,
			SqlError<"syntax error at or near [", 4>,
			SqlError<"syntax error at or near [", 2>,
			SqlError<"syntax error at or near [", 5>,
			SqlError<"syntax error at or near .", 7>,
			SqlError<"syntax error at or near .", 6>,
		]
	>();
});

test("IS forms", () => {
	expectTypeOf<
		Row<"SELECT 1 IS DISTINCT FROM 2 AS a, 1 IS NOT DISTINCT FROM 2 AS b, 'a' IS NORMALIZED AS c, 'a' IS NOT NFKD NORMALIZED AS d, 'a' IS NFC NORMALIZED AS e, 'a' IS NFD NORMALIZED AS f, 'a' IS NFKC NORMALIZED AS g">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		f: boolean;
		g: boolean;
	}>();
	// IS NORMALIZED is a call of is_normalized; IS NOT NORMALIZED its negation
	expectTypeOf<Row<"SELECT 'a' IS NORMALIZED">>().toEqualTypeOf<{
		is_normalized: boolean;
	}>();
	expectTypeOf<Row<"SELECT 'a' IS NOT NORMALIZED">>().toEqualTypeOf<{
		"?column?": boolean;
	}>();
	expectTypeOf<
		Row<"SELECT '1' IS JSON VALUE AS a, '1' IS JSON SCALAR AS b, '[]' IS JSON ARRAY AS c, '{}' IS NOT JSON OBJECT AS d, '1' IS JSON WITH UNIQUE KEYS AS e">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
	}>();
	expectTypeOf<
		[
			V<"SELECT 1 IS foo">,
			V<"SELECT 1 IS 1">,
			V<"SELECT 1 IS DISTINCT 1">,
			V<"SELECT 1 IS DISTINCT FROM )">,
			V<"SELECT 'a' IS NFC">,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				"syntax error: expected NULL, TRUE, FALSE, UNKNOWN, DISTINCT FROM or NORMALIZED at or near foo",
				3
			>,
			SqlError<
				"syntax error: expected NULL, TRUE, FALSE, UNKNOWN, DISTINCT FROM or NORMALIZED at or near 1",
				3
			>,
			SqlError<"syntax error: expected FROM at or near 1", 4>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error: expected NORMALIZED at or near end of input", 4>,
		]
	>();
});

test("NOT BETWEEN does not make its bounds non-null", () => {
	expectTypeOf<
		Row<"SELECT n_id, n_big FROM things WHERE n_id NOT BETWEEN n_big AND 1">
	>().toEqualTypeOf<{ n_id: number; n_big: string | null }>();
	expectTypeOf<
		Row<"SELECT n_id, n_big FROM things WHERE n_id BETWEEN n_big AND 1">
	>().toEqualTypeOf<{ n_id: number; n_big: string }>();
	expectTypeOf<
		Row<"SELECT 2 BETWEEN SYMMETRIC 3 AND 1 AS a, 2 BETWEEN ASYMMETRIC 1 AND 3 AS b, 2 NOT BETWEEN SYMMETRIC 3 AND 1 AS c">
	>().toEqualTypeOf<{ a: boolean; b: boolean; c: boolean }>();
});

test("errors in the operands of special operators", () => {
	expectTypeOf<
		[
			V<"SELECT 1 = ANY (ARRAY[1]">,
			V<"SELECT 1 = ANY ()">,
			V<"SELECT 1 ~ ANY ()">,
			V<"SELECT 1::)">,
			V<"SELECT nums[1 FROM things">,
			V<"SELECT nums[1:2 FROM things">,
			V<"SELECT nums[1:) FROM things">,
			V<"SELECT nums[) FROM things">,
			V<"SELECT nums[:) FROM things">,
			V<"SELECT 1 WHERE true AND )">,
			V<"SELECT 1 WHERE true OR )">,
			V<"SELECT 1 + )">,
			V<"SELECT 1 = )">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'syntax error: expected ")" at or near end of input', 9>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error: expected type name at or near )", 3>,
			SqlError<'syntax error: expected "]" at or near from', 4>,
			SqlError<'syntax error: expected "]" at or near from', 6>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error at or near )", 3>,
			SqlError<"syntax error at or near )", 4>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error at or near )", 3>,
			SqlError<"syntax error at or near )", 3>,
		]
	>();
	expectTypeOf<
		[
			V<"SELECT 'a' NOT SIMILAR 'b'">,
			V<"SELECT 1 WHERE 1 NOT 1">,
			V<"SELECT 1 IN 1">,
			V<"SELECT 1 IN (SELECT 1">,
			V<"SELECT 1 IN (SELECT 1 +)">,
			V<"SELECT 1 IN (1,)">,
			V<"SELECT 1 IN (1">,
			V<"SELECT 1 WHERE 'a' LIKE )">,
			V<"SELECT 'a' LIKE 'b' ESCAPE )">,
			V<"SELECT 1 WHERE 1 BETWEEN ) AND 2">,
			V<"SELECT 1 BETWEEN 1 AND )">,
			V<"SELECT 1 BETWEEN 1 2">,
			V<"SELECT at AT foo FROM things">,
			V<"SELECT at AT TIME ZONE ) FROM things">,
			V<"SELECT 'a' COLLATE 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected TO at or near 'b'", 4>,
			SqlError<"syntax error at or near not", 4>,
			SqlError<'syntax error: expected "(" at or near 1', 3>,
			SqlError<'syntax error: expected ")" at or near end of input', 6>,
			SqlError<"syntax error at or near )", 7>,
			SqlError<"syntax error at or near )", 6>,
			SqlError<'syntax error: expected ")" at or near end of input', 5>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error: expected AND at or near 2", 4>,
			SqlError<"syntax error: expected TIME ZONE or LOCAL at or near foo", 3>,
			SqlError<"syntax error at or near )", 5>,
			SqlError<"syntax error: expected collation name at or near 1", 3>,
		]
	>();
});

test("OVERLAPS takes two rows of two", () => {
	expectTypeOf<Exprs<"SELECT (a, b) OVERLAPS (c, d)">>().toExtend<
		[{ t: "call"; name: "overlaps"; args: [C<"a">, C<"b">, C<"c">, C<"d">] }]
	>();
	expectTypeOf<
		Row<"SELECT (at, dur) OVERLAPS (at, dur) AS a, (day, dur) OVERLAPS (at, dur) AS b FROM things">
	>().toEqualTypeOf<{ a: boolean; b: boolean }>();
	expectTypeOf<
		[
			V<"SELECT (1, 2) OVERLAPS (1, 2, 3)">,
			V<"SELECT (1, 2, 3) OVERLAPS (1, 2)">,
			V<"SELECT (1, 2) OVERLAPS 1">,
			V<"SELECT 1 WHERE (1, 2) OVERLAPS )">,
			V<"SELECT 1 OVERLAPS (1, 2)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				"wrong number of parameters on right side of OVERLAPS expression",
				7
			>,
			SqlError<
				"wrong number of parameters on left side of OVERLAPS expression",
				9
			>,
			SqlError<"syntax error at or near 1", 7>,
			SqlError<"syntax error at or near )", 9>,
			SqlError<"syntax error at or near overlaps", 2>,
		]
	>();
});

test("OPERATOR( needs a qualified operator and a closing paren", () => {
	expectTypeOf<
		[
			V<"SELECT 1 OPERATOR(pg_catalog 2">,
			V<"SELECT 1 OPERATOR(+ 2">,
			V<"SELECT 1 OPERATOR(pg_catalog.+) )">,
			V<"SELECT OPERATOR(pg_catalog 2">,
			V<"SELECT OPERATOR(pg_catalog.- )">,
			V<"SELECT OPERATOR(pg_catalog.-) )">,
			V<"SELECT 1 OPERATOR 2">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near 2", 5>,
			SqlError<"syntax error at or near 2", 5>,
			SqlError<"syntax error at or near )", 8>,
			SqlError<"syntax error at or near 2", 4>,
			SqlError<"syntax error at end of input", 7>,
			SqlError<"syntax error at or near )", 7>,
			SqlError<"syntax error at or near 2", 3>,
		]
	>();
	// without a paren, OPERATOR is a label
	expectTypeOf<Row<"SELECT 1 operator">>().toEqualTypeOf<{
		operator: number;
	}>();
});

test("NOT of LIKE, ILIKE, SIMILAR TO and IN", () => {
	expectTypeOf<
		Exprs<"SELECT a NOT SIMILAR TO b, a SIMILAR TO b, a NOT LIKE b, a NOT ILIKE b, a NOT IN (b), a IN (b)">
	>().toEqualTypeOf<
		[
			{ t: "like"; e: C<"a">; pat: C<"b">; kind: "similar"; not: true },
			{ t: "like"; e: C<"a">; pat: C<"b">; kind: "similar"; not: false },
			{ t: "like"; e: C<"a">; pat: C<"b">; kind: "like"; not: true },
			{ t: "like"; e: C<"a">; pat: C<"b">; kind: "ilike"; not: true },
			{ t: "in"; e: C<"a">; list: [C<"b">]; not: true },
			{ t: "in"; e: C<"a">; list: [C<"b">]; not: false },
		]
	>();
	expectTypeOf<Exprs<"SELECT a NOT IN (SELECT b), a IN (SELECT b)">>().toExtend<
		[{ t: "insub"; not: true }, { t: "insub"; not: false }]
	>();
});

test("the quantifier and the operator of ANY / SOME / ALL", () => {
	// [NOT] LIKE / ILIKE ANY is the ~~ operator family
	expectTypeOf<
		Exprs<"SELECT a LIKE ANY (b), a LIKE ALL (b), a ILIKE SOME (b), a NOT LIKE ANY (b), a NOT ILIKE ALL (b), a = SOME (b), a ~ ALL (b), a < ANY (b), a + SOME (b)">
	>().toEqualTypeOf<
		[
			{ t: "quant"; l: C<"a">; op: "~~"; q: "any"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "~~"; q: "all"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "~~*"; q: "any"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "!~~"; q: "any"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "!~~*"; q: "all"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "="; q: "any"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "~"; q: "all"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "<"; q: "any"; r: C<"b"> },
			{ t: "quant"; l: C<"a">; op: "+"; q: "any"; r: C<"b"> },
		]
	>();
});

test("operands", () => {
	// unary minus and plus bind tighter than other operators; inner brackets of ARRAY[…] are sub-arrays
	expectTypeOf<
		Row<"SELECT ARRAY[[1, 2], [3, 4]] AS a, - 1 || 'x' AS b, + 1 || 'x' AS c">
	>().toEqualTypeOf<{ a: number[]; b: string; c: string }>();
	expectTypeOf<Exprs<"SELECT true, false, NULL">>().toEqualTypeOf<
		[{ t: "bool"; v: true }, { t: "bool"; v: false }, { t: "null" }]
	>();
	// keywords that start special syntax are column names without it
	expectTypeOf<
		Row<"SELECT exists, row, extract, position, substring, trim, overlay, xmlconcat, normalize, operator FROM (SELECT 1 AS exists, 2 AS row, 3 AS extract, 4 AS position, 5 AS substring, 6 AS trim, 7 AS overlay, 8 AS xmlconcat, 9 AS normalize, 10 AS operator) t">
	>().toEqualTypeOf<{
		exists: number;
		row: number;
		extract: number;
		position: number;
		substring: number;
		trim: number;
		overlay: number;
		xmlconcat: number;
		normalize: number;
		operator: number;
	}>();
	expectTypeOf<
		[
			V<"SELECT 1 + from">,
			V<"SELECT 1 + table">,
			V<"SELECT collation FROM (SELECT 1 AS collation) t">,
			V<"SELECT 1 +">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near from", 3>,
			SqlError<"syntax error at or near table", 3>,
			SqlError<"syntax error at or near from", 2>,
			SqlError<"syntax error at end of input", 3>,
		]
	>();
});

test("comparisons, IS DISTINCT FROM, LIKE and BETWEEN do not chain", () => {
	expectTypeOf<
		[
			V<"SELECT 1 = 1 = true">,
			V<"SELECT 1 = 1 < true">,
			V<"SELECT 1 = 1 > true">,
			V<"SELECT 1 = 1 <= true">,
			V<"SELECT 1 = 1 >= true">,
			V<"SELECT 1 = 1 <> true">,
			V<"SELECT 1 = 1 != true">,
			V<"SELECT 1 IS DISTINCT FROM 2 IS NULL">,
			V<"SELECT 1 IS DISTINCT FROM 2 ISNULL">,
			V<"SELECT 1 IS DISTINCT FROM 2 NOTNULL">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near =", 4>,
			SqlError<"syntax error at or near <", 4>,
			SqlError<"syntax error at or near >", 4>,
			SqlError<"syntax error at or near <=", 4>,
			SqlError<"syntax error at or near >=", 4>,
			SqlError<"syntax error at or near <>", 4>,
			SqlError<"syntax error at or near !=", 4>,
			SqlError<"syntax error at or near is", 6>,
			SqlError<"syntax error at or near isnull", 6>,
			SqlError<"syntax error at or near notnull", 6>,
		]
	>();
	expectTypeOf<
		[
			V<"SELECT 'a' LIKE 'b' LIKE 'c'">,
			V<"SELECT 'a' LIKE 'b' ILIKE 'c'">,
			V<"SELECT 'a' LIKE 'b' SIMILAR TO 'c'">,
			V<"SELECT 'a' LIKE 'b' BETWEEN 'c' AND 'd'">,
			V<"SELECT 'a' LIKE 'b' IN ('c')">,
			V<"SELECT 'a' LIKE 'b' NOT LIKE 'c'">,
			V<"SELECT 'a' LIKE 'b' ESCAPE 'c' LIKE 'd'">,
			V<"SELECT 1 BETWEEN 0 AND 2 IN (true)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near like", 4>,
			SqlError<"syntax error at or near ilike", 4>,
			SqlError<"syntax error at or near similar", 4>,
			SqlError<"syntax error at or near between", 4>,
			SqlError<"syntax error at or near in", 4>,
			SqlError<"syntax error at or near not", 4>,
			SqlError<"syntax error at or near like", 6>,
			SqlError<"syntax error at or near in", 6>,
		]
	>();
	// lower operators follow, and a word that starts no operator
	expectTypeOf<
		Row<"SELECT 'a' LIKE 'b' = true AS a, 'a' LIKE 'b' ESCAPE '#' = true AS b, 1 BETWEEN 0 AND 2 = true AS c, 'a' LIKE 'b' AND true AS d, 1 BETWEEN 0 AND 2 OR true AS e, 'a' LIKE 'b' AS in">
	>().toEqualTypeOf<{
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
		e: boolean;
		in: boolean;
	}>();
	// a NOT that starts no operator is a label; postfix and parenthesized operands end the rule
	expectTypeOf<
		Row<"SELECT 'a' LIKE 'b' not, 1 = 1 IS NULL = false AS a, 1 IN (1) IN (true) AS b, 1 = ANY (ARRAY[1]) = true AS c, 1 IS NULL IS NULL AS d">
	>().toEqualTypeOf<{
		not: boolean;
		a: boolean;
		b: boolean;
		c: boolean;
		d: boolean;
	}>();
});

test("a parenthesized subquery can start an IN list", () => {
	expectTypeOf<
		Row<"SELECT 1 IN ((SELECT 1), 2) AS a, 1 IN ((SELECT 1)) AS b">
	>().toEqualTypeOf<{ a: boolean | null; b: boolean }>();
	expectTypeOf<V<"SELECT 1 IN ((SELECT 1) 2)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near 2', 8>
	>();
});
