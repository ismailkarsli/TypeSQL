/** `completions` for each kind of context, against a fake schema; `quoteIdent`; `editorKinds`. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import {
	type Column,
	type Context,
	completions,
	editorKinds,
	quoteIdent,
	type Relation,
	type RelRef,
	type Schema,
} from "../../src/complete/index.js";

const name = (r: RelRef): string =>
	r.schema === null ? r.name : `${r.schema}.${r.name}`;

function schema(
	relations: Record<string, readonly Relation[]>,
	columns: Record<string, readonly Column[]> = {},
): Schema {
	return {
		namespaces: Object.keys(relations).filter((n) => n !== "public"),
		relations: async (s) => relations[s ?? "public"] ?? [],
		columns: async (ref) => columns[name(ref)] ?? null,
	};
}

const rel = (n: string, s: string | null = null, view = false): Relation => ({
	schema: s,
	name: n,
	view,
});

const DB = schema(
	{
		public: [rel("users"), rel("posts"), rel("active", null, true)],
		auth: [rel("sessions", "auth"), rel("audit", "auth", true)],
	},
	{
		users: [
			{ name: "id", type: "int4", nullable: false },
			{ name: "email", type: "text", nullable: true },
		],
	},
);

/** `label kind detail sortText` of each item. */
const run = async (ctx: Context["expect"], s = DB): Promise<string[]> =>
	(await completions(s, { expect: ctx, from: 0 })).map(
		(i) =>
			`${i.label}${i.insertText === i.label ? "" : ` (${i.insertText})`} ${i.kind} ${JSON.stringify(i.detail)} ${i.sortText}`,
	);

test("relations: the ones the statement uses (in the same namespace) sort before the rest", async () => {
	expect(
		await run({
			kind: "relation",
			schema: null,
			ctes: [{ name: "recent", columns: null }],
			used: [rel("posts"), rel("users", "auth")],
		}),
	).toEqual([
		'recent cte "WITH query" 00000',
		'users table "table" 20000',
		'posts table "table" 10001',
		'active view "view" 20002',
		'auth namespace "schema" 30000',
	]);
	// `public.` is the top level: unqualified names count, other namespaces do not
	expect(
		await run({
			kind: "relation",
			schema: "public",
			ctes: [],
			used: [rel("users"), rel("posts", "public"), rel("active", "auth")],
		}),
	).toEqual([
		'users table "table" 10000',
		'posts table "table" 10001',
		'active view "view" 20002',
	]);
	expect(
		await run({
			kind: "relation",
			schema: "auth",
			ctes: [],
			used: [rel("sessions"), rel("audit", "auth")],
		}),
	).toEqual(['sessions table "table" 20000', 'audit view "view" 10001']);
});

test("at most 1000 items", async () => {
	const many = schema({
		public: Array.from({ length: 1005 }, (_, i) => rel(`t${i}`)),
	});
	const items = await run(
		{ kind: "relation", schema: "public", ctes: [], used: [] },
		many,
	);
	expect(items.length).toBe(1000);
	expect(items.at(-1)).toBe('t999 table "table" 20999');
});

test("columns: of a relation with their types, of a subquery or CTE by name; then the aliases", async () => {
	const users = { schema: null, name: "users" };
	expect(
		await run({
			kind: "column",
			sources: [{ name: "u", rel: users, columns: null }],
			aliases: [],
		}),
	).toEqual([
		'id column "int4" 00000000',
		'email column "text | null" 00000001',
	]);
	expect(
		await run({
			kind: "column",
			sources: [{ name: "c", rel: null, columns: ["a", "b"] }],
			aliases: [],
		}),
	).toEqual(['a column "" 00000000', 'b column "" 00000001']);
	// several sources: each column says where it comes from
	expect(
		await run({
			kind: "column",
			sources: [
				{ name: "c", rel: null, columns: ["a"] },
				{ name: "u", rel: users, columns: null },
				{ name: "s", rel: { schema: "auth", name: "nope" }, columns: null },
				{ name: "f", rel: null, columns: null },
			],
			aliases: ["c", "u", "s", "f", "ghost"],
		}),
	).toEqual([
		'a column "c.a" 00000000',
		'id column "u.id: int4" 00010000',
		'email column "u.email: text | null" 00010001',
		'c alias "" 90000',
		'u alias "users" 90001',
		's alias "auth.nope" 90002',
		'f alias "" 90003',
		'ghost alias "" 90004',
	]);
});

test("nothing where no name is expected", async () => {
	expect(await run({ kind: "none" })).toEqual([]);
});

/** A union of string literals in core's keyword list (from Postgres's kwlist.h). */
const keywords = (type: string): string[] => {
	const src = readFileSync(
		resolve(import.meta.dirname, "../../../core/src/engine/parser/keywords.ts"),
		"utf8",
	);
	const body = new RegExp(`export type ${type} =([^;]*);`).exec(src)?.[1];
	return [...(body ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
};

test("quoteIdent: reserved and type_func_name keywords are quoted, other keywords are not", () => {
	const reserved = [
		...keywords("ReservedKeyword"),
		...keywords("TypeFuncNameKeyword"),
	];
	expect(reserved.length).toBeGreaterThan(90);
	for (const w of reserved) expect(quoteIdent(w)).toBe(`"${w}"`);
	const colName = keywords("ColNameKeyword");
	expect(colName.length).toBeGreaterThan(50);
	for (const w of colName) expect(quoteIdent(w)).toBe(w);
});

test("quoteIdent: names Postgres would fold or misread are quoted", () => {
	expect(
		["users", "_x$1", "userAccounts", "Users", "1a", "a-b", 'a"b', ""].map(
			quoteIdent,
		),
	).toEqual([
		"users",
		"_x$1",
		'"userAccounts"',
		'"Users"',
		'"1a"',
		'"a-b"',
		'"a""b"',
		'""',
	]);
});

test("editorKinds: each kind must be a number", () => {
	const all = {
		CallExpression: 1,
		PropertyAccessExpression: 2,
		StringLiteral: 3,
		NoSubstitutionTemplateLiteral: 4,
		TemplateExpression: 5,
	};
	expect(editorKinds(all)).toEqual(all);
	expect(() => editorKinds({ ...all, StringLiteral: "3" })).toThrow(
		"typesql: SyntaxKind.StringLiteral is missing",
	);
	const { TemplateExpression: _, ...missing } = all;
	expect(() => editorKinds(missing)).toThrow(
		"typesql: SyntaxKind.TemplateExpression is missing",
	);
});
