import { expectTypeOf, test } from "vitest";
import {
	type Col,
	createSql,
	type Generated,
	type Nullable,
	type ParamsOf,
	type RowOf,
	type SqlError,
	type Validate,
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
		tags: Col<"text[]">;
		meta: Nullable<"jsonb">;
	};
}

const sql = createSql<DB>();

test("plain columns", () => {
	const q = sql("SELECT id, email, display_name FROM users");
	expectTypeOf(q.text).toEqualTypeOf<string>();
	expectTypeOf<
		RowOf<DB, DefaultTM, "SELECT id, email, display_name FROM users">
	>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
	}>();
});

type DefaultTM = import("../../../src/index.js").DefaultTypeMap;
type Row<Q extends string> = RowOf<DB, DefaultTM, Q>;
type Params<Q extends string> = ParamsOf<DB, DefaultTM, Q>;

test("aliases, qualified refs, star", () => {
	expectTypeOf<
		Row<"SELECT u.id AS uid, u.email mail FROM users u">
	>().toEqualTypeOf<{ uid: number; mail: string }>();
	expectTypeOf<Row<"SELECT * FROM users">>().toEqualTypeOf<{
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	}>();
	expectTypeOf<
		Row<"SELECT p.*, u.email FROM posts p JOIN users u ON u.id = p.author_id">
	>().toEqualTypeOf<{
		id: string;
		author_id: number;
		title: string;
		body: string | null;
		tags: string[];
		meta: unknown;
		email: string;
	}>();
});

test("joins and nullability", () => {
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u LEFT JOIN posts p ON p.author_id = u.id">
	>().toEqualTypeOf<{ id: number; title: string | null }>();
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u RIGHT JOIN posts p ON p.author_id = u.id">
	>().toEqualTypeOf<{ id: number | null; title: string }>();
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u FULL JOIN posts p ON p.author_id = u.id">
	>().toEqualTypeOf<{ id: number | null; title: string | null }>();
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u INNER JOIN posts p ON p.author_id = u.id">
	>().toEqualTypeOf<{ id: number; title: string }>();
	expectTypeOf<
		Row<"SELECT u.id, p.title FROM users u, posts p WHERE p.author_id = u.id">
	>().toEqualTypeOf<{ id: number; title: string }>();
});

test("literals, operators, casts, column naming", () => {
	expectTypeOf<
		Row<"SELECT 1, 'a', true, 1.5, NULL FROM users">
	>().toEqualTypeOf<{ "?column?": null }>();
	expectTypeOf<
		Row<"SELECT 1 AS one, 'a' AS s, true AS b, 1.5 AS n">
	>().toEqualTypeOf<{ one: number; s: string; b: boolean; n: string }>();
	expectTypeOf<
		Row<"SELECT id + 1 AS x, id::text, display_name::int4 FROM users">
	>().toEqualTypeOf<{ x: number; id: string; display_name: number | null }>();
	expectTypeOf<Row<"SELECT 1::int8, CAST('x' AS text)">>().toEqualTypeOf<{
		int8: string;
		text: string;
	}>();
	expectTypeOf<
		Row<"SELECT id = 1 AS eq, display_name IS NULL AS isn, NOT (id > 2) AS nt FROM users">
	>().toEqualTypeOf<{ eq: boolean; isn: boolean; nt: boolean }>();
	expectTypeOf<
		Row<"SELECT display_name || 'x' AS c, email || display_name AS d FROM users">
	>().toEqualTypeOf<{ c: string | null; d: string | null }>();
	expectTypeOf<
		Row<"SELECT lower(email), count(*), max(display_name) FROM users GROUP BY email">
	>().toEqualTypeOf<{ lower: string; count: string; max: string | null }>();
	expectTypeOf<Row<"SELECT max(id) FROM users">>().toEqualTypeOf<{
		max: number | null;
	}>();
	expectTypeOf<
		Row<"SELECT max(id) FROM users GROUP BY email">
	>().toEqualTypeOf<{ max: number }>();
	expectTypeOf<
		Row<"SELECT CASE WHEN id > 1 THEN 'a' ELSE 'b' END FROM users">
	>().toEqualTypeOf<{ case: string }>();
	expectTypeOf<
		Row<"SELECT CASE WHEN id > 1 THEN 'a' END AS c FROM users">
	>().toEqualTypeOf<{ c: string | null }>();
	expectTypeOf<
		Row<"SELECT coalesce(display_name, 'x') AS c, coalesce(display_name, body) AS d FROM users, posts">
	>().toEqualTypeOf<{ c: string; d: string | null }>();
});

test("params", () => {
	expectTypeOf<Params<"SELECT id FROM users WHERE id = $1">>().toEqualTypeOf<
		[number | null]
	>();
	expectTypeOf<
		Params<"SELECT id FROM users WHERE id = $1 AND email = $2">
	>().toEqualTypeOf<[number | null, string | null]>();
	expectTypeOf<
		Params<"SELECT id FROM users WHERE display_name = $1">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<Params<"SELECT id FROM users WHERE $1 = id">>().toEqualTypeOf<
		[number | null]
	>();
	expectTypeOf<
		Params<"SELECT id FROM users LIMIT $1 OFFSET $2">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM users WHERE id = $2 AND email = $1">
	>().toEqualTypeOf<[string | null, number | null]>();
	expectTypeOf<Params<"SELECT $1::int4 AS n">>().toEqualTypeOf<[number]>();
	expectTypeOf<
		Params<"SELECT id FROM users WHERE id IN ($1, $2)">
	>().toEqualTypeOf<[number | null, number | null]>();
	expectTypeOf<
		Params<"SELECT id FROM users WHERE id = ANY($1)">
	>().toEqualTypeOf<[(number | null)[] | null]>();
	expectTypeOf<
		Params<"SELECT id FROM users WHERE email LIKE $1">
	>().toEqualTypeOf<[string | null]>();
	expectTypeOf<
		Params<"SELECT id FROM users WHERE id = $1 OR id = $1">
	>().toEqualTypeOf<[number | null]>();
	expectTypeOf<Params<"SELECT $1">>().toEqualTypeOf<[unknown]>();
	expectTypeOf<Params<"SELECT id FROM users">>().toEqualTypeOf<[]>();
});

test("runtime object", () => {
	const q = sql("SELECT id FROM users WHERE id = $1", 7);
	expectTypeOf(q.values).toEqualTypeOf<readonly unknown[]>();
	// @ts-expect-error wrong param type
	sql("SELECT id FROM users WHERE id = $1", "7");
	// @ts-expect-error missing param
	sql("SELECT id FROM users WHERE id = $1");
	const q2 = sql.as<{ x: number }>("SELECT whatever", 1);
	expectTypeOf(q2).toEqualTypeOf<
		import("../../../src/index.js").Query<{ x: number }, readonly unknown[]>
	>();
});

test("errors", () => {
	expectTypeOf<Validate<DB, "SELECT nme FROM users">>().toEqualTypeOf<
		SqlError<'column "nme" does not exist', 1>
	>();
	expectTypeOf<Validate<DB, "SELECT id FROM nope">>().toEqualTypeOf<
		SqlError<'relation "nope" does not exist', 3>
	>();
	expectTypeOf<Validate<DB, "SELECT id FROM users u, posts p">>().toEqualTypeOf<
		SqlError<'column reference "id" is ambiguous', 1>
	>();
	expectTypeOf<Validate<DB, "SELECT u.nope FROM users u">>().toEqualTypeOf<
		SqlError<"column u.nope does not exist", 3>
	>();
	expectTypeOf<Validate<DB, "SELECT x.id FROM users u">>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "x"', 1>
	>();
	expectTypeOf<Validate<DB, "SELECT id FROM users WHERE">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 5>
	>();
	expectTypeOf<Validate<DB, "SELEC id FROM users">>().toEqualTypeOf<
		SqlError<"syntax error at or near selec", 0>
	>();
	expectTypeOf<
		Validate<DB, "SELECT id FROM users">
	>().toEqualTypeOf<"SELECT id FROM users">();
	expectTypeOf<Validate<DB, "SELECT nme FROM users">>().toEqualTypeOf<
		SqlError<'column "nme" does not exist', 1>
	>();
});

test("unknown names get a did-you-mean hint", () => {
	expectTypeOf<Validate<DB, "SELECT emial FROM users">>().toEqualTypeOf<
		SqlError<
			'column "emial" does not exist. Perhaps you meant the column "email"?',
			1
		>
	>();
	expectTypeOf<Validate<DB, "SELECT p.titel FROM posts p">>().toEqualTypeOf<
		SqlError<
			'column p.titel does not exist. Perhaps you meant the column "title"?',
			3
		>
	>();
	expectTypeOf<Validate<DB, "SELECT 1 FROM post">>().toEqualTypeOf<
		SqlError<
			'relation "post" does not exist. Perhaps you meant the relation "posts"?',
			3
		>
	>();
	// `order` is a reserved word: a syntax error, as in Postgres (`FROM user` is the function `user`)
	expectTypeOf<Validate<DB, "SELECT 1 FROM order">>().toEqualTypeOf<
		SqlError<
			"syntax error: expected table name, subquery or function at or near order",
			3
		>
	>();
	expectTypeOf<Validate<DB, "SELECT zzz FROM users">>().toEqualTypeOf<
		SqlError<'column "zzz" does not exist', 1>
	>();
});
