import { expectTypeOf, test } from "vitest";
import type { NamesOf, ParamsArgs } from "../../../src/engine/index.js";
import {
	type Col,
	createSql,
	type DefaultTypeMap,
	type Fragment,
	type Generated,
	type Nullable,
	type Query,
	type SqlError,
	type Validate,
} from "../../../src/index.js";

interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		display_name: Nullable<"text">;
		age: Nullable<"int4">;
		tags: Col<"text[]">;
	};
}
const sql = createSql<DB>();

test("named parameters are rewritten in first-appearance order", () => {
	expectTypeOf<
		NamesOf<
			DB,
			"SELECT id FROM users WHERE id = :id AND email = :email OR id = :id"
		>
	>().toEqualTypeOf<["id", "email"]>();
	expectTypeOf<
		ParamsArgs<
			DB,
			DefaultTypeMap,
			"SELECT id FROM users WHERE id = :id AND email = :email"
		>
	>().toEqualTypeOf<[params: { id: number | null; email: string | null }]>();
	expectTypeOf<
		ParamsArgs<DB, DefaultTypeMap, "SELECT id FROM users WHERE id = $1">
	>().toEqualTypeOf<[number | null]>();
	const q = sql("SELECT id FROM users WHERE id = :id AND email = :email", {
		id: 1,
		email: "x",
	});
	expectTypeOf(q).toEqualTypeOf<
		Query<
			{ id: number },
			[number | null, string | null],
			"SELECT id FROM users WHERE id = $1 AND email = $2"
		>
	>();
	// @ts-expect-error wrong type for a named parameter
	sql("SELECT id FROM users WHERE id = :id", { id: "1" });
	// @ts-expect-error missing named parameter
	sql("SELECT id FROM users WHERE id = :id AND email = :email", { id: 1 });
});

test("casts, := and colons in literals are not parameters", () => {
	expectTypeOf<
		NamesOf<DB, "SELECT id::text, 'a:b', age FROM users WHERE id = $1">
	>().toEqualTypeOf<[]>();
	const q = sql("SELECT id::text AS t, 'a:b' AS s FROM users WHERE id = :id", {
		id: 3,
	});
	expectTypeOf(q).toEqualTypeOf<
		Query<
			{ t: string; s: string },
			[number | null],
			"SELECT id::text AS t, 'a:b' AS s FROM users WHERE id = $1"
		>
	>();
});

test("mixing styles is an error", () => {
	expectTypeOf<
		Validate<DB, "SELECT id FROM users WHERE id = :id AND email = $1">
	>().toEqualTypeOf<
		SqlError<"cannot mix named (:name) and positional ($n) parameters", 0>
	>();
});

test("named parameters work with fragments", () => {
	const where = sql.fragment("WHERE age > :min", { min: 18 });
	expectTypeOf(where).toEqualTypeOf<
		Fragment<"WHERE age > $1", [unknown], ["n"]>
	>();
	const q = sql("SELECT id FROM users u {where}", { where });
	expectTypeOf(q).toEqualTypeOf<
		Query<
			{ id: number },
			[number | null],
			"SELECT id FROM users u WHERE age > $1"
		>
	>();
	// outer named params come first, fragment params are renumbered after them
	const more = sql.fragment("AND age > :min", { min: 18 });
	const q2 = sql(
		"SELECT id FROM users u WHERE email = :email {more}",
		{ more },
		{ email: "e" },
	);
	expectTypeOf(q2).toEqualTypeOf<
		Query<
			{ id: number },
			[string | null, number | null],
			"SELECT id FROM users u WHERE email = $1 AND age > $2"
		>
	>();
});

test("a name starts with a letter or _ and goes on with letters, digits and _", () => {
	expectTypeOf<
		NamesOf<
			DB,
			"SELECT id FROM users WHERE id IN (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l, :m, :n, :o, :p, :q, :r, :s, :t, :u, :v, :w, :x, :y, :z, :A, :B, :C, :D, :E, :F, :G, :H, :I, :J, :K, :L, :M, :N, :O, :P, :Q, :R, :S, :T, :U, :V, :W, :X, :Y, :Z, :_, :a_1)"
		>
	>().toEqualTypeOf<
		[
			"a",
			"b",
			"c",
			"d",
			"e",
			"f",
			"g",
			"h",
			"i",
			"j",
			"k",
			"l",
			"m",
			"n",
			"o",
			"p",
			"q",
			"r",
			"s",
			"t",
			"u",
			"v",
			"w",
			"x",
			"y",
			"z",
			"A",
			"B",
			"C",
			"D",
			"E",
			"F",
			"G",
			"H",
			"I",
			"J",
			"K",
			"L",
			"M",
			"N",
			"O",
			"P",
			"Q",
			"R",
			"S",
			"T",
			"U",
			"V",
			"W",
			"X",
			"Y",
			"Z",
			"_",
			"a_1",
		]
	>();
});

test("a name used again gets its first number", () => {
	const q = sql(
		"SELECT id FROM users WHERE id = :id OR age = :age OR age = :id",
		{ id: 1, age: 2 },
	);
	expectTypeOf(q).toEqualTypeOf<
		Query<
			{ id: number },
			[number | null, number | null],
			"SELECT id FROM users WHERE id = $1 OR age = $2 OR age = $1"
		>
	>();
	expectTypeOf<
		ParamsArgs<
			DB,
			DefaultTypeMap,
			"SELECT id FROM users WHERE id = :id OR age = :age OR age = :id"
		>
	>().toEqualTypeOf<[params: { id: number | null; age: number | null }]>();
});

test("only a colon directly followed by a name is a parameter, as at runtime", () => {
	// array slices and JSON_OBJECT pairs: `:2`, `: age`, `:'c'` are not names
	const q = sql(
		"SELECT tags[1: age] AS x, tags[1:2] AS y, json_object('a': id) AS j, json_object('b':'c') AS k FROM users WHERE id = :id",
		{ id: 1 },
	);
	expectTypeOf(q).toEqualTypeOf<
		Query<
			{
				x: string[] | null;
				y: string[];
				j: { a: number };
				k: { b: string };
			},
			[number | null],
			"SELECT tags[1: age] AS x, tags[1:2] AS y, json_object('a': id) AS j, json_object('b':'c') AS k FROM users WHERE id = $1"
		>
	>();
	expectTypeOf<
		Validate<DB, "SELECT tags[1: age] AS x FROM users">
	>().toEqualTypeOf<"SELECT tags[1: age] AS x FROM users">();
	// `[1:age]` is a slice to PostgreSQL, a parameter here (and at runtime)
	expectTypeOf<
		Validate<DB, "SELECT tags[1:age] AS x FROM users">
	>().toEqualTypeOf<SqlError<'syntax error: expected "]" at or near $1', 4>>();
	// `:=` (named function arguments) is not a parameter either
	expectTypeOf(
		sql.fragment("make_interval(days := :d, hours:=:h)", { d: 1, h: 2 }),
	).toEqualTypeOf<
		Fragment<
			"make_interval(days := $1, hours:=$2)",
			[unknown, unknown],
			["n", "n"]
		>
	>();
});

test("dollar-quoted strings are copied verbatim", () => {
	const q = sql(
		"SELECT $$ :a $$ AS s, $q$it's :b$q$ AS t, id AS x$y FROM users WHERE id = :id",
		{ id: 1 },
	);
	expectTypeOf(q).toEqualTypeOf<
		Query<
			{ s: string; t: string; x$y: number },
			[number | null],
			"SELECT $$ :a $$ AS s, $q$it's :b$q$ AS t, id AS x$y FROM users WHERE id = $1"
		>
	>();
	// `$,y$` is no opener: a tag starts with a letter or _
	const ids = sql(
		"SELECT x$,y$ FROM (VALUES (1, 'a')) AS s(x$, y$) WHERE x$ = :id",
		{ id: 1 },
	);
	expectTypeOf(ids).toEqualTypeOf<
		Query<
			{ x$: number; y$: string },
			[number | null],
			"SELECT x$,y$ FROM (VALUES (1, 'a')) AS s(x$, y$) WHERE x$ = $1"
		>
	>();
	expectTypeOf<
		Validate<DB, "SELECT id FROM users WHERE id = :id AND email = $$x:y">
	>().toEqualTypeOf<
		SqlError<'unterminated dollar-quoted string at or near "$$x:y"', 11>
	>();
});

test("a name PostgreSQL reads inside a string or comment takes no value", () => {
	// the rewrite (like the runtime) ends the string at \' and the comment at the inner */
	expectTypeOf<
		ParamsArgs<
			DB,
			DefaultTypeMap,
			"SELECT id FROM users WHERE email = E'\\':a'"
		>
	>().toEqualTypeOf<[params: { a: never }]>();
	expectTypeOf<
		ParamsArgs<
			DB,
			DefaultTypeMap,
			"SELECT id FROM users /* /* */ WHERE id = :a */"
		>
	>().toEqualTypeOf<[params: { a: never }]>();
});
