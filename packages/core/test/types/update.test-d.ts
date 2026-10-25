import { expectTypeOf, test } from "vitest";
import type { KindOf } from "../../src/engine/index.js";
import {
	type Col,
	createSql,
	type DefaultTypeMap,
	type Generated,
	type Nullable,
	type ParamsOf,
	type RowOf,
	type SqlError,
	type Validate,
	type View,
} from "../../src/index.js";

interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		display_name: Nullable<"text">;
		created_at: Generated<"timestamptz">;
	};
	posts: {
		id: Generated<"int8">;
		author_id: Col<"int4">;
		title: Col<"text">;
		body: Nullable<"text">;
	};
	active_users: View<{ id: Col<"int4">; email: Col<"text"> }>;
}

const sql = createSql<DB>();
type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;

test("UPDATE without RETURNING has no row type", () => {
	expectTypeOf<
		Row<"UPDATE users SET email = 'a' WHERE id = 1">
	>().toEqualTypeOf<never>();
	expectTypeOf<
		KindOf<DB, "UPDATE users SET email = 'a'">
	>().toEqualTypeOf<"update">();
	expectTypeOf<
		V<"UPDATE users SET email = 'a', display_name = DEFAULT">
	>().toEqualTypeOf<"UPDATE users SET email = 'a', display_name = DEFAULT">();
	expectTypeOf<
		V<"UPDATE ONLY users AS u SET email = 'x' WHERE u.id = 1">
	>().toEqualTypeOf<"UPDATE ONLY users AS u SET email = 'x' WHERE u.id = 1">();
});

test("UPDATE ... RETURNING", () => {
	expectTypeOf<
		Row<"UPDATE users SET email = 'a' RETURNING *">
	>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	}>();
	expectTypeOf<
		Row<"UPDATE users u SET email = 'a' WHERE u.id = 1 RETURNING u.id, u.email AS mail">
	>().toEqualTypeOf<{ id: number; mail: string }>();
	expectTypeOf<
		Row<"UPDATE users SET display_name = NULL RETURNING display_name">
	>().toEqualTypeOf<{ display_name: string | null }>();
});

test("SET column checks", () => {
	expectTypeOf<V<"UPDATE users SET nope = 1">>().toEqualTypeOf<
		SqlError<'column "nope" of relation "users" does not exist', 3>
	>();
	expectTypeOf<V<"UPDATE users SET email = nope">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 5>
	>();
	// every value is typed before the targets are checked, as in Postgres
	expectTypeOf<V<"UPDATE users SET nope = 1, email = nope2">>().toEqualTypeOf<
		SqlError<'column "nope2" does not exist', 9>
	>();
	// every item is checked, not only the first
	expectTypeOf<V<"UPDATE users SET email = 'a', nope = 1">>().toEqualTypeOf<
		SqlError<'column "nope" of relation "users" does not exist', 7>
	>();
	expectTypeOf<
		V<"UPDATE users SET email = 'a', display_name = nope">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 9>>();
	expectTypeOf<V<"UPDATE users SET email = NULL">>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			3
		>
	>();
	// DEFAULT stores NULL in a column without a default
	expectTypeOf<V<"UPDATE users SET email = DEFAULT">>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			3
		>
	>();
	expectTypeOf<
		V<"UPDATE users SET created_at = DEFAULT, (email, display_name) = ('a', DEFAULT)">
	>().toEqualTypeOf<"UPDATE users SET created_at = DEFAULT, (email, display_name) = ('a', DEFAULT)">();
	expectTypeOf<
		V<"UPDATE users SET display_name = DEFAULT || 'x'">
	>().toEqualTypeOf<SqlError<"DEFAULT is not allowed in this context", 5>>();
	// SET expressions see the target table by name or alias
	expectTypeOf<
		V<"UPDATE users SET email = users.email || 'x'">
	>().toEqualTypeOf<"UPDATE users SET email = users.email || 'x'">();
	expectTypeOf<V<"UPDATE users u SET email = users.email">>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "users"', 1>
	>();
});

test("multi-column SET", () => {
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = ('a', 'b')">
	>().toEqualTypeOf<"UPDATE users SET (email, display_name) = ('a', 'b')">();
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = (SELECT title, body FROM posts LIMIT 1)">
	>().toEqualTypeOf<"UPDATE users SET (email, display_name) = (SELECT title, body FROM posts LIMIT 1)">();
	// the source must be a row or a subquery, even for one column
	expectTypeOf<
		V<"UPDATE users SET (email) = ROW('a')">
	>().toEqualTypeOf<"UPDATE users SET (email) = ROW('a')">();
	expectTypeOf<V<"UPDATE users SET (email) = ('a')">>().toEqualTypeOf<
		SqlError<
			"source for a multiple-column UPDATE item must be a sub-SELECT or ROW() expression",
			0
		>
	>();
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = 'x'">
	>().toEqualTypeOf<
		SqlError<
			"source for a multiple-column UPDATE item must be a sub-SELECT or ROW() expression",
			0
		>
	>();
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = ('a', 'b', 'c')">
	>().toEqualTypeOf<
		SqlError<"number of columns does not match number of values", 0>
	>();
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = (SELECT title FROM posts LIMIT 1)">
	>().toEqualTypeOf<
		SqlError<"number of columns does not match number of values", 0>
	>();
	expectTypeOf<
		V<"UPDATE users SET (email, nope) = ('a', 'b')">
	>().toEqualTypeOf<
		SqlError<'column "nope" of relation "users" does not exist', 6>
	>();
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = (SELECT nope)">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 11>>();
	// a NULL, or a DEFAULT without a default, in a NOT NULL column, as for a single column
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = (NULL, 'x')">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			4
		>
	>();
	expectTypeOf<
		V<"UPDATE users SET (display_name, email) = ROW(NULL, 'x')">
	>().toEqualTypeOf<"UPDATE users SET (display_name, email) = ROW(NULL, 'x')">();
	expectTypeOf<
		V<"UPDATE users SET (display_name, email) = ROW(DEFAULT, DEFAULT)">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			6
		>
	>();
	expectTypeOf<
		V<"UPDATE users SET (created_at, display_name) = (DEFAULT, DEFAULT)">
	>().toEqualTypeOf<"UPDATE users SET (created_at, display_name) = (DEFAULT, DEFAULT)">();
});

test("a column is assigned once (checked after the rest of the statement, as by Postgres's rewriter)", () => {
	expectTypeOf<V<"UPDATE users SET email = 'a', email = 'b'">>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "email"', 3>
	>();
	expectTypeOf<
		V<"UPDATE users SET (email, display_name) = ('a', 'b'), display_name = 'c'">
	>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "display_name"', 6>
	>();
	expectTypeOf<
		V<"UPDATE users SET display_name = 'c', (email, display_name) = ROW('a', 'b')">
	>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "display_name"', 3>
	>();
	expectTypeOf<
		V<"UPDATE users SET email = 'a', email = 'b', display_name = nope">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 13>>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET email = 'b', email = 'c'">
	>().toEqualTypeOf<
		SqlError<'multiple assignments to same column "email"', 4>
	>();
	expectTypeOf<
		V<"UPDATE users SET email = 'a', display_name = 'b'">
	>().toEqualTypeOf<"UPDATE users SET email = 'a', display_name = 'b'">();
});

test("UPDATE ... FROM: items are inner-joined to the target, nullability from the FROM clause", () => {
	expectTypeOf<
		Row<"UPDATE users u SET display_name = p.title FROM posts p WHERE p.author_id = u.id RETURNING u.id, p.title, p.body">
	>().toEqualTypeOf<{ id: number; title: string; body: string | null }>();
	expectTypeOf<
		Row<"UPDATE users SET email = 'a' FROM posts p LEFT JOIN posts q ON q.id = p.id WHERE users.id = p.author_id RETURNING q.title, p.title AS pt">
	>().toEqualTypeOf<{ title: string | null; pt: string }>();
	expectTypeOf<
		Row<"UPDATE users u SET display_name = s.t FROM (SELECT author_id, max(title) AS t FROM posts GROUP BY author_id) s WHERE s.author_id = u.id RETURNING u.id, s.t">
	>().toEqualTypeOf<{ id: number; t: string }>();
	expectTypeOf<
		V<"UPDATE users SET email = p.title FROM posts p WHERE p.nope = 1">
	>().toEqualTypeOf<SqlError<"column p.nope does not exist", 14>>();
	expectTypeOf<V<"UPDATE users SET email = 'a' FROM nope">>().toEqualTypeOf<
		SqlError<'relation "nope" does not exist', 7>
	>();
	// the target's name is taken
	expectTypeOf<V<"UPDATE users SET email = 'a' FROM users">>().toEqualTypeOf<
		SqlError<'table name "users" specified more than once', 1>
	>();
	expectTypeOf<
		V<"UPDATE users u SET email = 'a' FROM posts JOIN posts u ON true">
	>().toEqualTypeOf<SqlError<'table name "u" specified more than once', 2>>();
	expectTypeOf<
		V<"UPDATE users u SET email = 'a' FROM users">
	>().toEqualTypeOf<"UPDATE users u SET email = 'a' FROM users">();
});

test("WHERE is type-checked", () => {
	expectTypeOf<
		V<"UPDATE users SET email = 'a' WHERE nope = 1">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 7>>();
	expectTypeOf<
		V<"UPDATE users u SET email = 'a' WHERE users.id = 1">
	>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "users"', 1>
	>();
	expectTypeOf<
		V<"UPDATE users SET email = 'a' WHERE id IN (SELECT author_id FROM posts WHERE title = 'x')">
	>().toEqualTypeOf<"UPDATE users SET email = 'a' WHERE id IN (SELECT author_id FROM posts WHERE title = 'x')">();
});

test("target table errors", () => {
	expectTypeOf<V<"UPDATE active_users SET email = 'a'">>().toEqualTypeOf<
		SqlError<'cannot update view "active_users"', 1>
	>();
	expectTypeOf<V<"UPDATE nope SET email = 'a'">>().toEqualTypeOf<
		SqlError<'relation "nope" does not exist', 1>
	>();
});

test("UPDATE inside WITH", () => {
	expectTypeOf<
		Row<"WITH up AS (UPDATE users SET email = 'a' WHERE id = 1 RETURNING id, email) SELECT * FROM up">
	>().toEqualTypeOf<{ id: number; email: string }>();
	expectTypeOf<
		Row<"WITH ids AS (SELECT author_id FROM posts) UPDATE users SET display_name = 'x' FROM ids WHERE ids.author_id = users.id RETURNING users.id">
	>().toEqualTypeOf<{ id: number }>();
});

test("WHERE CURRENT OF cursor", () => {
	expectTypeOf<
		V<"UPDATE users SET email = 'a' WHERE CURRENT OF cur">
	>().toEqualTypeOf<"UPDATE users SET email = 'a' WHERE CURRENT OF cur">();
	expectTypeOf<
		Row<"UPDATE users SET email = 'a' WHERE CURRENT OF cur RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		V<"UPDATE users SET email = 'a' WHERE CURRENT OF">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected cursor name at or near end of input", 9>
	>();
});

test("syntax errors", () => {
	expectTypeOf<V<"UPDATE users SET email[1] = 'x'">>().toEqualTypeOf<
		SqlError<
			"cannot subscript type text because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<V<"UPDATE users SET">>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near end of input", 3>
	>();
	expectTypeOf<V<"UPDATE users email = 'a'">>().toEqualTypeOf<
		SqlError<"syntax error: expected SET at or near =", 3>
	>();
	// each clause's error, at the token Postgres names
	type E<Q extends string> =
		V<Q> extends SqlError<infer M extends string, infer At> ? [M, At] : "ok";
	expectTypeOf<
		[
			E<"UPDATE 1 SET email = 'a'">,
			E<"UPDATE users SET email = 'a' FROM (">,
			E<"UPDATE nope SET email = 'a'">,
			E<"UPDATE users SET email 'a'">,
			E<"UPDATE users SET email = +">,
			E<"UPDATE users SET (email display_name) = ('a', 'b')">,
			E<"UPDATE users SET (email, display_name) ('a', 'b')">,
			E<"UPDATE users SET (email, display_name) = ('a',">,
			E<"UPDATE users SET email = 'a' FROM nope">,
			E<"UPDATE users SET email = 'a' WHERE nope">,
			E<"UPDATE users SET email = 'a' RETURNING +">,
		]
	>().toEqualTypeOf<
		[
			["syntax error: expected table name at or near 1", 1],
			[
				"syntax error: expected table name, subquery or function at or near end of input",
				8,
			],
			['relation "nope" does not exist', 1],
			["syntax error: expected \"=\" at or near 'a'", 4],
			["syntax error at end of input", 6],
			['syntax error: expected "," or ")" at or near display_name', 5],
			['syntax error: expected "=" at or near (', 8],
			["syntax error at end of input", 12],
			['relation "nope" does not exist', 7],
			['column "nope" does not exist', 7],
			["syntax error at end of input", 8],
		]
	>();
});

test("sql() call sites", () => {
	sql("UPDATE users SET email = $1 WHERE id = $2", "a", 1);
	// @ts-expect-error wrong param types
	sql("UPDATE users SET email = $1 WHERE id = $2", 1, "a");
	expectTypeOf<Validate<DB, "UPDATE users SET nope = 1">>().toEqualTypeOf<
		SqlError<'column "nope" of relation "users" does not exist', 3>
	>();
	expectTypeOf<
		Validate<DB, "UPDATE active_users SET email = 'a'">
	>().toEqualTypeOf<SqlError<'cannot update view "active_users"', 1>>();
	expectTypeOf<
		Params<"UPDATE users SET email = $1 WHERE id = $2">
	>().toEqualTypeOf<[string, number | null]>();
});
