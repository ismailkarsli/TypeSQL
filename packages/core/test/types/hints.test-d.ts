import { expectTypeOf, test } from "vitest";
import type { Col, Sig, SqlError, Validate, View } from "../../src/index.js";

// "Perhaps you meant" hints (engine/suggest.ts): candidates from the relations the statement
// names (also quoted, in a schema, or a view), from every relation, and from the functions.
interface H {
	users: { id: Col<"int4">; name: Col<"text"> };
	v_people: View<{ person_name: Col<"text"> }>;
	auth: {
		accounts: { login: Col<"text"> };
		sessions: View<{ token: Col<"text"> }>;
	};
	$types: { mood: "a" };
	$functions: { my_func: Sig<["int4"], "int4"> };
}
type V<Q extends string> = Validate<H, Q>;

test("column hints: from the relations the statement names", () => {
	expectTypeOf<
		[
			V<'SELECT nme FROM "users"'>,
			V<"SELECT naem FROM users">,
			V<"SELECT logn FROM auth.accounts">,
			V<"SELECT tokn FROM auth.sessions">,
			V<"SELECT person_nme FROM v_people">,
			// a schema's tables are not columns
			V<"SELECT acounts FROM auth.accounts">,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				'column "nme" does not exist. Perhaps you meant the column "name"?',
				1
			>,
			SqlError<
				'column "naem" does not exist. Perhaps you meant the column "name"?',
				1
			>,
			SqlError<
				'column "logn" does not exist. Perhaps you meant the column "login"?',
				1
			>,
			SqlError<
				'column "tokn" does not exist. Perhaps you meant the column "token"?',
				1
			>,
			SqlError<
				'column "person_nme" does not exist. Perhaps you meant the column "person_name"?',
				1
			>,
			SqlError<'column "acounts" does not exist', 1>,
		]
	>();
});

test("relation hints: every relation, in a schema too; function hints", () => {
	expectTypeOf<
		[
			V<"SELECT 1 FROM acounts">,
			V<"SELECT 1 FROM sesions">,
			V<"SELECT 1 FROM v_peple">,
			V<"SELECT my_fnc(1)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				'relation "acounts" does not exist. Perhaps you meant the relation "accounts"?',
				3
			>,
			SqlError<
				'relation "sesions" does not exist. Perhaps you meant the relation "sessions"?',
				3
			>,
			SqlError<
				'relation "v_peple" does not exist. Perhaps you meant the relation "v_people"?',
				3
			>,
			SqlError<
				'function my_fnc(int4) does not exist. Perhaps you meant the function "my_func"? Otherwise declare it in the schema\'s $functions or in FunctionCatalog',
				1
			>,
		]
	>();
});

/** A column named like a relation, a schema and a table both called auth, members of a schema that are not relations. */
interface H2 {
	users: { id: Col<"int4">; posts: Col<"text"> };
	posts: { title: Col<"text"> };
	auth: { auth: { login: Col<"text"> }; junk: { x: 1 }; ver: "1" };
}
test("no hint from a column's descriptor, a schema's name or what is not a relation; none when nothing is close", () => {
	expectTypeOf<
		[
			Validate<H2, "SELECT typ FROM posts">,
			Validate<H2, "SELECT aut FROM auth.auth">,
			Validate<H2, "SELECT 1 FROM junkk">,
			Validate<H2, "SELECT 1 FROM verr">,
			Validate<H2, "SELECT zzzz FROM posts">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'column "typ" does not exist', 1>,
			SqlError<'column "aut" does not exist', 1>,
			SqlError<'relation "junkk" does not exist', 3>,
			SqlError<'relation "verr" does not exist', 3>,
			SqlError<'column "zzzz" does not exist', 1>,
		]
	>();
});
