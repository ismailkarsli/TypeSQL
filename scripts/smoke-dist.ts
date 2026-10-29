import assert from "node:assert/strict";
import type {
	Col,
	Json,
	Postgres,
} from "../packages/core/src/postgres/index.ts";

type Core = typeof import("../packages/core/src/index.ts");
type CoreAdapter = typeof import("../packages/core/src/adapter.ts");
type CorePostgres = typeof import("../packages/core/src/postgres/index.ts");
type CoreSqlite = typeof import("../packages/core/src/sqlite/index.ts");
interface AdapterSql {
	(text: string): unknown;
	param(value: unknown): string;
	transaction<T>(
		fn: (tx: (text: string) => { execute(): Promise<T> }) => Promise<T>,
	): Promise<T>;
}
interface Adapter {
	readonly [name: string]: unknown;
	createSql(client?: unknown): AdapterSql;
}
interface Introspect {
	readonly [name: string]: unknown;
	generateSource(db: unknown): string;
}
const dist = (path: string): Promise<unknown> =>
	import(new URL(`../packages/${path}`, import.meta.url).href);

const core = (await dist("core/dist/index.js")) as Core;
const coreAdapter = (await dist("core/dist/adapter.js")) as CoreAdapter;
const corePg = (await dist("core/dist/postgres/index.js")) as CorePostgres;
const pg = (await dist("pg/dist/index.js")) as Adapter;
const pgjs = (await dist("postgres/dist/index.js")) as Adapter;
const coreSqlite = (await dist("core/dist/sqlite/index.js")) as CoreSqlite;
const sqliteAdapter = (await dist("sqlite/dist/index.js")) as Adapter;

interface DB {
	users: {
		id: Col<"int4">;
		email: Col<"text">;
		age: Col<"int4">;
		display_name: Col<"text">;
	};
	docs: { items: Json<number[]> };
}
const sql = core.createSql<DB>(corePg.postgres);
assert.deepEqual(sql("SELECT id FROM users WHERE id = $1", 7), {
	text: "SELECT id FROM users WHERE id = $1",
	values: [7],
});

const where = sql.fragment("AND age > :min", { min: 18 });
assert.deepEqual(
	sql(
		"SELECT id FROM users WHERE email = :email {where}",
		{ where },
		{ email: "a@b.c" },
	),
	{
		text: "SELECT id FROM users WHERE email = $1 AND age > $2",
		values: ["a@b.c", 18],
	},
);
assert.deepEqual(
	sql("SELECT {col} FROM users", { col: sql.id("display_name") }),
	{ text: 'SELECT "display_name" FROM users', values: [] },
);

const evil = "x'; DROP TABLE users; --";
assert.deepEqual(
	sql(
		`SELECT id FROM users WHERE email = ${sql.param(evil)} AND id > ${sql.param(3)}`,
	),
	{
		text: "SELECT id FROM users WHERE email = $1 AND id > $2",
		values: [evil, 3],
	},
);

const doc = sql(`UPDATE docs SET items = ${sql.json([1, 2])}`);
assert.equal(doc.text, "UPDATE docs SET items = $1");
assert.ok(doc.values[0] instanceof coreAdapter.JsonParam);
assert.equal(doc.values[0].toPostgres(), "[1,2]");
assert.equal(JSON.stringify(doc.values[0]), "[1,2]");

const m = corePg
	.migrations()
	.add("CREATE TABLE t (id int)")
	.add("ALTER TABLE t ADD COLUMN x text");
assert.deepEqual(
	[...m.statements],
	["CREATE TABLE t (id int)", "ALTER TABLE t ADD COLUMN x text"],
);

for (const name of [
	"createTransactionalSql",
	"runTransaction",
	"mapRows",
	"rowKeysOf",
	"camelCase",
] as const) {
	assert.equal(
		typeof coreAdapter[name],
		"function",
		`@typesql/core/adapter export ${name}`,
	);
}

for (const name of [
	"createSql",
	"Migrations",
	"NoResultError",
	"runMigrations",
] as const) {
	assert.equal(typeof core[name], "function", `@typesql/core export ${name}`);
}
assert.ok(
	!("createSql" in corePg),
	"@typesql/core/postgres exports a dialect, not createSql",
);
assert.equal(corePg.postgres.name, "postgres");
const custom = core.createSql<Postgres, DB>({ name: "custom" });
const inner = custom("SELECT id FROM users WHERE id = $1", 1);
assert.deepEqual(inner, {
	text: "SELECT id FROM users WHERE id = $1",
	values: [1],
});
assert.deepEqual(
	custom(
		"SELECT id FROM users WHERE age > $1 AND id IN ({inner})",
		{ inner },
		2,
	),
	{
		text: "SELECT id FROM users WHERE age > $1 AND id IN (SELECT id FROM users WHERE id = $2)",
		values: [2, 1],
	},
);
const tx = coreAdapter.createTransactionalSql(corePg.postgres, undefined, {
	executor: () => async () => [],
	transaction: (_client, _depth, fn) => fn(undefined),
}) as AdapterSql;
assert.deepEqual(tx(`SELECT ${tx.param(1)}`), {
	text: "SELECT $1",
	values: [1],
});
assert.equal(typeof tx.transaction, "function");

for (const adapter of [pg, pgjs]) {
	assert.deepEqual(
		adapter.createSql()(`SELECT ${adapter.createSql().param(1)}`),
		{ text: "SELECT $1", values: [1] },
	);
	for (const name of ["createSql", "executor", "migrate"]) {
		assert.equal(typeof adapter[name], "function", `adapter export ${name}`);
	}
	assert.deepEqual(adapter.createSql()("SELECT 1"), {
		text: "SELECT 1",
		values: [],
	});
	assert.equal(typeof adapter.createSql().transaction, "function");
}

assert.equal(coreSqlite.sqlite.name, "sqlite");
assert.ok(
	!("createSql" in coreSqlite),
	"@typesql/core/sqlite exports a dialect, not createSql",
);
const lite = core.createSql<{ t: { a: Col<"integer">; b: Col<"text"> } }>(
	coreSqlite.sqlite,
);
assert.deepEqual(lite.values("t", [{ a: 1, b: "x" }]), {
	text: '("a", "b") VALUES ($1, $2)',
	values: [1, "x"],
});
assert.throws(
	() => lite.values("t", [{ a: 1, b: "x" }, { a: 2 }] as never),
	/no DEFAULT in VALUES/,
);
assert.deepEqual(
	[
		...coreSqlite.migrations().add("CREATE TABLE t (id INTEGER PRIMARY KEY)")
			.statements,
	],
	["CREATE TABLE t (id INTEGER PRIMARY KEY)"],
);

const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(":memory:");
for (const name of ["createSql", "executor", "migrate"])
	assert.equal(
		typeof sqliteAdapter[name],
		"function",
		`@typesql/sqlite export ${name}`,
	);
await (sqliteAdapter.migrate as (db: unknown, m: unknown) => Promise<void>)(
	db,
	{
		statements: [
			"CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, meta TEXT)",
		],
	},
);
interface LiteQuery {
	execute(): Promise<unknown[]>;
	executeCount(): Promise<number>;
}
const lsql = sqliteAdapter.createSql(db) as unknown as {
	(text: string, ...values: unknown[]): LiteQuery;
	transaction<T>(
		fn: (tx: (text: string) => LiteQuery) => Promise<T>,
	): Promise<T>;
	json(value: unknown): string;
};
const inserted = await lsql(
	"INSERT INTO users (email, meta) VALUES ($1, $2) RETURNING id, email",
	"a@b.c",
	lsql.json({ x: [1] }),
).execute();
assert.deepEqual(
	inserted.map((r) => ({ ...(r as object) })),
	[{ id: 1, email: "a@b.c" }],
);
assert.equal(
	await lsql(
		"UPDATE users SET email = $2 WHERE id = $1",
		1,
		"z@b.c",
	).executeCount(),
	1,
);
const selected = await lsql(
	"SELECT $1 || email AS e, json_extract(meta, '$.x[0]') AS x FROM users WHERE id = $2",
	"<",
	1,
).execute();
assert.deepEqual(
	selected.map((r) => ({ ...(r as object) })),
	[{ e: "<z@b.c", x: 1 }],
);
await assert.rejects(
	lsql.transaction(async (t) => {
		await t("INSERT INTO users (email) VALUES ('rolled back')").execute();
		throw new Error("boom");
	}),
	/boom/,
);
assert.equal(
	(
		(await lsql("SELECT count(*) AS n FROM users").execute()) as {
			n: number;
		}[]
	)[0]?.n,
	1,
);
const liteIntrospect = (await dist("sqlite/dist/introspect/index.js")) as {
	introspect(db: unknown): unknown;
	generateSource(db: unknown): string;
};
assert.match(
	liteIntrospect.generateSource(liteIntrospect.introspect(db)),
	/id: Col<"integer", \{ hasDefault: true; position: 0; rowid: true \}>;/,
);
db.close();

const positional = (
	coreAdapter as unknown as {
		positional(
			text: string,
			values: readonly unknown[],
		): { text: string; values: unknown[] };
	}
).positional;
assert.deepEqual(positional("SELECT $2, '$1', \"$1\", $1 -- $3", ["a", true]), {
	text: "SELECT ?, '$1', \"$1\", ? -- $3",
	values: [1, "a"],
});
for (const name of ["kysely", "drizzle", "prisma"]) {
	const orm = (await dist(`${name}/dist/index.js`)) as {
		createSql(dialect: unknown): (text: string, ...v: unknown[]) => unknown;
	};
	assert.deepEqual(orm.createSql(coreSqlite.sqlite)("SELECT $1", 1), {
		text: "SELECT $1",
		values: [1],
	});
}

const introspect = (await dist("pg/dist/introspect/index.js")) as Introspect;
for (const name of ["introspect", "generateSource"]) {
	assert.equal(
		typeof introspect[name],
		"function",
		`@typesql/pg/introspect export ${name}`,
	);
}
const generated = introspect.generateSource({
	version: "17.0",
	schemas: ["public"],
	relations: [
		{
			schema: "public",
			name: "t",
			kind: "table",
			comment: null,
			columns: [
				{
					name: "id",
					type: "int4",
					declaredType: "integer",
					domain: null,
					nullable: false,
					hasDefault: true,
					identity: null,
					generated: null,
					default: null,
					comment: null,
				},
			],
		},
	],
	enums: [],
});
assert.match(generated, /id: Generated<"int4">;/);

const prismaGenerator = (await dist("prisma/dist/generator/api.js")) as {
	readonly [name: string]: unknown;
};
assert.deepEqual(
	Object.keys(prismaGenerator),
	["generateSource"],
	"@typesql/prisma/generator exports",
);
assert.match(
	(
		prismaGenerator.generateSource as (
			dm: unknown,
			o: { dialect: "sqlite" },
		) => string
	)(
		{
			models: [
				{
					name: "User",
					dbName: null,
					fields: [
						{
							name: "id",
							kind: "scalar",
							type: "Int",
							isList: false,
							isRequired: true,
							hasDefaultValue: true,
							default: { name: "autoincrement", args: [] },
						},
					],
				},
			],
			enums: [],
		},
		{ dialect: "sqlite" },
	),
	/from "@typesql\/core\/sqlite";[\s\S]*id: Generated<"integer">;/,
);

const { execFileSync } = await import("node:child_process");
const cliBin = new URL("../packages/cli/dist/bin.js", import.meta.url).pathname;
const cli = (...args: string[]): string =>
	execFileSync(process.execPath, [cliBin, ...args], { encoding: "utf8" });
assert.match(
	cli("--help"),
	/^Usage: typesql introspect \[--dialect postgres\|sqlite\]/,
);
assert.match(
	cli("introspect", "--dialect", "postgres", "--help"),
	/^Usage: typesql introspect \[--dialect postgres\]/,
);
assert.match(
	cli("introspect", "--dialect=sqlite", "--help"),
	/^Usage: typesql introspect --dialect sqlite/,
);
{
	const { mkdtempSync, rmSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = mkdtempSync(join(tmpdir(), "typesql-cli-"));
	try {
		const file = join(dir, "app.db");
		const lite = new DatabaseSync(file);
		lite.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
		lite.close();
		assert.match(
			cli("introspect", "--db", file),
			/name: Col<"text", \{ position: 1 \}>;/,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

console.log("dist smoke test: ok");
