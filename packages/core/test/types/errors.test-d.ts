import { expectTypeOf, test } from "vitest";
import type { ErrAt, ErrMsg, IsErr } from "../../src/engine/index.js";
import { createSql, type SqlError } from "../../src/index.js";
import type { DB, V } from "./_schema.js";

// Error messages (worded like PostgreSQL 18) and positions. The position is a token index:
// the offending token for syntax errors, the first occurrence of the named identifier for
// semantic errors (0 when the message names none).

test("unknown relations, columns and table aliases", () => {
	expectTypeOf<V<"SELECT id FROM nope">>().toEqualTypeOf<
		SqlError<'relation "nope" does not exist', 3>
	>();
	expectTypeOf<V<"SELECT id FROM users u JOIN nope n ON true">>().toEqualTypeOf<
		SqlError<'relation "nope" does not exist', 6>
	>();
	expectTypeOf<V<"SELECT nope FROM users">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 1>
	>();
	expectTypeOf<V<"SELECT id FROM users WHERE nope = 1">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	// a quoted name is found too
	expectTypeOf<V<'SELECT id, "Nope" FROM users'>>().toEqualTypeOf<
		SqlError<'column "Nope" does not exist', 3>
	>();
	expectTypeOf<
		V<"SELECT * FROM users WHERE id = (SELECT max(id) FROM posts WHERE zzz = 1)">
	>().toEqualTypeOf<SqlError<'column "zzz" does not exist', 16>>();
	expectTypeOf<V<"SELECT u.nope FROM users u">>().toEqualTypeOf<
		SqlError<"column u.nope does not exist", 3>
	>();
	expectTypeOf<V<"SELECT x.id FROM users u">>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "x"', 1>
	>();
	expectTypeOf<V<"SELECT nope.* FROM users">>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "nope"', 1>
	>();
	// once aliased, the table name is no longer visible
	expectTypeOf<V<"SELECT users.id FROM users u">>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "users"', 1>
	>();
});

test("ambiguous columns", () => {
	expectTypeOf<V<"SELECT id FROM users, posts">>().toEqualTypeOf<
		SqlError<'column reference "id" is ambiguous', 1>
	>();
	expectTypeOf<
		V<"SELECT 1 FROM users u JOIN posts p ON true WHERE id = 1">
	>().toEqualTypeOf<SqlError<'column reference "id" is ambiguous', 11>>();
	expectTypeOf<
		V<"SELECT count(*) FROM users u, posts p GROUP BY id">
	>().toEqualTypeOf<SqlError<'column reference "id" is ambiguous', 13>>();
});

test("* without FROM", () => {
	expectTypeOf<V<"SELECT *">>().toEqualTypeOf<
		SqlError<"SELECT * with no tables specified is not valid", 0>
	>();
	expectTypeOf<V<"SELECT * FROM (SELECT *) t">>().toEqualTypeOf<
		SqlError<"SELECT * with no tables specified is not valid", 0>
	>();
	expectTypeOf<V<"SELECT 1 + *">>().toEqualTypeOf<
		SqlError<"* is only allowed in a target list or count(*)", 0>
	>();
});

test("syntax errors: trailing garbage, missing pieces", () => {
	expectTypeOf<V<"SELECT id FROM users WHERE id = 1 garbage">>().toEqualTypeOf<
		SqlError<"syntax error at or near garbage", 8>
	>();
	expectTypeOf<V<"SELECT id id2 id3 FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near id3", 3>
	>();
	expectTypeOf<V<"SELECT id FROM users ORDER id">>().toEqualTypeOf<
		SqlError<"syntax error at or near order", 4>
	>();
	// one statement, with an optional `;`
	expectTypeOf<V<"SELECT 1 AS a;">>().toEqualTypeOf<"SELECT 1 AS a;">();
	expectTypeOf<V<"SELECT 1 AS a; SELECT 2">>().toEqualTypeOf<
		SqlError<"syntax error at or near select: only one statement is allowed", 5>
	>();
	expectTypeOf<V<"1">>().toEqualTypeOf<
		SqlError<"syntax error: expected a SQL statement at or near 1", 0>
	>();
	// after WITH: SELECT, VALUES, TABLE, ( …), data statements
	expectTypeOf<
		V<"WITH x AS (SELECT 1 AS a) VALUES (1)">
	>().toEqualTypeOf<"WITH x AS (SELECT 1 AS a) VALUES (1)">();
	expectTypeOf<
		V<"WITH x AS (SELECT 1 AS a) TABLE x">
	>().toEqualTypeOf<"WITH x AS (SELECT 1 AS a) TABLE x">();
	expectTypeOf<
		V<"WITH x AS (SELECT 1 AS a) (SELECT * FROM x)">
	>().toEqualTypeOf<"WITH x AS (SELECT 1 AS a) (SELECT * FROM x)">();
	expectTypeOf<V<"WITH x AS (SELECT 1 AS a) foo">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected SELECT, INSERT, UPDATE, DELETE or MERGE after WITH at or near foo",
			9
		>
	>();
	expectTypeOf<V<"WITH x AS (SELECT 1 AS a) 1">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected SELECT, INSERT, UPDATE, DELETE or MERGE after WITH at or near 1",
			9
		>
	>();
	expectTypeOf<V<"(SELECT 1 UNION SELECT 2">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 6>
	>();
	expectTypeOf<V<"SELECT 1 GROUP BY">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 4>
	>();
	expectTypeOf<V<"SELECT DISTINCT ON 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near 1', 3>
	>();
	expectTypeOf<V<"SELECT 1 WINDOW w AS (">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 6>
	>();
	expectTypeOf<V<"TABLE 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected table name at or near 1", 1>
	>();
	expectTypeOf<V<"VALUES 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected "(" at or near 1', 1>
	>();
	expectTypeOf<V<"VALUES (1">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 3>
	>();
	// AS takes a label: Postgres fails at what follows it
	expectTypeOf<V<"SELECT id AS 5 FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near 5", 3>
	>();
	expectTypeOf<V<"SELECT id AS">>().toEqualTypeOf<
		SqlError<"syntax error at or near end of input", 3>
	>();
	expectTypeOf<V<"SELECT id, FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 3>
	>();
	expectTypeOf<V<"FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 0>
	>();
	expectTypeOf<V<"SELECT id FROM">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near end of input",
			3
		>
	>();
	expectTypeOf<V<"SELECT 1 +">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 3>
	>();
	expectTypeOf<V<"SELECT id FROM users LIMIT">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 5>
	>();
	expectTypeOf<V<"SELECT id FROM users UNION">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected SELECT, VALUES, TABLE or ( at or near end of input",
			5
		>
	>();
	expectTypeOf<V<"SELECT CASE WHEN true THEN 1 FROM users">>().toEqualTypeOf<
		SqlError<"syntax error: expected WHEN, ELSE or END at or near from", 6>
	>();
	expectTypeOf<V<"SELECT id FROM users WHERE id BETWEEN 1">>().toEqualTypeOf<
		SqlError<"syntax error: expected AND at or near end of input", 8>
	>();
});

test("unbalanced parentheses", () => {
	expectTypeOf<V<"SELECT (id FROM users">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near from', 3>
	>();
	expectTypeOf<V<"SELECT id) FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 2>
	>();
	expectTypeOf<V<"SELECT id FROM users)">>().toEqualTypeOf<
		SqlError<"syntax error at or near )", 4>
	>();
	expectTypeOf<V<"SELECT ((1)">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 5>
	>();
	expectTypeOf<V<"SELECT count(* FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near from", 4>
	>();
	expectTypeOf<V<"SELECT id FROM users WHERE (id = 1">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 9>
	>();
	expectTypeOf<V<"SELECT id FROM users WHERE id IN (1, 2">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 11>
	>();
	expectTypeOf<V<"SELECT (SELECT id FROM users">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 6>
	>();
	expectTypeOf<V<"SELECT id FROM (SELECT id FROM users">>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 8>
	>();
});

const sql = createSql<DB>();

// Arguments sit on their own lines: an argument-count error ("Expected 2 arguments, but got 3")
// would land there, outside the @ts-expect-error, and fail the test.
test("an invalid statement reports its SqlError, not an argument-count error", () => {
	sql(
		// @ts-expect-error relation "usrs" does not exist
		"SELECT id FROM usrs WHERE id = $1 AND email = $2",
		1,
		"x",
	);
	sql(
		// @ts-expect-error column "emial" does not exist
		"SELECT id FROM users WHERE id = $1 AND emial = $2",
		1,
		"x",
	);
	sql(
		// @ts-expect-error syntax error at end of input
		"SELECT id FROM users WHERE id = $1 AND",
		1,
	);
	sql(
		// @ts-expect-error column "emial" does not exist
		"SELECT id FROM users WHERE id = :id AND emial = :e",
		{ id: 1, e: "x" },
	);
	sql(
		// @ts-expect-error relation "usrs" does not exist
		"SELECT id FROM usrs u WHERE u.id = $1 {w}",
		{ w: sql.fragment("AND true") },
		1,
		2,
	);
	sql(
		// @ts-expect-error relation "usrs" does not exist
		`SELECT id FROM usrs WHERE id = $1 AND email = ${sql.param("x")}`,
		1,
		2,
	);
	// write helpers and lists in slots
	sql(
		// @ts-expect-error column "nme" does not exist
		"UPDATE users SET {set} WHERE nme = $1",
		{ set: sql.set("users", { email: "x" }) },
		1,
		2,
	);
	sql(
		// @ts-expect-error column "nme" does not exist
		"SELECT id FROM users WHERE nme = $1 ORDER BY {order}",
		{ order: sql.join([sql.fragment("id"), sql.fragment("email")]) },
		1,
		2,
	);
});

test("the engine's error helpers read an SqlError", () => {
	type E = V<"SELECT nope FROM users">;
	expectTypeOf<[IsErr<E>, IsErr<"SELECT 1">]>().toEqualTypeOf<[true, false]>();
	expectTypeOf<[ErrMsg<E>, ErrAt<E>]>().toEqualTypeOf<
		['column "nope" does not exist', 1]
	>();
	expectTypeOf<[ErrMsg<"SELECT 1">, ErrAt<"SELECT 1">]>().toEqualTypeOf<
		[never, never]
	>();
});
