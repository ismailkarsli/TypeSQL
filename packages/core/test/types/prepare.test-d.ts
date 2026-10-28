import { expectTypeOf, test } from "vitest";
import {
	type Col,
	createSql,
	type Generated,
	type Nullable,
	type ParamsType,
	type Query,
	type RowType,
	type TextType,
} from "../../src/index.js";

interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		display_name: Nullable<"text">;
	};
}
const sql = createSql<DB>();

test("prepared positional parameters and rows retain exact types", () => {
	const bind = sql.prepare("SELECT id, display_name FROM users WHERE id = $1");
	expectTypeOf(bind).parameters.toEqualTypeOf<[number | null]>();
	expectTypeOf(bind(1)).toEqualTypeOf<
		Query<
			{ id: number; display_name: string | null },
			[number | null],
			"SELECT id, display_name FROM users WHERE id = $1"
		>
	>();
	expectTypeOf(bind(null).execute()).toEqualTypeOf<
		Promise<{ id: number; display_name: string | null }[]>
	>();
	expectTypeOf(bind(1).executeTakeFirst()).toEqualTypeOf<
		Promise<{ id: number; display_name: string | null } | undefined>
	>();
	// @ts-expect-error a prepared binding requires its parameter
	bind();
	// @ts-expect-error wrong parameter type
	bind("1");
	// @ts-expect-error extra parameter
	bind(1, 2);
});

test("named parameters and DML use the same argument checks as sql()", () => {
	const insert = sql.prepare(
		"INSERT INTO users (email, display_name) VALUES (:email, :name) RETURNING id",
	);
	expectTypeOf(insert).parameters.toEqualTypeOf<
		[params: { email: string; name: string | null }]
	>();
	expectTypeOf(
		insert({ email: "a", name: null }).executeTakeFirstOrThrow(),
	).toEqualTypeOf<Promise<{ id: number }>>();
	// @ts-expect-error NOT NULL input cannot be null
	insert({ email: null, name: "A" });
	// @ts-expect-error missing named parameter
	insert({ email: "a" });
	// @ts-expect-error named parameters require an object
	insert("a", null);
	const del = sql.prepare("DELETE FROM users WHERE id = $1");
	expectTypeOf(del(1).execute()).toEqualTypeOf<Promise<never[]>>();
	expectTypeOf(del(1).executeCount()).toEqualTypeOf<Promise<number>>();
});

test("slots and inline values are fixed, while outer parameters remain bindable", () => {
	const where = sql.fragment("AND email = $1", "fixed");
	const bind = sql.prepare(
		`SELECT id FROM users WHERE id > $1 AND id < ${sql.param(100)} {where}`,
		{ where },
	);
	expectTypeOf(bind).parameters.toEqualTypeOf<[number | null]>();
	const q = bind(1);
	expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<
		[number | null, number | null, string | null]
	>();
	expectTypeOf<
		TextType<typeof q>
	>().toEqualTypeOf<"SELECT id FROM users WHERE id > $1 AND id < $2 AND email = $3">();
	expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ id: number }>();
	const named = sql.prepare("SELECT id FROM users WHERE id = :id {where}", {
		where,
	});
	expectTypeOf(named).parameters.toEqualTypeOf<
		[params: { id: number | null }]
	>();
	const all = sql.prepare("SELECT id FROM users {where}", {
		where: sql.fragment("WHERE id = $1", 1),
	});
	expectTypeOf(all).parameters.toEqualTypeOf<[]>();
});

test("no parameters, custom row keys and null narrowing", () => {
	expectTypeOf(sql.prepare("SELECT id FROM users")).parameters.toEqualTypeOf<
		[]
	>();
	const camel = createSql<DB>(undefined, { rowKeys: "camelCase" });
	const narrowed = camel.prepare(
		"SELECT display_name FROM users WHERE display_name IS NOT NULL",
	)();
	expectTypeOf(narrowed.execute()).toEqualTypeOf<
		Promise<{ displayName: string }[]>
	>();
	const nullable = camel.prepare("SELECT display_name FROM users")();
	expectTypeOf(nullable.execute()).toEqualTypeOf<
		Promise<{ displayName: string | null }[]>
	>();
});

test("preparation rejects invalid SQL and invalid carried values", () => {
	// @ts-expect-error SQL error appears on the prepared SQL text
	sql.prepare("SELECT missing FROM users");
	// @ts-expect-error SQL must be a literal
	sql.prepare("SELECT id FROM users" as string);
	// @ts-expect-error named and positional parameters cannot be mixed
	sql.prepare("SELECT id FROM users WHERE id = :id OR id = $1");
	// @ts-expect-error a fragment cannot carry a string for an integer parameter
	sql.prepare("SELECT id FROM users WHERE {where}", {
		where: sql.fragment("id = $1", "wrong"),
	});
	// @ts-expect-error inline carried values must match their context
	sql.prepare(`SELECT id FROM users WHERE id = ${sql.param("wrong")}`);
});
