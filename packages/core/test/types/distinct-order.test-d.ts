import { expectTypeOf, test } from "vitest";
import type { SqlError } from "../../src/index.js";
import type { Row, V } from "./_schema.js";

// DISTINCT [ON], ORDER BY, GROUP BY references, LIMIT / OFFSET / FETCH, locking, TABLE.
// Verified against PostgreSQL 18.

test("DISTINCT and DISTINCT ON do not change the row type; DISTINCT ON is validated", () => {
	expectTypeOf<Row<"SELECT DISTINCT id FROM users">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT ALL id FROM users">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT DISTINCT ON (author_id) author_id, title FROM posts ORDER BY author_id, id DESC">
	>().toEqualTypeOf<{ author_id: number; title: string }>();
	expectTypeOf<
		Row<"SELECT DISTINCT ON (author_id, title) author_id, title FROM posts ORDER BY title, author_id, id">
	>().toEqualTypeOf<{ author_id: number; title: string }>();
	expectTypeOf<
		Row<"SELECT DISTINCT ON (p.author_id) author_id, title FROM posts p ORDER BY author_id">
	>().toEqualTypeOf<{ author_id: number; title: string }>();
	expectTypeOf<
		Row<"SELECT DISTINCT ON (1) author_id AS a, title FROM posts ORDER BY a">
	>().toEqualTypeOf<{ a: number; title: string }>();
	expectTypeOf<
		Row<"SELECT DISTINCT ON (lower(title)) title FROM posts ORDER BY lower(title)">
	>().toEqualTypeOf<{ title: string }>();
	expectTypeOf<
		Row<"SELECT DISTINCT ON (author_id) title FROM posts">
	>().toEqualTypeOf<{ title: string }>();
	expectTypeOf<V<"SELECT DISTINCT ON (nope) id FROM posts">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 4>
	>();
	expectTypeOf<
		V<"SELECT DISTINCT ON (author_id) author_id, title FROM posts ORDER BY title">
	>().toEqualTypeOf<
		SqlError<
			"SELECT DISTINCT ON expressions must match initial ORDER BY expressions",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT DISTINCT ON (author_id, title) author_id, title FROM posts ORDER BY title, id">
	>().toEqualTypeOf<
		SqlError<
			"SELECT DISTINCT ON expressions must match initial ORDER BY expressions",
			0
		>
	>();
	// a DISTINCT ON expression after another key; one missing after others
	expectTypeOf<
		V<"SELECT DISTINCT ON (author_id) author_id, title FROM posts ORDER BY title, author_id">
	>().toEqualTypeOf<
		SqlError<
			"SELECT DISTINCT ON expressions must match initial ORDER BY expressions",
			0
		>
	>();
	expectTypeOf<
		V<"SELECT DISTINCT ON (author_id, title) author_id, title FROM posts ORDER BY author_id, id">
	>().toEqualTypeOf<
		SqlError<
			"SELECT DISTINCT ON expressions must match initial ORDER BY expressions",
			0
		>
	>();
	// SELECT DISTINCT: ORDER BY expressions must be in the select list
	expectTypeOf<
		Row<"SELECT DISTINCT id, email FROM users ORDER BY email">
	>().toEqualTypeOf<{ id: number; email: string }>();
	expectTypeOf<
		Row<"SELECT DISTINCT id FROM users ORDER BY users.id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		V<"SELECT DISTINCT id FROM users ORDER BY email">
	>().toEqualTypeOf<
		SqlError<
			"for SELECT DISTINCT, ORDER BY expressions must appear in select list",
			0
		>
	>();
	// after a star a column is one of its columns; an expression is not
	expectTypeOf<
		V<"SELECT DISTINCT * FROM users ORDER BY id + 1">
	>().toEqualTypeOf<
		SqlError<
			"for SELECT DISTINCT, ORDER BY expressions must appear in select list",
			0
		>
	>();
	type Ok<Q extends string> = [V<Q>] extends [never]
		? "never"
		: V<Q> extends Q
			? "ok"
			: V<Q>;
	expectTypeOf<
		[
			Ok<"SELECT DISTINCT * FROM users ORDER BY email, 1">,
			Ok<"SELECT DISTINCT u.* FROM users u ORDER BY u.email">,
			Ok<"SELECT DISTINCT *, id + 1 AS n FROM users ORDER BY n, id + 1">,
		]
	>().toEqualTypeOf<["ok", "ok", "ok"]>();
});

test("ORDER BY: output names, positions and input expressions", () => {
	expectTypeOf<
		Row<"SELECT id AS n FROM users ORDER BY n DESC">
	>().toEqualTypeOf<{ n: number }>();
	expectTypeOf<
		Row<"SELECT id FROM users ORDER BY 1 ASC NULLS FIRST">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT id FROM users u ORDER BY u.email, created_at DESC">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT lower(email) FROM users ORDER BY lower">
	>().toEqualTypeOf<{ lower: string }>();
	expectTypeOf<
		Row<"SELECT author_id, count(*) AS n FROM posts GROUP BY author_id ORDER BY n DESC, count(*)">
	>().toEqualTypeOf<{ author_id: number; n: string }>();
	// an output name wins over an input column of the same name
	expectTypeOf<
		Row<"SELECT id AS email FROM users ORDER BY email">
	>().toEqualTypeOf<{ email: number }>();
	// the same expression twice is not ambiguous
	expectTypeOf<Row<"SELECT id, id FROM users ORDER BY id">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT id, (SELECT 1) AS s FROM users ORDER BY s">
	>().toEqualTypeOf<{ id: number; s: number | null }>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 2">>().toEqualTypeOf<
		SqlError<"ORDER BY position 2 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 0">>().toEqualTypeOf<
		SqlError<"ORDER BY position 0 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY -1">>().toEqualTypeOf<
		SqlError<"ORDER BY position -1 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id, email FROM users ORDER BY 1.5">>().toEqualTypeOf<
		SqlError<"non-integer constant in ORDER BY", 0>
	>();
	expectTypeOf<V<"SELECT id, email FROM users ORDER BY 'x'">>().toEqualTypeOf<
		SqlError<"non-integer constant in ORDER BY", 0>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY nope">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 6>
	>();
	// output aliases are not visible inside expressions
	expectTypeOf<
		V<"SELECT id + 1 AS n FROM users ORDER BY n + 1">
	>().toEqualTypeOf<SqlError<'column "n" does not exist', 5>>();
	expectTypeOf<V<"SELECT u.id AS x FROM users u ORDER BY u.x">>().toEqualTypeOf<
		SqlError<"column u.x does not exist", 5>
	>();
	expectTypeOf<
		V<"SELECT u.id, p.id FROM users u, posts p ORDER BY id">
	>().toEqualTypeOf<SqlError<'ORDER BY "id" is ambiguous', 3>>();
	expectTypeOf<
		V<"SELECT id AS x, email AS x FROM users ORDER BY x">
	>().toEqualTypeOf<SqlError<'ORDER BY "x" is ambiguous', 3>>(); // the same column through a star, or with and without its qualifier, is not ambiguous
	type Ok<Q extends string> = [V<Q>] extends [never]
		? "never"
		: V<Q> extends Q
			? true
			: V<Q>;
	expectTypeOf<
		[
			Ok<"SELECT *, id FROM users ORDER BY id">,
			Ok<"SELECT * FROM users ORDER BY email">,
			Ok<"SELECT u.id, id FROM users u ORDER BY id">,
			Ok<"SELECT id, u.id FROM users u ORDER BY id">,
			Ok<"SELECT u.id, u.id FROM users u ORDER BY id">,
			// after a star, a position is not checked
			Ok<"SELECT * FROM users ORDER BY 2">,
			// every digit; leading zeros
			Ok<"SELECT 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ORDER BY 10, 9, 8, 7, 6, 5, 4, 3, 2, 01">,
		]
	>().toEqualTypeOf<[true, true, true, true, true, true, true]>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 05">>().toEqualTypeOf<
		SqlError<"ORDER BY position 5 is not in select list", 6>
	>();
	// past int4 the literal is not an integer to Postgres
	expectTypeOf<V<"SELECT id FROM users ORDER BY 3000000000">>().toEqualTypeOf<
		SqlError<"non-integer constant in ORDER BY", 0>
	>();
});

test("GROUP BY: input columns first, then output names and positions", () => {
	expectTypeOf<Row<"SELECT id FROM users GROUP BY 1">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT id AS n FROM users GROUP BY n">>().toEqualTypeOf<{
		n: number;
	}>();
	expectTypeOf<
		Row<"SELECT id + 1 AS n FROM users GROUP BY n">
	>().toEqualTypeOf<{ n: number }>();
	expectTypeOf<
		Row<"SELECT lower(email) AS e, count(*) FROM users GROUP BY e">
	>().toEqualTypeOf<{ e: string; count: string }>();
	expectTypeOf<
		Row<"SELECT u.id FROM users u GROUP BY u.id, ROLLUP (email)">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY 0">>().toEqualTypeOf<
		SqlError<"GROUP BY position 0 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT DISTINCT ON (0) id FROM users">>().toEqualTypeOf<
		SqlError<"DISTINCT ON position 0 is not in select list", 4>
	>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY 2">>().toEqualTypeOf<
		SqlError<"GROUP BY position 2 is not in select list", 6>
	>();
	// at the number after the clause's keyword, not after a quoted name spelled like it
	expectTypeOf<V<'SELECT 1 AS "order", 3 ORDER BY 3'>>().toEqualTypeOf<
		SqlError<"ORDER BY position 3 is not in select list", 8>
	>();
	expectTypeOf<V<'SELECT 1 AS "group", 3 GROUP BY 3'>>().toEqualTypeOf<
		SqlError<"GROUP BY position 3 is not in select list", 8>
	>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY 'x'">>().toEqualTypeOf<
		SqlError<"non-integer constant in GROUP BY", 0>
	>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY nope">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 6>
	>();
	expectTypeOf<
		V<"SELECT id AS x, email AS x FROM users GROUP BY x">
	>().toEqualTypeOf<SqlError<'GROUP BY "x" is ambiguous', 3>>();
	// an input column comes first, even when it is ambiguous and an output column has the name
	expectTypeOf<
		V<"SELECT u.id FROM users u, users v GROUP BY id">
	>().toEqualTypeOf<SqlError<'column reference "id" is ambiguous', 3>>();
	expectTypeOf<V<"SELECT 1 FROM users HAVING nope > 1">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
});

test("positions are integer constants as Postgres folds them: any radix, digit separators, unary minus", () => {
	type Ok<Q extends string> = V<Q> extends Q ? true : V<Q>;
	expectTypeOf<
		[
			Ok<"SELECT 1, 2 ORDER BY 0x2, 0o1, 0b10, 0_1">,
			Ok<"SELECT 1, 2 ORDER BY 0X2, 0O1, 0B10">,
			Ok<"SELECT id FROM users ORDER BY - -1">,
			Ok<"SELECT id FROM users GROUP BY 0x1">,
			Ok<"SELECT DISTINCT ON (0b1) id FROM users">,
		]
	>().toEqualTypeOf<[true, true, true, true, true]>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 0x10">>().toEqualTypeOf<
		SqlError<"ORDER BY position 16 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 0o17">>().toEqualTypeOf<
		SqlError<"ORDER BY position 15 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 0b101">>().toEqualTypeOf<
		SqlError<"ORDER BY position 5 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 1_0">>().toEqualTypeOf<
		SqlError<"ORDER BY position 10 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY 0x7fffffff">>().toEqualTypeOf<
		SqlError<"ORDER BY position 2147483647 is not in select list", 6>
	>();
	expectTypeOf<
		V<"SELECT id FROM users ORDER BY 0b1111111111111111111111111111111">
	>().toEqualTypeOf<
		SqlError<"ORDER BY position 2147483647 is not in select list", 6>
	>();
	// past int4 (`0x80000000` is int8) the literal is not an integer to Postgres
	expectTypeOf<V<"SELECT id FROM users ORDER BY 0x80000000">>().toEqualTypeOf<
		SqlError<"non-integer constant in ORDER BY", 0>
	>();
	// unary minus folds into the constant, however often and around parentheses
	expectTypeOf<V<"SELECT id FROM users ORDER BY - -2">>().toEqualTypeOf<
		SqlError<"ORDER BY position 2 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY -(2)">>().toEqualTypeOf<
		SqlError<"ORDER BY position -2 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY (2)">>().toEqualTypeOf<
		SqlError<"ORDER BY position 2 is not in select list", 7>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY -0">>().toEqualTypeOf<
		SqlError<"ORDER BY position 0 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY -0x10">>().toEqualTypeOf<
		SqlError<"ORDER BY position -16 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY -1.5">>().toEqualTypeOf<
		SqlError<"non-integer constant in ORDER BY", 0>
	>();
	// 2147483648 is no integer, so neither is its negation
	expectTypeOf<V<"SELECT id FROM users ORDER BY -2147483648">>().toEqualTypeOf<
		SqlError<"non-integer constant in ORDER BY", 0>
	>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY -1">>().toEqualTypeOf<
		SqlError<"GROUP BY position -1 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users GROUP BY -1.5">>().toEqualTypeOf<
		SqlError<"non-integer constant in GROUP BY", 0>
	>();
	expectTypeOf<V<"SELECT DISTINCT ON (-1) id FROM users">>().toEqualTypeOf<
		SqlError<"DISTINCT ON position -1 is not in select list", 4>
	>();
	// a star leaves positions unchecked, but 0 and negative ones are never in the list
	expectTypeOf<V<"SELECT * FROM users ORDER BY 0">>().toEqualTypeOf<
		SqlError<"ORDER BY position 0 is not in select list", 6>
	>();
	expectTypeOf<V<"SELECT * FROM users ORDER BY -1">>().toEqualTypeOf<
		SqlError<"ORDER BY position -1 is not in select list", 6>
	>();
	// the error is at the constant, not at an earlier non-integer of the same digits
	expectTypeOf<V<"SELECT id FROM users ORDER BY 2.0 + id, 2">>().toEqualTypeOf<
		SqlError<"ORDER BY position 2 is not in select list", 10>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY -id, 2">>().toEqualTypeOf<
		SqlError<"ORDER BY position 2 is not in select list", 9>
	>();
});

test("an output name for several different expressions is ambiguous", () => {
	expectTypeOf<
		V<"SELECT id AS x, id + 1 AS x FROM users ORDER BY x">
	>().toEqualTypeOf<SqlError<'ORDER BY "x" is ambiguous', 3>>();
	expectTypeOf<
		V<"SELECT id + 1 AS x, id + 2 AS x FROM users ORDER BY x">
	>().toEqualTypeOf<SqlError<'ORDER BY "x" is ambiguous', 5>>();
	expectTypeOf<
		V<"SELECT id AS x, id AS x, email AS x FROM users ORDER BY x">
	>().toEqualTypeOf<SqlError<'ORDER BY "x" is ambiguous', 3>>();
	// a star's column against an output name
	expectTypeOf<
		V<"SELECT *, id AS email FROM users ORDER BY email">
	>().toEqualTypeOf<SqlError<'ORDER BY "email" is ambiguous', 5>>();
	expectTypeOf<
		Row<"SELECT id + 1 AS x, id + 1 AS x FROM users ORDER BY x">
	>().toEqualTypeOf<{ x: number }>();
});

test("every GROUP BY item is checked; a DISTINCT ON position after a star is not", () => {
	expectTypeOf<V<"SELECT 1 FROM users GROUP BY id, nosuch">>().toEqualTypeOf<
		SqlError<'column "nosuch" does not exist', 8>
	>();
	expectTypeOf<
		Row<"SELECT DISTINCT ON (1) * FROM users ORDER BY id">
	>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	}>();
});

test("LIMIT / OFFSET / FETCH and locking clauses do not change the row", () => {
	expectTypeOf<Row<"SELECT id FROM users LIMIT 10 OFFSET 5">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<Row<"SELECT id FROM users OFFSET 5 LIMIT ALL">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT id FROM users ORDER BY id OFFSET 5 ROWS FETCH FIRST 10 ROWS ONLY">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT id FROM users ORDER BY id FETCH NEXT ROW WITH TIES">
	>().toEqualTypeOf<{ id: number }>();
	// ROW and ROWS are the same word, with and without a count
	expectTypeOf<
		V<"SELECT id FROM users FETCH FIRST ROWS ONLY">
	>().toEqualTypeOf<"SELECT id FROM users FETCH FIRST ROWS ONLY">();
	expectTypeOf<
		V<"SELECT id FROM users FETCH FIRST 5 ROW ONLY">
	>().toEqualTypeOf<"SELECT id FROM users FETCH FIRST 5 ROW ONLY">();
	expectTypeOf<V<"SELECT id FROM users FETCH x">>().toEqualTypeOf<
		SqlError<"syntax error: expected FIRST or NEXT at or near x", 5>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER BY">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 6>
	>();
	expectTypeOf<
		Row<"SELECT * FROM users ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1">
	>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	}>();
	expectTypeOf<
		Row<"SELECT id FROM users u FOR SHARE OF u NOWAIT">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT a.id FROM users a, users b FOR UPDATE OF a, b SKIP LOCKED">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT id FROM users FOR NO KEY UPDATE FOR KEY SHARE">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Row<"SELECT id FROM users LIMIT 1 FOR UPDATE">>().toEqualTypeOf<{
		id: number;
	}>();
});

test("TABLE t is SELECT * FROM t", () => {
	expectTypeOf<Row<"TABLE users">>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	}>();
	expectTypeOf<Row<"TABLE ONLY users ORDER BY id LIMIT 1">>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	}>();
	expectTypeOf<
		Row<"SELECT * FROM (TABLE users) t WHERE t.display_name IS NOT NULL">
	>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string;
		created_at: Date;
	}>();
});
