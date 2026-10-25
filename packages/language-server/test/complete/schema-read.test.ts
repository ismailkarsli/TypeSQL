/** `schemaOf` against a fake checker: which members are relations, views and namespaces, and the columns' types. */
import type { Checker, Type } from "typescript/async";
import { expect, test } from "vitest";
import { schemaOf } from "../../src/complete/schema.js";

interface Fake {
	readonly id: number;
	readonly props?: Record<string, Fake>;
	readonly members?: readonly Fake[];
	readonly value?: string | boolean;
	readonly str?: string;
	isObjectType(): boolean;
	isIntersectionType(): boolean;
	isStringLiteralType(): boolean;
	isBooleanLiteralType(): boolean;
	getTypes?(): Promise<readonly Fake[]>;
}

let ids = 0;
const type = (
	kind: "object" | "intersection" | "string" | "boolean" | "other",
	rest: Partial<Fake> = {},
): Fake => ({
	id: ++ids,
	isObjectType: () => kind === "object",
	isIntersectionType: () => kind === "intersection",
	isStringLiteralType: () => kind === "string",
	isBooleanLiteralType: () => kind === "boolean",
	...(kind === "intersection"
		? { getTypes: async () => rest.members ?? [] }
		: {}),
	...rest,
});
const obj = (props: Record<string, Fake>): Fake => type("object", { props });
const lit = (value: string): Fake => type("string", { value });
const bool = (value: boolean): Fake => type("boolean", { value });
const col = (t?: Fake, nullable?: Fake): Fake =>
	obj({ ...(t ? { type: t } : {}), ...(nullable ? { nullable } : {}) });
const view = (props: Record<string, Fake>): Fake => obj({ $view: obj(props) });

interface Sym {
	readonly name: string;
	readonly type: Fake;
}
const checker = {
	getPropertiesOfType: async (t: Fake): Promise<Sym[]> =>
		Object.entries(t.props ?? {}).map(([name, type]) => ({ name, type })),
	getTypeOfSymbol: async (s: Sym | readonly Sym[]) =>
		Array.isArray(s) ? s.map((x: Sym) => x.type) : (s as Sym).type,
	getPropertyOfType: async (t: Fake, name: string) => {
		const p = t.props?.[name];
		return p ? { name, type: p } : undefined;
	},
	getTypeOfPropertyOfType: async (t: Fake, name: string) => t.props?.[name],
	typeToString: async (t: Fake) => t.str ?? "?",
} as unknown as Checker;

const DB = obj({
	users: obj({
		id: col(lit("int4"), bool(false)),
		email: col(lit("text"), bool(true)),
	}),
	// a table type that is an intersection
	docs: type("intersection", { props: { id: col(lit("int8")) } }),
	active: view({ id: col(lit("int4")) }),
	empty: obj({}),
	types: obj({
		branded: col(type("intersection", { members: [obj({}), lit("jsonb")] })),
		joined: col(
			type("intersection", { members: [obj({}), obj({})], str: "A & B" }),
		),
		plain: col(type("other", { str: "string" })),
		untyped: col(undefined, bool(true)),
		maybe: col(lit("text"), type("other", { str: "boolean" })),
	}),
	version: lit("1"),
	auth: obj({
		sessions: obj({ id: col(lit("uuid")) }),
		audit: view({ at: col(lit("timestamptz")) }),
	}),
	pg_catalog: obj({ pg_class: obj({ relname: col(lit("name")) }) }),
	$types: obj({ mood: obj({ happy: lit("happy") }) }),
	$functions: obj({ now: obj({ type: lit("timestamptz") }) }),
});

const read = () => schemaOf(checker, DB as unknown as Type);

test("top-level relations and namespaces; $types, $functions and non-objects are neither", async () => {
	const s = await read();
	expect(await s.relations(null)).toEqual([
		{ schema: null, name: "users", view: false },
		{ schema: null, name: "docs", view: false },
		{ schema: null, name: "active", view: true },
		{ schema: null, name: "empty", view: false },
		{ schema: null, name: "types", view: false },
	]);
	expect(await s.relations("public")).toBe(await s.relations(null));
	expect(s.namespaces).toEqual(["auth", "pg_catalog"]);
});

test("a namespace's relations, read once; an unknown namespace has none", async () => {
	const s = await read();
	const auth = await s.relations("auth");
	expect(auth).toEqual([
		{ schema: "auth", name: "sessions", view: false },
		{ schema: "auth", name: "audit", view: true },
	]);
	expect(await s.relations("auth")).toBe(auth);
	expect(await s.relations("nope")).toEqual([]);
	expect(await s.relations("$types")).toEqual([]);
});

test("columns as written: unqualified names fall back to pg_catalog, `public.` does not", async () => {
	const s = await read();
	const names = async (schema: string | null, name: string) =>
		(await s.columns({ schema, name }))?.map((c) => c.name) ?? null;
	expect(await names(null, "users")).toEqual(["id", "email"]);
	expect(await names("public", "users")).toEqual(["id", "email"]);
	expect(await names(null, "docs")).toEqual(["id"]);
	expect(await names(null, "active")).toEqual(["id"]);
	expect(await names(null, "empty")).toEqual([]);
	expect(await names(null, "pg_class")).toEqual(["relname"]);
	expect(await names("pg_catalog", "pg_class")).toEqual(["relname"]);
	expect(await names("public", "pg_class")).toBeNull();
	expect(await names("auth", "audit")).toEqual(["at"]);
	expect(await names("auth", "users")).toBeNull();
	expect(await names(null, "nope")).toBeNull();
	expect(await names("nope", "users")).toBeNull();
	const users = await s.columns({ schema: null, name: "users" });
	expect(await s.columns({ schema: "public", name: "users" })).toBe(users);
});

test("a column's type name and nullability", async () => {
	const s = await read();
	expect(await s.columns({ schema: null, name: "users" })).toEqual([
		{ name: "id", type: "int4", nullable: false },
		{ name: "email", type: "text", nullable: true },
	]);
	expect(await s.columns({ schema: null, name: "types" })).toEqual([
		// a JSON column's branded name
		{ name: "branded", type: "jsonb", nullable: false },
		{ name: "joined", type: "A & B", nullable: false },
		{ name: "plain", type: "string", nullable: false },
		{ name: "untyped", type: "unknown", nullable: true },
		{ name: "maybe", type: "text", nullable: false },
	]);
});
