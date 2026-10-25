import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
	type CacheFile,
	type Entry,
	type Group,
	parseCache,
} from "../../src/cache/format.js";
import { generate, Session } from "../../src/cache/job.js";
import { engineVersion } from "../../src/cache/mapper.js";
import { SCHEMA, type TempProject, tempProject, tsconfig } from "./project.js";

let p: TempProject;
const STATEMENTS = `import { migrations, type RowOf, type DefaultTypeMap } from "@typesql/core";
import { sql, type DB } from "./db.js";
export const a = sql("SELECT id, email FROM users WHERE id = $1", 1);
export const b = sql("SELECT title FROM posts WHERE author_id = :author", { author: 1 });
export const c = sql(\`SELECT u.name FROM users u WHERE u.id = \${sql.param(2)}\`);
export type R = RowOf<DB, DefaultTypeMap, "SELECT count(*) AS n FROM posts">;
export const m = migrations<DB>().add("CREATE TABLE tags (id int4 PRIMARY KEY)").add("ALTER TABLE tags ADD COLUMN label text");
`;
beforeAll(() => {
	p = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": SCHEMA,
		"src/statements.ts": STATEMENTS,
		"src/generated/queries.typesqlcache": "{}\n",
	});
});
afterAll(() => p.remove());

const pass = () =>
	generate({
		configFile: join(p.dir, "tsconfig.json"),
		cacheFile: join(p.dir, "src/generated/queries.typesqlcache"),
		engine: engineVersion(),
		isCorePath: (f) => f.startsWith(join(p.corePackage, "dist")),
	});

test("a pass computes what changed and keeps the rest", async () => {
	const first = await pass();
	expect(first.statements).toBe(6);
	expect(first.computed).toBeGreaterThanOrEqual(9);
	expect(first.reused).toBe(0);
	expect(first.written).toBe(true);
	const file = parseCache(
		readFileSync(join(p.dir, "src/generated/queries.typesqlcache"), "utf8"),
	)!;
	expect(Object.keys(file.ddl).sort()).toEqual([
		"ALTER TABLE tags ADD COLUMN label text",
		"CREATE TABLE tags (id int4 PRIMARY KEY)",
	]);

	// nothing changed: nothing computed, the file is not rewritten
	const second = await pass();
	expect(second.computed).toBe(0);
	expect(second.reused).toBe(first.computed);
	expect(second.written).toBe(false);

	// users changes: the statements over users are computed again, the others kept
	p.write(
		"src/db.ts",
		SCHEMA.replace('email: Col<"text">', 'email: Nullable<"text">'),
	);
	const third = await pass();
	expect(third.computed).toBeGreaterThan(0);
	expect(third.computed).toBeLessThan(first.computed);
	const after = parseCache(
		readFileSync(join(p.dir, "src/generated/queries.typesqlcache"), "utf8"),
	)!;
	const entries = Object.values(after.groups).flatMap((g) =>
		Object.entries(g.entries),
	);
	const a = entries.find(
		([k]) => k === "SELECT id, email FROM users WHERE id = $1",
	)![1];
	expect(a.c![0]!.q).toContain("email: string | null");
}, 120_000);

test("generate() closes its TypeScript session, also when the pass fails (here: another CacheVersion)", async () => {
	const children = () =>
		process.getActiveResourcesInfo().filter((r) => r === "ProcessWrap").length;
	const settled = async (n: number) => {
		for (let i = 0; i < 100 && children() !== n; i++)
			await new Promise((r) => setTimeout(r, 50));
		return children();
	};
	const before = children();
	await pass();
	expect(await settled(before)).toBe(before);
	const cache = readFileSync(
		join(p.dir, "src/generated/queries.typesqlcache"),
		"utf8",
	);
	await expect(
		generate({
			configFile: join(p.dir, "tsconfig.json"),
			cacheFile: join(p.dir, "src/generated/queries.typesqlcache"),
			engine: "0",
			isCorePath: (f) => f.startsWith(join(p.corePackage, "dist")),
		}),
	).rejects.toThrow(
		new Error(
			`typesql: the project's @typesql/core has CacheVersion "${engineVersion()}", this job 0`,
		),
	);
	expect(await settled(before)).toBe(before);
	expect(
		readFileSync(join(p.dir, "src/generated/queries.typesqlcache"), "utf8"),
	).toBe(cache);
}, 120_000);

test("an enum change in $types computes the entries that read it again", async () => {
	const schema = `import { createSql, type Col, type Enum } from "@typesql/core";
export interface DB {
  $types: { mood: "happy" | "sad" };
  people: { id: Col<"int4">; mood: Enum<"mood"> };
}
export const sql = createSql<DB>();
`;
	const q = "SELECT mood FROM people WHERE id = $1";
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": schema,
		"src/q.ts": `import { sql } from "./db.js";\nexport const q = sql("${q}", 1);\n`,
		"src/generated/queries.typesqlcache": "{}\n",
	});
	try {
		const run = () =>
			generate({
				configFile: join(e.dir, "tsconfig.json"),
				cacheFile: join(e.dir, "src/generated/queries.typesqlcache"),
				engine: engineVersion(),
				isCorePath: (f) => f.startsWith(join(e.corePackage, "dist")),
			});
		const rowOf = () => {
			const file = parseCache(
				readFileSync(join(e.dir, "src/generated/queries.typesqlcache"), "utf8"),
			)!;
			return Object.values(file.groups)
				.flatMap((g) => Object.entries(g.entries))
				.find(([k]) => k === q)![1].c![0]!.q;
		};
		expect((await run()).computed).toBeGreaterThan(0);
		expect(rowOf()).toContain('mood: "happy" | "sad";');
		expect((await run()).computed).toBe(0);
		e.write(
			"src/db.ts",
			schema.replace('"happy" | "sad"', '"happy" | "sad" | "meh"'),
		);
		expect((await run()).computed).toBeGreaterThan(0);
		expect(rowOf()).toContain('mood: "happy" | "meh" | "sad";');
	} finally {
		e.remove();
	}
}, 120_000);

test("calls through a TransactionalSql (an adapter's client and its tx) get entries", async () => {
	const db = `import type { Col, DefaultTypeMap } from "@typesql/core";
import { createTransactionalSql, type SqlDriver } from "@typesql/core/adapter";
export interface DB { users: { id: Col<"int4">; email: Col<"text"> } }
declare const driver: SqlDriver<object>;
export const sql = createTransactionalSql<DB, DefaultTypeMap, object>({}, driver);
`;
	const calls = `import { sql } from "./db.js";
export const a = sql("SELECT email FROM users WHERE id = $1", 1);
export const b = sql.transaction(async (tx) => tx("SELECT id FROM users WHERE email = $1", "x"));
`;
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": db,
		"src/calls.ts": calls,
		"src/generated/queries.typesqlcache": "{}\n",
	});
	try {
		const r = await generate({
			configFile: join(e.dir, "tsconfig.json"),
			cacheFile: join(e.dir, "src/generated/queries.typesqlcache"),
			engine: engineVersion(),
			isCorePath: (f) => f.startsWith(join(e.corePackage, "dist")),
		});
		expect(r.statements).toBe(2);
		const file = parseCache(
			readFileSync(join(e.dir, "src/generated/queries.typesqlcache"), "utf8"),
		)!;
		const keys = Object.values(file.groups)
			.flatMap((g) => Object.keys(g.entries))
			.sort();
		expect(keys).toEqual([
			"SELECT email FROM users WHERE id = $1",
			"SELECT id FROM users WHERE email = $1",
		]);
	} finally {
		e.remove();
	}
}, 120_000);

test("a project's own alias of a core type and SQL-looking type arguments get entries; an unknown function's analysis does not", async () => {
	const db = `${SCHEMA}import type { DefaultTypeMap, RowOf } from "@typesql/core";
export type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
`;
	const statements = `import { sql, type Row } from "./db.js";
export type A = Row<"SELECT name FROM users">;
export type B = Row<string>;
export type L = Promise<"SELECT title FROM posts">;
export const c = sql("SELECT id FROM users");
export const d = sql("SELECT nofunc(id) FROM users");
export const e = sql('SELECT 1 AS "function f does not exist"');
export type D = Row<"SELECT ${"(".repeat(100)}1${")".repeat(100)}">;
`;
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": db,
		"src/statements.ts": statements,
		"src/generated/queries.typesqlcache": "{}\n",
	});
	try {
		const r = await generate({
			configFile: join(e.dir, "tsconfig.json"),
			cacheFile: join(e.dir, "src/generated/queries.typesqlcache"),
			engine: engineVersion(),
			isCorePath: (f) => f.startsWith(join(e.corePackage, "dist")),
		});
		expect(r.statements).toBe(6);
		expect(r.computed).toBe(7);
		const file = parseCache(
			readFileSync(join(e.dir, "src/generated/queries.typesqlcache"), "utf8"),
		)!;
		const entries = Object.fromEntries(
			Object.values(file.groups).flatMap((g) => Object.entries(g.entries)),
		);
		// the statement nested too deep to evaluate (TS5115) gets no entry
		expect(Object.keys(entries).sort()).toEqual([
			'SELECT 1 AS "function f does not exist"',
			"SELECT id FROM users",
			"SELECT name FROM users",
			"SELECT nofunc(id) FROM users",
			"SELECT title FROM posts",
		]);
		expect(entries['SELECT 1 AS "function f does not exist"']!.a).toContain(
			"function f does not exist",
		);
		expect(entries["SELECT name FROM users"]!.a).toContain("name");
		expect(entries["SELECT title FROM posts"]!.a).toContain("title");
		expect(entries["SELECT nofunc(id) FROM users"]!.a).toBeUndefined();
		expect(entries["SELECT id FROM users"]!.a).toBeDefined();
	} finally {
		e.remove();
	}
}, 120_000);

test("a dependency that cannot be written out is left out, not a failed pass", async () => {
	// a catalog function whose type is a function over a project type: no snapshot can be written
	const db = `${SCHEMA}import type { Sig } from "@typesql/core";
export interface Raw { s: string }
declare module "@typesql/core" {
  interface FunctionCatalog { my_len: Sig<["text"], "int4"> & ((raw: Raw) => void) }
}
`;
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": db,
		"src/q.ts": `import { sql } from "./db.js";\nexport const q = sql("SELECT my_len(email) AS n FROM users");\n`,
		"src/generated/queries.typesqlcache": "{}\n",
	});
	try {
		const r = await generate({
			configFile: join(e.dir, "tsconfig.json"),
			cacheFile: join(e.dir, "src/generated/queries.typesqlcache"),
			engine: engineVersion(),
			isCorePath: (f) => f.startsWith(join(e.corePackage, "dist")),
		});
		expect(r.statements).toBe(1);
		expect(r.written).toBe(true);
		// the entry would depend on my_len, which no snapshot can describe: it gets none
		const file = parseCache(
			readFileSync(join(e.dir, "src/generated/queries.typesqlcache"), "utf8"),
		)!;
		expect(
			Object.values(file.groups).flatMap((g) => Object.keys(g.entries)),
		).toEqual([]);
	} finally {
		e.remove();
	}
}, 120_000);

test("one session: a file marked changed is read again", async () => {
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": SCHEMA,
		"src/q.ts": `import { sql } from "./db.js";\nexport const q = sql("SELECT email FROM users");\n`,
		"src/generated/queries.typesqlcache": "{}\n",
	});
	const session = new Session({
		configFile: join(e.dir, "tsconfig.json"),
		cacheFile: join(e.dir, "src/generated/queries.typesqlcache"),
		engine: engineVersion(),
		isCorePath: (f) => f.startsWith(join(e.corePackage, "dist")),
	});
	try {
		expect((await session.pass()).computed).toBeGreaterThan(0);
		e.write(
			"src/db.ts",
			SCHEMA.replace('email: Col<"text">', 'email: Nullable<"text">'),
		);
		session.markChanged([join(e.dir, "src/db.ts")]);
		expect((await session.pass()).computed).toBeGreaterThan(0);
		expect((await session.pass()).computed).toBe(0);
		// a change nobody marks is seen once the session is closed and opens again
		e.write("src/db.ts", SCHEMA);
		expect((await session.pass()).computed).toBe(0);
		await session.close();
		expect((await session.pass()).computed).toBeGreaterThan(0);
	} finally {
		await session.dispose();
		e.remove();
	}
}, 120_000);

test("a project that does not load", async () => {
	const e = tempProject({ "src/generated/queries.typesqlcache": "{}\n" });
	try {
		await expect(
			generate({
				configFile: join(e.dir, "tsconfig.json"),
				cacheFile: join(e.dir, "src/generated/queries.typesqlcache"),
				engine: engineVersion(),
				isCorePath: () => false,
			}),
		).rejects.toThrow(
			new Error(
				`typesql: project ${join(e.dir, "tsconfig.json")} did not load`,
			),
		);
	} finally {
		e.remove();
	}
}, 120_000);

test("a cache file outside the project's directories", async () => {
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": SCHEMA,
		"other/queries.typesqlcache": "{}\n",
	});
	try {
		await expect(
			generate({
				configFile: join(e.dir, "tsconfig.json"),
				cacheFile: join(e.dir, "other/queries.typesqlcache"),
				engine: engineVersion(),
				isCorePath: (f) => f.startsWith(join(e.corePackage, "dist")),
			}),
		).rejects.toThrow(
			new Error(
				"typesql: other/queries.typesqlcache is not in a directory the project includes .ts files from",
			),
		);
	} finally {
		e.remove();
	}
}, 120_000);

// ───────────── what a pass computes, keeps, skips and drops ─────────────

const CACHE = "src/generated/queries.typesqlcache";
/** The job on a temporary project: one pass (`run`), and the cache file read back. */
const jobOn = (e: TempProject, log?: (m: string) => void) => {
	const options = {
		configFile: join(e.dir, "tsconfig.json"),
		cacheFile: join(e.dir, CACHE),
		engine: engineVersion(),
		isCorePath: (f: string) => f.startsWith(join(e.corePackage, "dist")),
		...(log ? { log } : {}),
	};
	return {
		options,
		run: () => generate(options),
		file: () => parseCache(e.read(CACHE))!,
	};
};
const entriesOf = (file: CacheFile): Record<string, Entry> =>
	Object.fromEntries(
		Object.values(file.groups).flatMap((g) => Object.entries(g.entries)),
	);
const groupWith = (file: CacheFile, key: string): Group =>
	Object.values(file.groups).find((g) => key in g.entries)!;
const MISSING4 = ["__T.Missing", "__T.Missing", "__T.Missing", "__T.Missing"];

const VARIANTS_DB = `import { createSql, type Col, type DefaultTypeMap, type Generated, type Nullable, type PgCatalog, type Sig } from "@typesql/core";
export interface DB {
  $functions: { initials: Sig<["text"], "text"> };
  users: { id: Generated<"int4">; email: Col<"text">; name: Nullable<"text"> };
  posts: { id: Generated<"int8">; author_id: Col<"int4">; title: Col<"text"> };
}
export const sql = createSql<DB>();
export const camel = createSql<DB>(undefined, { rowKeys: "camelCase" });
export const big = createSql<DB, Omit<DefaultTypeMap, "int8"> & { int8: bigint }>();
export const cat = createSql<DB & PgCatalog>();
declare module "@typesql/core" {
  interface FunctionCatalog { abs: Sig<["anynumeric"], "$1"> }
}
`;
const VARIANTS_Q = `import type { DefaultTypeMap, RowOf } from "@typesql/core";
import { big, camel, cat, sql, type DB } from "./db.js";
export const a1 = sql("SELECT id, author_id FROM posts WHERE id = $1", 1);
export const a2 = camel("SELECT id, author_id FROM posts WHERE id = $1", 1);
export const a3 = big("SELECT id, author_id FROM posts WHERE id = $1", 1);
export const a4 = sql("SELECT id, author_id FROM posts WHERE id = $1", 2);
export const b = sql("SELECT u.email FROM users u WHERE u.id = :id", { id: 1 });
export type B = RowOf<DB, DefaultTypeMap, "SELECT u.email FROM users u WHERE u.id = :id">;
export const c = sql("SELECT nmae FROM users");
export const d = sql("SELECT initials(email) AS i, abs(id) AS a, count(*) AS n FROM users GROUP BY email, id");
export const e = cat("SELECT tablename FROM pg_tables");
const where = sql.fragment("WHERE p.author_id = $1", 7);
export const f = sql("SELECT p.title FROM posts p {where}", { where });
export type G = RowOf<DB, DefaultTypeMap, "SELECT name FROM users">;
`;
// statements whose DB, type map or slot object the probe cannot name: no entries
const SKIPPED = `import { createSql, type Col, type DefaultTypeMap, type RowOf } from "@typesql/core";
import { sql, type DB } from "./db.js";
interface Items { items: { id: Col<"int4"> } }
interface Tags { tags: { id: Col<"int4"> } }
export const n1 = createSql<Items & Tags>()("SELECT id FROM items");
export type N2 = RowOf<Items & Tags, DefaultTypeMap, "SELECT id FROM tags">;
interface Extra { mytype: string }
export const t1 = createSql<DB, DefaultTypeMap & Extra>()("SELECT 1 AS one");
export interface Raw { s: string }
export const t2 = createSql<DB, DefaultTypeMap & { custom: (r: Raw) => void }>()("SELECT 2 AS two");
const where = sql.fragment("WHERE u.id = $1", 7);
interface WhereSlot { where: typeof where }
interface OtherSlot { other: typeof where }
const slots: WhereSlot & OtherSlot = { where, other: where };
export const s1 = sql("SELECT u.id FROM users u {where}", slots);
interface Helper { x: number }
const helper: Helper = { x: 1 };
export const s2 = sql("SELECT u.name FROM users u {where}", { where, helper });
`;

test("entries, their variants and dependencies; statements that get none; what the next passes keep", async () => {
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": VARIANTS_DB,
		"src/q.ts": VARIANTS_Q,
		"src/skipped.ts": SKIPPED,
		// a declaration file's statements are not the project's own
		"src/types.d.ts": `import type { DefaultTypeMap, RowOf } from "@typesql/core";\nimport type { DB } from "./db.js";\nexport type H = RowOf<DB, DefaultTypeMap, "SELECT id FROM users">;\n`,
		// a DB the probe cannot name (not exported): written out one level
		"src/local.ts": `import { createSql, type Col } from "@typesql/core";\ninterface LocalDB { items: { id: Col<"int4">; label: Col<"text"> }; tags: { id: Col<"int4"> } }\nexport const local = createSql<LocalDB>()("SELECT label FROM items");\n`,
		[CACHE]: "{}\n",
	});
	const logs: string[] = [];
	const job = jobOn(e, (m) => logs.push(m));
	try {
		const first = await job.run();
		expect(first).toMatchObject({
			statements: 18,
			computed: 17,
			reused: 0,
			dropped: 0,
			written: true,
		});
		expect(first.ms).toBeGreaterThan(0);
		expect(first.ms).toBeLessThan(120_000);
		expect(logs).toEqual([
			expect.stringMatching(
				/^pass: 18 statements, 17 computed, 0 kept, 0 dropped, written, \d+ ms$/,
			),
		]);
		const file = job.file();
		const es = entriesOf(file);
		expect(Object.keys(es).sort()).toEqual([
			"SELECT id, author_id FROM posts WHERE id = $1",
			"SELECT initials(email) AS i, abs(id) AS a, count(*) AS n FROM users GROUP BY email, id",
			"SELECT label FROM items",
			"SELECT name FROM users",
			"SELECT nmae FROM users",
			"SELECT p.title FROM posts p WHERE p.author_id = $1",
			"SELECT tablename FROM pg_tables",
			"SELECT u.email FROM users u WHERE u.id = $1",
			"SELECT u.email FROM users u WHERE u.id = :id",
		]);
		// DB, DB & PgCatalog, LocalDB; the default type map and the one with bigint
		expect(Object.keys(file.groups)).toHaveLength(3);
		const int8 = (m: string) => /"int8": (\w+)/.exec(file.maps[m]!)![1];
		expect(Object.keys(file.maps).map(int8).sort()).toEqual([
			"bigint",
			"string",
		]);

		// one text, three variants: two type maps and two rowKeys (a4 is a1 again)
		const posts = es["SELECT id, author_id FROM posts WHERE id = $1"]!;
		expect(posts.r).toEqual([
			"select",
			"id",
			"author_id",
			"from",
			"posts",
			"where",
			"*",
		]);
		expect(posts.a).toMatch(/^\{ readonly kind: "select"; readonly cols: \[/);
		const variants = () =>
			es["SELECT id, author_id FROM posts WHERE id = $1"]!.c!.map(
				(c) => `${c.k} ${int8(c.m)}: ${c.q.split(",")[0]}`,
			).sort();
		expect(variants()).toEqual([
			'"camelCase" string: __T.Query<{ authorId: number; id: string; }',
			'"preserve" bigint: __T.Query<{ author_id: number; id: bigint; }',
			'"preserve" string: __T.Query<{ author_id: number; id: string; }',
		]);

		// a call with a named parameter: its analysis is under the positional text
		const named = es["SELECT u.email FROM users u WHERE u.id = :id"]!;
		const deps = ["select", "u", "email", "from", "users", "where", "id"];
		expect(named.r).toEqual([...deps, "u.email", "u.id", "*"]);
		expect(named.t).toBe("SELECT u.email FROM users u WHERE u.id = $1");
		expect(named.c!.map((c) => c.p)).toEqual([
			"[params: { id: number | null; }]",
		]);
		expect(named.a).toContain('readonly names: ["id"]'); // RowOf B, of the text as written
		expect(es[named.t!]!.r).toEqual([...deps, "u.email", "u.id", "*"]);
		expect(es[named.t!]!.a).toContain("readonly names: []");
		expect(es[named.t!]!.c).toBeUndefined();

		// an error depends on the hints too ("!h")
		const error = es["SELECT nmae FROM users"]!;
		expect(error.r).toEqual(["select", "nmae", "from", "users", "*", "!h"]);
		expect(error.a).toMatch(/^__T\.SqlError<"column \\"nmae\\" does not exist/);
		expect(error.c![0]!.g).toMatch(/^__T\.SqlError</);

		// the fragment's text is spliced in; its words (and the encoded type "n" of its value,
		// a string literal in the slot object's type) are dependencies too
		const spliced = es["SELECT p.title FROM posts p WHERE p.author_id = $1"]!;
		expect(spliced.r).toEqual([
			"select",
			"p",
			"title",
			"from",
			"posts",
			"where",
			"author_id",
			"p.title",
			"p.author_id",
			"n",
			"*",
		]);
		expect(spliced.a).toMatch(/^\{ readonly kind: "select"; /);
		expect(spliced.c).toBeUndefined();
		const db = groupWith(file, "SELECT name FROM users");
		expect(Object.keys(db.q).sort()).toEqual([
			"p.author_id",
			"p.title",
			"u.email",
			"u.id",
		]);

		// a function of the schema, one the project declares again, and a built-in one
		expect(db.w.initials).toEqual([
			"__T.Missing",
			"__T.Missing",
			'{ readonly args: ["text"]; readonly ret: "text"; }',
			"__T.Missing",
		]);
		expect(db.w.abs).toEqual([
			"__T.Missing",
			"__T.Missing",
			"__T.Missing",
			'{ readonly args: ["anynumeric"]; readonly ret: "$1"; }',
		]);
		expect(db.w.count).toEqual([...MISSING4.slice(0, 3), "__T.Builtin"]);
		expect(db.w.nmae).toEqual(MISSING4);
		// a pg_catalog relation, through DB & PgCatalog (which the probe names as it is)
		const catalog = groupWith(file, "SELECT tablename FROM pg_tables");
		expect(catalog.w.pg_tables![0]).toBe("__T.Missing");
		expect(catalog.w.pg_tables![1]).toMatch(/^__T\.View<\{ schemaname: /);
		expect(es["SELECT label FROM items"]!.c![0]!.q).toBe(
			'__T.Query<{ label: string; }, [], "SELECT label FROM items">',
		);

		// nothing changed: only the errors are computed again, and the file stays as it is
		logs.length = 0;
		expect(await job.run()).toMatchObject({
			statements: 18,
			computed: 2,
			reused: 16,
			dropped: 0,
			written: false,
		});
		expect(logs).toEqual([
			expect.stringMatching(
				/^pass: 18 statements, 2 computed, 16 kept, 0 dropped, unchanged, \d+ ms$/,
			),
		]);
		expect(variants()).toHaveLength(3);

		// RowOf B goes: the call keeps its entry as it is, analysis included
		e.write("src/q.ts", VARIANTS_Q.replace(/^export type B = .*\n/m, ""));
		expect(await job.run()).toMatchObject({
			statements: 17,
			computed: 2,
			reused: 15,
			written: false,
		});

		// a call of a text that so far only RowOf G had: its variant is computed, the analysis kept
		e.write(
			"src/q.ts",
			`${VARIANTS_Q}export const g2 = camel("SELECT name FROM users");\n`,
		);
		expect(await job.run()).toMatchObject({
			statements: 19,
			computed: 3,
			reused: 16,
			written: true,
		});
		const name = entriesOf(job.file())["SELECT name FROM users"]!;
		expect(name.a).toBe(es["SELECT name FROM users"]!.a);
		expect(name.c!.map((c) => [c.k, c.q])).toEqual([
			[
				'"camelCase"',
				'__T.Query<{ name: string | null; }, [], "SELECT name FROM users">',
			],
		]);
	} finally {
		e.remove();
	}
}, 120_000);

const DDL_DB = `import type { Col, Enum, Generated, Sig } from "@typesql/core";
export interface DB {
  $types: { mood: "happy" | "sad" };
  users: { id: Generated<"int4">; email: Col<"text">; mood: Enum<"mood"> };
  posts: { id: Generated<"int8">; title: Col<"text"> };
}
export interface Raw { s: string }
export interface Odd { users: { id: Col<"int4"> }; weird: { f: (r: Raw) => void } }
declare module "@typesql/core" {
  interface FunctionCatalog { my_len: Sig<["text"], "int4"> & ((raw: Raw) => void) }
}
`;
const DDL_STEPS = `import { migrations } from "@typesql/core";
import type { DB, Odd } from "./db.js";
export const m1 = migrations<DB>()
  .add("CREATE TABLE tags (id int4 PRIMARY KEY)")
  .add('CREATE TABLE odd ("__T.SqlError<" int4)')
  .add("ALTER TABLE posts ADD COLUMN body text")
  .add("ALTER TABLE nope ADD COLUMN x int4");
// the same step on the same schema: one entry
export const m2 = migrations<DB>().add("CREATE TABLE tags (id int4 PRIMARY KEY)");
// rewrites columns of any table: depends on the whole schema
export const m3 = migrations<DB>().add("DROP TYPE mood CASCADE");
// no entry: too deep to evaluate, a schema that cannot be written out, a dependency
// (my_len) that cannot be written out
export const m4 = migrations<DB>().add("CREATE VIEW v AS SELECT ${"(".repeat(100)}1${")".repeat(100)}");
export const m5 = migrations<Odd>().add("CREATE TABLE tags (id int4 PRIMARY KEY)");
export const m6 = migrations<DB>().add("CREATE TABLE lens (n int4 DEFAULT my_len('x'))");
`;

test("DDL steps: one entry per step and schema, an error or the keys set and removed; kept until what they read changes", async () => {
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": DDL_DB,
		"src/steps.ts": DDL_STEPS,
		[CACHE]: "{}\n",
	});
	const job = jobOn(e);
	try {
		expect(await job.run()).toMatchObject({
			statements: 9,
			computed: 5,
			reused: 0,
			dropped: 0,
			written: true,
		});
		const ddl = job.file().ddl;
		expect(Object.keys(ddl).sort()).toEqual([
			"ALTER TABLE nope ADD COLUMN x int4",
			"ALTER TABLE posts ADD COLUMN body text",
			'CREATE TABLE odd ("__T.SqlError<" int4)',
			"CREATE TABLE tags (id int4 PRIMARY KEY)",
			"DROP TYPE mood CASCADE",
		]);
		for (const es of Object.values(ddl)) expect(es).toHaveLength(1);
		const step = (key: string) => ddl[key]![0]!;
		const enums = '{ mood: "happy" | "sad"; }';
		expect(step("CREATE TABLE tags (id int4 PRIMARY KEY)")).toEqual({
			d: {
				t: enums,
				w: {
					...Object.fromEntries(
						["create", "id", "key", "primary", "table", "tags"].map((w) => [
							w,
							MISSING4,
						]),
					),
					int4: [...MISSING4.slice(0, 3), "__T.Builtin"], // the function int4(…)
				},
				q: {},
			},
			r: ["create", "table", "tags", "id", "int4", "primary", "key", "*"],
			s: '{ tags: { id: __T.Col<"int4">; }; }',
			x: "never",
		});
		const posts = step("ALTER TABLE posts ADD COLUMN body text");
		expect(posts.d.w.posts).toEqual([
			'{ id: __T.Generated<"int8">; title: __T.Col<"text">; }',
			"__T.Missing",
			"__T.Missing",
			"__T.Missing",
		]);
		expect(posts.s).toBe(
			'{ posts: { body: __T.Nullable<"text">; id: __T.Generated<"int8">; title: __T.Col<"text">; }; }',
		);
		expect(step("ALTER TABLE nope ADD COLUMN x int4")).toMatchObject({
			r: ["alter", "table", "nope", "add", "column", "x", "int4", "*"],
			e: '__T.SqlError<"relation \\"nope\\" does not exist", 2>',
		});
		expect(step("ALTER TABLE nope ADD COLUMN x int4").s).toBeUndefined();
		// a schema that names an error is no error
		expect(step('CREATE TABLE odd ("__T.SqlError<" int4)')).toMatchObject({
			s: '{ odd: { "__T.SqlError<": __T.Nullable<"int4">; }; }',
			x: "never",
		});
		const drop = step("DROP TYPE mood CASCADE");
		expect(drop.r).toEqual(["drop", "type", "mood", "cascade", "*", "!all"]);
		expect(drop.d.all).toBe(
			'{ "$types": { mood: "happy" | "sad"; }; "users": { id: __T.Generated<"int4">; email: __T.Col<"text">; mood: __T.Enum<"mood">; }; "posts": { id: __T.Generated<"int8">; title: __T.Col<"text">; } }',
		);
		expect(drop.s).toBe(
			'{ $types: {}; users: { email: __T.Col<"text">; id: __T.Generated<"int4">; }; }',
		);
		for (const key of Object.keys(ddl))
			if (key !== "DROP TYPE mood CASCADE")
				expect(ddl[key]![0]!.d.all).toBeUndefined();

		expect(await job.run()).toMatchObject({
			computed: 0,
			reused: 5,
			written: false,
		});

		// posts changes: the step that reads it and the one that reads everything are computed again
		e.write(
			"src/db.ts",
			DDL_DB.replace('title: Col<"text">', 'title: Col<"varchar">'),
		);
		expect(await job.run()).toMatchObject({
			computed: 2,
			reused: 3,
			written: true,
		});
		const after = job.file().ddl;
		expect(after["ALTER TABLE posts ADD COLUMN body text"]).toHaveLength(1);
		expect(
			after["ALTER TABLE posts ADD COLUMN body text"]![0]!.d.w.posts![0],
		).toBe('{ id: __T.Generated<"int8">; title: __T.Col<"varchar">; }');
		expect(after["DROP TYPE mood CASCADE"]![0]!.d.all).toContain(
			'title: __T.Col<"varchar">',
		);
		expect(after["CREATE TABLE tags (id int4 PRIMARY KEY)"]).toEqual(
			ddl["CREATE TABLE tags (id int4 PRIMARY KEY)"],
		);
	} finally {
		e.remove();
	}
}, 120_000);

/** A cache file another project (other/tsconfig.json) wrote, with `groups`, `maps` and `ddl` of its own. */
const othersFile = (
	parts: Partial<Pick<CacheFile, "groups" | "maps" | "ddl">>,
) => {
	const file = {
		typesqlcache: 1,
		engine: engineVersion(),
		groups: parts.groups ?? {},
		maps: parts.maps ?? {},
		ddl: parts.ddl ?? {},
		owners: {} as Record<string, string[]>,
	};
	for (const [g, group] of Object.entries(file.groups))
		for (const key of Object.keys(group.entries))
			file.owners[`${g}\0${key}`] = ["../../other/tsconfig.json"];
	for (const key of Object.keys(file.ddl))
		file.owners[`ddl\0${key}`] = ["../../other/tsconfig.json"];
	return `${JSON.stringify(file, null, 1)}\n`;
};
const group = (t: string, entries: Group["entries"]): Group => ({
	t,
	h: "never",
	w: { x: MISSING4 as never },
	q: {},
	entries,
});
const call = (m: string) => ({
	m,
	k: '"preserve"',
	g: "unknown",
	p: "[]",
	q: "string",
});

test("entries that do not compile in this project are dropped before writing; when that does not help, nothing is written", async () => {
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": SCHEMA,
		"src/statements.ts": STATEMENTS,
		[CACHE]: "{}\n",
	});
	const logs: string[] = [];
	const job = jobOn(e, (m) => logs.push(m));
	try {
		await job.run();
		const own = job.file();

		// a broken entry (whose key looks like a snapshot and a map line), a broken step and a
		// group whose snapshot is broken go; an entry left with nothing goes with them
		const broken = "SELECT 'type D_zz = ', 'type M_zz = '";
		e.write(
			CACHE,
			othersFile({
				groups: {
					aaaaaaaaaaaa: group("{}", {
						[broken]: { r: ["x", "*"], a: "NoSuchType" },
						"SELECT 'kept'": {
							r: ["x", "*"],
							a: '{ readonly kind: "select" }',
						},
						"SELECT 'calls'": { r: ["x", "*"], c: [call("cccccccccccc")] },
						"SELECT 'empty'": { r: ["x", "*"] },
					}),
					bbbbbbbbbbbb: group("NoSuchSnapshotType", {
						"SELECT 'in a broken group'": { r: ["x", "*"], a: "{}" },
					}),
				},
				maps: { cccccccccccc: '{ "int4": number }' },
				ddl: {
					"CREATE TABLE broken (id int4)": [
						{
							d: { t: "{}", w: {}, q: {} },
							r: ["*"],
							s: "NoSuchDdlType",
							x: "never",
						},
					],
					"CREATE TABLE fine (id int4)": [
						{ d: { t: "{}", w: {}, q: {} }, r: ["*"], s: "{}", x: "never" },
					],
				},
			}),
		);
		logs.length = 0;
		expect(await job.run()).toMatchObject({ dropped: 3, written: true });
		expect(logs).toEqual([expect.stringMatching(/ 3 dropped, written, /)]);
		const file = job.file();
		expect(Object.keys(file.groups).sort()).toEqual(
			[...Object.keys(own.groups), "aaaaaaaaaaaa"].sort(),
		);
		for (const [g, group] of Object.entries(own.groups))
			expect(file.groups[g]).toEqual(group);
		expect(file.groups.aaaaaaaaaaaa!.entries).toEqual({
			"SELECT 'kept'": { r: ["x", "*"], a: '{ readonly kind: "select" }' },
			"SELECT 'calls'": { r: ["x", "*"], c: [call("cccccccccccc")] },
		});
		expect(file.maps).toEqual({
			...own.maps,
			cccccccccccc: '{ "int4": number }',
		});
		expect(Object.keys(file.ddl).sort()).toEqual(
			[...Object.keys(own.ddl), "CREATE TABLE fine (id int4)"].sort(),
		);
		for (const [k, es] of Object.entries(own.ddl))
			expect(file.ddl[k]).toEqual(es);
		for (const id of Object.keys(own.owners))
			expect(file.owners[id]).toEqual(["../../tsconfig.json"]);
		expect(file.owners["aaaaaaaaaaaa\0SELECT 'kept'"]).toEqual([
			"../../other/tsconfig.json",
		]);
		expect(file.owners[`aaaaaaaaaaaa\0${broken}`]).toBeUndefined();
		expect(file.owners["ddl\0CREATE TABLE broken (id int4)"]).toBeUndefined();

		// an error on a line of no entry (a result text over two lines): not written
		const twoLines = othersFile({
			groups: {
				aaaaaaaaaaaa: group("{}", {
					"SELECT 'two lines'": { r: ["x", "*"], a: "{ x: 1;\n y: NoSuch }" },
				}),
			},
		});
		e.write(CACHE, twoLines);
		logs.length = 0;
		expect(await job.run()).toMatchObject({ dropped: 0, written: false });
		expect(logs[0]).toBe(
			"validation: an error outside any entry (Cannot find name 'NoSuch'.); not writing",
		);
		expect(e.read(CACHE)).toBe(twoLines);
	} finally {
		e.remove();
	}
}, 120_000);

test("a type map that does not compile here fails every round: nothing is written", async () => {
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": SCHEMA,
		"src/q.ts": `import { sql } from "./db.js";\nexport const q = sql("SELECT email FROM users");\n`,
		[CACHE]: othersFile({
			groups: {
				aaaaaaaaaaaa: group("{}", {
					"SELECT 'calls'": { r: ["x", "*"], c: [call("dddddddddddd")] },
				}),
			},
			maps: { dddddddddddd: '{ "int4": NoSuchGlobal }' },
		}),
	});
	const logs: string[] = [];
	const job = jobOn(e, (m) => logs.push(m));
	try {
		const before = e.read(CACHE);
		expect(await job.run()).toMatchObject({ written: false });
		expect(logs[0]).toBe(
			"validation: still 1 errors after dropping entries; not writing",
		);
		expect(e.read(CACHE)).toBe(before);
	} finally {
		e.remove();
	}
}, 60_000);

test("a relation the probe names as a global (a lib.*.d.ts file) is seen to change through its pairs; what cannot be written out is left out", async () => {
	const lib = (email: string) =>
		`type GlobalUsers = { id: import("@typesql/core").Col<"int4">; email: import("@typesql/core").${email}<"text"> };
type GlobalRaw = { id: import("@typesql/core").Col<"int4">; raw: (r: import("./raw.js").Raw) => void };
type GlobalDB = { $types: { mood: (r: import("./raw.js").Raw) => void }; users: GlobalUsers };
`;
	const e = tempProject({
		"tsconfig.json": tsconfig(),
		"src/lib.schema.d.ts": lib("Col"),
		"src/raw.ts": "export interface Raw { s: string }\n",
		"src/g.ts": `import { createSql, migrations } from "@typesql/core";
export const q1 = createSql<{ users: GlobalUsers }>()("SELECT users.email FROM users");
export const q2 = createSql<{ users: GlobalRaw }>()("SELECT users.raw FROM users");
export const m = migrations<GlobalDB>().add("CREATE TABLE tags (id int4)");
`,
		[CACHE]: "{}\n",
	});
	const job = jobOn(e);
	try {
		expect(await job.run()).toMatchObject({ statements: 3, written: true });
		const file = job.file();
		// q2's pair users.raw and m's $types cannot be written out: no entry
		expect(file.ddl).toEqual({});
		const es = entriesOf(file);
		expect(Object.keys(es)).toEqual(["SELECT users.email FROM users"]);
		const g = groupWith(file, "SELECT users.email FROM users");
		expect(g.w.users).toEqual(["GlobalUsers", ...MISSING4.slice(1)]);
		expect(g.q).toEqual({ "users.email": '__T.Col<"text", {}>' });
		expect(es["SELECT users.email FROM users"]!.r).toEqual([
			"select",
			"users",
			"email",
			"from",
			"users.email",
			"*",
		]);

		// q2 is computed every pass (it has no entry to keep)
		expect(await job.run()).toMatchObject({ computed: 2, reused: 2 });
		// GlobalUsers prints the same, users.email does not
		e.write("src/lib.schema.d.ts", lib("Nullable"));
		expect(await job.run()).toMatchObject({ computed: 4, reused: 0 });
		expect(
			entriesOf(job.file())["SELECT users.email FROM users"]!.c![0]!.q,
		).toContain("email: string | null");
	} finally {
		e.remove();
	}
}, 120_000);
