import { expectTypeOf, test } from "vitest";
import type { KindOf } from "../../../src/engine/index.js";
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
} from "../../../src/index.js";

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
	/** Every column has a default: `DEFAULT VALUES` is legal. */
	events: {
		id: Generated<"int8">;
		at: Generated<"timestamptz">;
		note: Nullable<"text">;
	};
	active_users: View<{ id: Col<"int4">; email: Col<"text"> }>;
}

const sql = createSql<DB>();
type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;

test("INSERT without RETURNING has no row type", () => {
	expectTypeOf<
		Row<"INSERT INTO users (email) VALUES ('a')">
	>().toEqualTypeOf<never>();
	expectTypeOf<
		Row<"INSERT INTO users (email, display_name) VALUES ('a', 'b'), ('c', NULL)">
	>().toEqualTypeOf<never>();
	expectTypeOf<
		KindOf<DB, "INSERT INTO users (email) VALUES ('a')">
	>().toEqualTypeOf<"insert">();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a')">
	>().toEqualTypeOf<"INSERT INTO users (email) VALUES ('a')">();
});

test("INSERT ... RETURNING", () => {
	expectTypeOf<
		Row<"INSERT INTO users (email) VALUES ('a') RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"INSERT INTO users (email) VALUES ('a') RETURNING *">
	>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	}>();
	expectTypeOf<
		Row<"INSERT INTO users AS u (email) VALUES ('a') RETURNING u.id, u.email || 'x' AS e, 1 AS one">
	>().toEqualTypeOf<{ id: number; e: string; one: number }>();
	expectTypeOf<
		Row<"INSERT INTO users (email, display_name) VALUES ('a', DEFAULT) RETURNING display_name, created_at">
	>().toEqualTypeOf<{ display_name: string | null; created_at: Date }>();
	expectTypeOf<
		Row<"INSERT INTO ONLY users (email) VALUES ('a') RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
});

test("VALUES: DEFAULT, multi-row, column list checks", () => {
	// DEFAULT is a VALUES item only, and stores NULL in a column without a default
	expectTypeOf<
		V<"INSERT INTO users (email, display_name) VALUES (DEFAULT, 'x')">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			4
		>
	>();
	expectTypeOf<
		V<"INSERT INTO users (id, email) VALUES (DEFAULT, 'a'), (DEFAULT, 'b')">
	>().toEqualTypeOf<"INSERT INTO users (id, email) VALUES (DEFAULT, 'a'), (DEFAULT, 'b')">();
	expectTypeOf<
		V<"INSERT INTO users (email, display_name) VALUES ('a', coalesce(DEFAULT, 'b'))">
	>().toEqualTypeOf<SqlError<"DEFAULT is not allowed in this context", 14>>();
	expectTypeOf<V<"SELECT DEFAULT FROM users">>().toEqualTypeOf<
		SqlError<"DEFAULT is not allowed in this context", 1>
	>();
	// at the keyword, not at a quoted name spelled like it
	expectTypeOf<V<'SELECT 1 AS "default" WHERE DEFAULT'>>().toEqualTypeOf<
		SqlError<"DEFAULT is not allowed in this context", 5>
	>();
	expectTypeOf<
		V<"INSERT INTO users (email, display_name) VALUES ('a', DEFAULT), ('b', 'c')">
	>().toEqualTypeOf<"INSERT INTO users (email, display_name) VALUES ('a', DEFAULT), ('b', 'c')">();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a'), ('b', 'c')">
	>().toEqualTypeOf<SqlError<"VALUES lists must all be the same length", 0>>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a', 'b')">
	>().toEqualTypeOf<
		SqlError<"INSERT has more expressions than target columns", 0>
	>();
	expectTypeOf<
		V<"INSERT INTO users (email, display_name) VALUES ('a')">
	>().toEqualTypeOf<
		SqlError<"INSERT has more target columns than expressions", 0>
	>();
	expectTypeOf<V<"INSERT INTO users (emial) VALUES ('a')">>().toEqualTypeOf<
		SqlError<
			'column "emial" of relation "users" does not exist. Perhaps you meant the column "email"?',
			4
		>
	>();
	// a column is listed once, checked in order with the names
	expectTypeOf<
		V<"INSERT INTO users (email, email) VALUES ('a', 'b')">
	>().toEqualTypeOf<SqlError<'column "email" specified more than once', 4>>();
	expectTypeOf<
		V<"INSERT INTO users (email, email, nope) VALUES ('a', 'b', 'c')">
	>().toEqualTypeOf<SqlError<'column "email" specified more than once', 4>>();
	expectTypeOf<
		V<"INSERT INTO users (nope, email, email) VALUES ('a', 'b', 'c')">
	>().toEqualTypeOf<
		SqlError<'column "nope" of relation "users" does not exist', 4>
	>();
	// expressions in VALUES are typed against the outer scope only
	expectTypeOf<V<"INSERT INTO users (email) VALUES (nope)">>().toEqualTypeOf<
		SqlError<'column "nope" does not exist', 8>
	>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES (users.email)">
	>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "users"', 2>
	>();
});

test("required columns (NOT NULL without default)", () => {
	expectTypeOf<
		V<"INSERT INTO users (display_name) VALUES ('a')">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			2
		>
	>();
	expectTypeOf<V<"INSERT INTO users DEFAULT VALUES">>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			2
		>
	>();
	expectTypeOf<V<"INSERT INTO users (email) VALUES (NULL)">>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			4
		>
	>();
	// generated / nullable columns may be omitted
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a')">
	>().toEqualTypeOf<"INSERT INTO users (email) VALUES ('a')">();
	expectTypeOf<
		V<"INSERT INTO posts (author_id, title) VALUES (1, 't')">
	>().toEqualTypeOf<"INSERT INTO posts (author_id, title) VALUES (1, 't')">();
	expectTypeOf<
		Row<"INSERT INTO events DEFAULT VALUES RETURNING id, note">
	>().toEqualTypeOf<{ id: string; note: string | null }>();
});

test("target table errors", () => {
	expectTypeOf<
		V<"INSERT INTO active_users (email) VALUES ('a')">
	>().toEqualTypeOf<SqlError<'cannot insert into view "active_users"', 2>>();
	expectTypeOf<V<"INSERT INTO nope (email) VALUES ('a')">>().toEqualTypeOf<
		SqlError<'relation "nope" does not exist', 2>
	>();
	// a CTE is not a DML target (as in Postgres)
	expectTypeOf<
		V<"WITH c AS (SELECT 1 AS x) INSERT INTO c (x) VALUES (2)">
	>().toEqualTypeOf<SqlError<'relation "c" does not exist', 1>>();
});

test("no column list: width check only, positional order unknown", () => {
	expectTypeOf<
		V<"INSERT INTO users VALUES (1, 'a', NULL, now())">
	>().toEqualTypeOf<"INSERT INTO users VALUES (1, 'a', NULL, now())">();
	expectTypeOf<
		V<"INSERT INTO users VALUES (1, 'a')">
	>().toEqualTypeOf<"INSERT INTO users VALUES (1, 'a')">();
	expectTypeOf<
		V<"INSERT INTO users VALUES (1, 'a', NULL, now(), 5)">
	>().toEqualTypeOf<
		SqlError<"INSERT has more expressions than target columns", 0>
	>();
	expectTypeOf<
		Row<"INSERT INTO users VALUES (1, 'a') RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<Params<"INSERT INTO users VALUES ($1, $2)">>().toEqualTypeOf<
		[unknown, unknown]
	>();
});

test("INSERT ... SELECT", () => {
	expectTypeOf<
		V<"INSERT INTO posts (author_id, title) SELECT id, email FROM users">
	>().toEqualTypeOf<"INSERT INTO posts (author_id, title) SELECT id, email FROM users">();
	expectTypeOf<
		Row<"INSERT INTO posts (author_id, title) SELECT id, email FROM users RETURNING id, title">
	>().toEqualTypeOf<{ id: string; title: string }>();
	expectTypeOf<
		V<"INSERT INTO posts (author_id, title) SELECT id FROM users">
	>().toEqualTypeOf<
		SqlError<"INSERT has more target columns than expressions", 0>
	>();
	expectTypeOf<
		V<"INSERT INTO posts (author_id, title) SELECT id, email, 1 FROM users">
	>().toEqualTypeOf<
		SqlError<"INSERT has more expressions than target columns", 0>
	>();
	// a `*` makes the width unknown: no count check
	expectTypeOf<
		V<"INSERT INTO posts (author_id, title) SELECT * FROM users">
	>().toEqualTypeOf<"INSERT INTO posts (author_id, title) SELECT * FROM users">();
	// parenthesized and WITH-prefixed sources
	expectTypeOf<
		Row<"INSERT INTO users (email) (SELECT email FROM users) RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"INSERT INTO users (email) WITH s AS (SELECT email FROM users) SELECT email FROM s RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		V<"INSERT INTO users (email) SELECT nope FROM users">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 7>>();
	expectTypeOf<
		V<"INSERT INTO users (email) OVERRIDING SYSTEM VALUE SELECT email FROM users">
	>().toEqualTypeOf<"INSERT INTO users (email) OVERRIDING SYSTEM VALUE SELECT email FROM users">();
});

test("ON CONFLICT", () => {
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO NOTHING">
	>().toEqualTypeOf<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO NOTHING">();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT DO NOTHING">
	>().toEqualTypeOf<"INSERT INTO users (email) VALUES ('a') ON CONFLICT DO NOTHING">();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING">
	>().toEqualTypeOf<"INSERT INTO users (email) VALUES ('a') ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING">();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (lower(email)) WHERE id > 1 DO NOTHING">
	>().toEqualTypeOf<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (lower(email)) WHERE id > 1 DO NOTHING">();
	// DO UPDATE sees the target (by name or alias) and `excluded`
	expectTypeOf<
		Row<"INSERT INTO users (email, display_name) VALUES ('a', 'b') ON CONFLICT (email) DO UPDATE SET display_name = excluded.display_name RETURNING id, display_name">
	>().toEqualTypeOf<{ id: number; display_name: string | null }>();
	expectTypeOf<
		Row<"INSERT INTO users AS u (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = excluded.email || u.email, created_at = DEFAULT WHERE u.id > 1 RETURNING u.display_name">
	>().toEqualTypeOf<{ display_name: string | null }>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET email = DEFAULT">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			4
		>
	>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = users.email">
	>().toEqualTypeOf<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = users.email">();
	// a target named `excluded` makes `excluded.` ambiguous in DO UPDATE (not in RETURNING, which has no `excluded`)
	expectTypeOf<
		V<"INSERT INTO users AS excluded (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = excluded.email">
	>().toEqualTypeOf<SqlError<'table reference "excluded" is ambiguous', 4>>();
	expectTypeOf<
		V<"INSERT INTO users AS excluded (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = 'x' RETURNING excluded.id">
	>().toEqualTypeOf<"INSERT INTO users AS excluded (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = 'x' RETURNING excluded.id">();
	// … as a whole row and in a star too
	expectTypeOf<
		V<"INSERT INTO users AS excluded (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = row_to_json(excluded)::text">
	>().toEqualTypeOf<SqlError<'table reference "excluded" is ambiguous', 4>>();
	expectTypeOf<
		V<"INSERT INTO users AS excluded (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = (SELECT count(*) FROM (SELECT excluded.*) x)::text">
	>().toEqualTypeOf<SqlError<'table reference "excluded" is ambiguous', 4>>();
	// the WHERE of DO UPDATE is checked
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = 'x' WHERE nope">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 22>>();
	// an unqualified column present in both the target and `excluded` is ambiguous (Postgres behaviour)
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = email">
	>().toEqualTypeOf<SqlError<'column reference "email" is ambiguous', 4>>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET nope = 1">
	>().toEqualTypeOf<
		SqlError<'column "nope" of relation "users" does not exist', 18>
	>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET display_name = excluded.nope">
	>().toEqualTypeOf<SqlError<"column excluded.nope does not exist", 22>>();
	// RETURNING does not see `excluded`
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO NOTHING RETURNING excluded.email">
	>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "excluded"', 18>
	>();
});

test("INSERT inside WITH", () => {
	expectTypeOf<
		Row<"WITH ins AS (INSERT INTO users (email) VALUES ('a') RETURNING id, email) SELECT ins.id, ins.email FROM ins">
	>().toEqualTypeOf<{ id: number; email: string }>();
	expectTypeOf<
		Row<"WITH ins AS (INSERT INTO users (email) VALUES ('a') RETURNING *) SELECT i.id, p.title FROM ins i LEFT JOIN posts p ON p.author_id = i.id">
	>().toEqualTypeOf<{ id: number; title: string | null }>();
	expectTypeOf<
		Row<"WITH src AS (SELECT email FROM users) INSERT INTO users (email) SELECT email FROM src RETURNING id">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"WITH a AS (INSERT INTO users (email) VALUES ('a') RETURNING id), b AS (INSERT INTO posts (author_id, title) SELECT id, 'hi' FROM a RETURNING id) SELECT * FROM b">
	>().toEqualTypeOf<{ id: string }>();
	expectTypeOf<
		V<"WITH ins AS (INSERT INTO users (email) VALUES ('a')) SELECT * FROM ins">
	>().toEqualTypeOf<
		SqlError<'WITH query "ins" does not have a RETURNING clause', 1>
	>();
});

test("syntax errors", () => {
	expectTypeOf<V<"INSERT users (email) VALUES ('a')">>().toEqualTypeOf<
		SqlError<"syntax error: expected INTO at or near users", 1>
	>();
	expectTypeOf<V<"INSERT INTO users (email) DEFAULT VALUES">>().toEqualTypeOf<
		SqlError<
			"syntax error at or near default: DEFAULT VALUES cannot be combined with a column list",
			6
		>
	>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') ON CONFLICT DO">
	>().toEqualTypeOf<
		SqlError<
			"syntax error: expected NOTHING or UPDATE SET at or near end of input",
			13
		>
	>();
	expectTypeOf<V<"INSERT INTO users (email) 'a'">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected VALUES, SELECT or DEFAULT VALUES at or near 'a'",
			6
		>
	>();
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') RETURNING nope">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 11>>();
	// each clause's error, at the token Postgres names
	type E<Q extends string> =
		V<Q> extends SqlError<infer M extends string, infer At> ? [M, At] : "ok";
	expectTypeOf<
		[
			E<"INSERT INTO users * VALUES ('a')">,
			E<"INSERT INTO users (email VALUES ('a')">,
			E<"INSERT INTO users OVERRIDING x VALUE">,
			E<"INSERT INTO users OVERRIDING SYSTEM (1)">,
			E<"INSERT INTO users OVERRIDING USER VALUES ('a')">,
			E<"INSERT INTO users DEFAULT x">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT ON CONSTRAINT DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) WHERE email > DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') RETURNING id +">,
			E<"INSERT INTO (x) VALUES ('a')">,
			E<"INSERT INTO users SELECT +">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email[) DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (lower(email) DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email WHERE) DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email DESC) DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (id, email ASC) DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email NULLS FIRST) DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET email = +">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email) DO UPDATE SET email = 'b' WHERE +">,
		]
	>().toEqualTypeOf<
		[
			[
				"syntax error: expected VALUES, SELECT or DEFAULT VALUES at or near *",
				3,
			],
			['syntax error: expected "," or ")" at or near values', 5],
			["syntax error: expected SYSTEM or USER at or near x", 4],
			["syntax error: expected VALUE at or near (", 5],
			["syntax error: expected VALUE at or near values", 5],
			["syntax error: expected VALUES at or near x", 4],
			["syntax error: expected constraint name at or near do", 14],
			['syntax error: expected "," or ")" at or near do', 14],
			["syntax error at or near do", 18],
			["syntax error at end of input", 13],
			["syntax error: expected table name at or near (", 2],
			["syntax error at end of input", 5],
			["syntax error at or near )", 15],
			["syntax error: expected DO at or near nothing", 15],
			['syntax error: expected "," or ")" at or near do', 17],
			['syntax error: expected "," or ")" at or near where', 14],
			["ASC/DESC is not allowed in ON CONFLICT clause", 13],
			["ASC/DESC is not allowed in ON CONFLICT clause", 15],
			["NULLS FIRST/LAST is not allowed in ON CONFLICT clause", 13],
			["syntax error at end of input", 21],
			["syntax error at end of input", 23],
		]
	>();
	expectTypeOf<
		[
			E<"INSERT INTO users (email) OVERRIDING SYSTEM VALUE VALUES ('a')">,
			E<"INSERT INTO users (SELECT id, email, display_name, created_at FROM users)">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (id, email) WHERE id > 1 DO NOTHING">,
			E<"INSERT INTO users (email) VALUES ('a') ON CONFLICT (email text_pattern_ops) DO NOTHING">,
		]
	>().toEqualTypeOf<["ok", "ok", "ok", "ok"]>();
});

test("sql() call sites", () => {
	const q = sql("INSERT INTO users (email) VALUES ($1) RETURNING id", "a");
	expectTypeOf(q.text).toEqualTypeOf<string>();
	sql("INSERT INTO posts (author_id, title) VALUES ($1, $2)", 1, "t");
	// @ts-expect-error wrong param type (text column)
	sql("INSERT INTO users (email) VALUES ($1) RETURNING id", 1);
	// @ts-expect-error missing param
	sql("INSERT INTO users (email) VALUES ($1)");
	expectTypeOf<
		Validate<DB, "INSERT INTO users (emial) VALUES ('a')">
	>().toEqualTypeOf<
		SqlError<
			'column "emial" of relation "users" does not exist. Perhaps you meant the column "email"?',
			4
		>
	>();
	expectTypeOf<
		Validate<DB, "INSERT INTO users (display_name) VALUES ('a')">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "email" of relation "users" violates not-null constraint',
			2
		>
	>();
	expectTypeOf<
		Validate<DB, "INSERT INTO active_users (email) VALUES ('a')">
	>().toEqualTypeOf<SqlError<'cannot insert into view "active_users"', 2>>();
});
