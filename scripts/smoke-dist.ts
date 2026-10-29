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
	/^Usage: typesql migrate <up\|down\|latest\|make name>/,
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

// Exercise the published migration entry point against an actual SQLite database.
{
	const migration = (await dist(
		"core/dist/migration/index.js",
	)) as typeof import("../packages/core/src/migration/index.ts");
	const {
		mkdirSync,
		mkdtempSync,
		readFileSync,
		renameSync,
		rmSync,
		writeFileSync,
	} = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = mkdtempSync(join(tmpdir(), "typesql-migrations-"));
	const migrationsDir = join(dir, "migrations");
	writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
	mkdirSync(migrationsDir);
	const migrationDb = new DatabaseSync(":memory:");
	const options = {
		dialect: "sqlite" as const,
		migrationsDir,
		migrationTable: 'tracked"migrations',
		execute: Object.assign(
			async (text: string, values: readonly unknown[]) => {
				const query = positional(text, values);
				return migrationDb
					.prepare(query.text)
					.all(...(query.values as import("node:sqlite").SQLInputValue[]));
			},
			{
				count: async (text: string, values: readonly unknown[]) => {
					const query = positional(text, values);
					return Number(
						migrationDb
							.prepare(query.text)
							.run(...(query.values as import("node:sqlite").SQLInputValue[]))
							.changes,
					);
				},
			},
		),
	};
	const history = () =>
		migrationDb
			.prepare('SELECT name FROM "tracked""migrations" ORDER BY name')
			.all()
			.map((row) => row.name);
	const first = `import type { SqliteMigration } from '@typesql/core/migration';
export async function up(db: SqliteMigration) {
  const next = await db.add('CREATE TABLE accounts (id INTEGER PRIMARY KEY, email TEXT NOT NULL, note TEXT)');
  const inserted = await next('INSERT INTO accounts (email, note) VALUES ($1, $2)', 'a@b.c', null).executeCount();
  if (inserted !== 1) throw new Error('Migration executor lost its count callback');
  await next.raw('SAVEPOINT nested');
  await next('INSERT INTO accounts (email) VALUES ($1)', 'rolled-back').execute();
  await next.raw('ROLLBACK TRANSACTION TO SAVEPOINT nested');
  await next.raw('RELEASE SAVEPOINT nested');
  return next;
}
export async function down(db: SqliteMigration) { return db.add('DROP TABLE accounts'); }
`;
	const second = `export async function up(db: unknown) { return db; }
export async function down() {}
`;
	try {
		assert.deepEqual((await migration.migrateDown(options)).migrations, []);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = ?")
				.get(options.migrationTable),
			undefined,
			"an empty command does not create its tracking table",
		);
		writeFileSync(
			join(migrationsDir, "alpha.ts"),
			"export async function up() {}",
		);
		await assert.rejects(migration.migrateUp(options), /up and down/);
		writeFileSync(join(migrationsDir, "alpha.ts"), first);
		writeFileSync(join(migrationsDir, "beta.ts"), second);
		assert.deepEqual((await migration.migrateUp(options)).migrations, [
			"alpha.ts",
		]);
		assert.equal(
			migrationDb.prepare("SELECT count(*) AS n FROM accounts").get()?.n,
			1,
		);
		assert.deepEqual(history(), ["alpha.ts"]);

		writeFileSync(
			join(migrationsDir, "alpha.ts"),
			first.replace("a@b.c", "changed"),
		);
		await assert.rejects(
			migration.migrateLatest(options),
			/hash|changed|modified/i,
		);
		writeFileSync(join(migrationsDir, "alpha.ts"), first);
		renameSync(join(migrationsDir, "alpha.ts"), join(dir, "missing.ts"));
		await assert.rejects(migration.migrateLatest(options), /missing/i);
		renameSync(join(dir, "missing.ts"), join(migrationsDir, "alpha.ts"));
		writeFileSync(join(migrationsDir, "000_earlier.ts"), second);
		await assert.rejects(migration.migrateLatest(options), /before|order/i);
		rmSync(join(migrationsDir, "000_earlier.ts"));

		// Type annotations, comments and formatting do not invalidate applied code.
		writeFileSync(
			join(migrationsDir, "alpha.ts"),
			first
				.replaceAll("db: SqliteMigration", "db: SqliteMigration<{}>")
				.replace("const next", "/* formatting */ const   next"),
		);
		writeFileSync(
			join(migrationsDir, "gamma.ts"),
			`export async function up(db) { await db.raw('CREATE TABLE rolled_back (id INTEGER)'); throw new Error('migration failure'); } export async function down() {}`,
		);
		await assert.rejects(migration.migrateLatest(options), /migration failure/);
		assert.deepEqual(history(), ["alpha.ts", "beta.ts"]);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = 'rolled_back'")
				.get(),
			undefined,
		);
		writeFileSync(
			join(migrationsDir, "gamma.ts"),
			`export async function up(db) { return db.raw('CREATE TABLE escaped_transaction (id INTEGER); /* end */ COMMIT'); } export async function down() {}`,
		);
		await assert.rejects(migration.migrateLatest(options), /transaction/i);
		assert.equal(
			migrationDb
				.prepare(
					"SELECT name FROM sqlite_master WHERE name = 'escaped_transaction'",
				)
				.get(),
			undefined,
		);
		assert.deepEqual(history(), ["alpha.ts", "beta.ts"]);
		writeFileSync(
			join(migrationsDir, "gamma.ts"),
			`export async function up(db) { await db('CREATE TABLE escaped_count (id INTEGER); COMMIT').executeCount(); return db; } export async function down() {}`,
		);
		await assert.rejects(migration.migrateLatest(options), /transaction/i);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = 'escaped_count'")
				.get(),
			undefined,
		);
		assert.deepEqual(history(), ["alpha.ts", "beta.ts"]);
		rmSync(join(migrationsDir, "gamma.ts"));
		assert.deepEqual((await migration.migrateLatest(options)).migrations, []);
		assert.deepEqual((await migration.migrateDown(options)).migrations, [
			"beta.ts",
		]);
		assert.deepEqual(
			history(),
			["alpha.ts"],
			"empty down removes its tracking record",
		);
		assert.deepEqual((await migration.migrateDown(options)).migrations, [
			"alpha.ts",
		]);
		assert.deepEqual((await migration.migrateDown(options)).migrations, []);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = 'accounts'")
				.get(),
			undefined,
		);

		const hash = migration.migrationHash;
		assert.equal(
			hash("export const x: number = 1; // comment"),
			hash("export const x = 1;"),
		);
		assert.notEqual(
			hash("export const x = 'a';"),
			hash('export const x = "a";'),
		);
		assert.notEqual(
			hash("export function x() { return\n1; }"),
			hash("export function x() { return 1; }"),
		);
		assert.notEqual(
			hash("export const x = /a b/;"),
			hash("export const x = /ab/;"),
		);
		assert.notEqual(
			hash("export const x = `a b`;"),
			hash("export const x = `ab`;"),
		);
		assert.equal(
			hash("/** @returns a number */ export function x() { return 1; }"),
			hash("export function x() { return 1; }"),
		);
		assert.equal(
			hash(`export const x = \`a\${1 + 2}b\`;`),
			hash(`export const x = \`a\${1+/* comment */2}b\`;`),
		);
		assert.notEqual(
			hash("export function x() { return/*\n*/1; }"),
			hash("export function x() { return 1; }"),
		);

		// Config paths are relative to the config, while explicit flags use cwd.
		const configDir = join(dir, "project");
		mkdirSync(configDir);
		const config = join(configDir, "typesql.config.ts");
		writeFileSync(
			config,
			`export default { dialect: 'sqlite', db: './app.db', migrationsDir: '../migrations', migrationTable: 'cli_migrations' } as const;`,
		);
		const run = (...args: string[]) =>
			cli("migrate", ...args, "--config", config);
		assert.match(run("up"), /applied alpha.ts/);
		assert.match(run("latest"), /applied beta.ts/);
		assert.match(run("up"), /no pending migrations/);
		assert.match(run("down"), /reverted beta.ts/);
		assert.match(run("down"), /reverted alpha.ts/);
		assert.match(run("down"), /no applied migrations/);

		const generatedDir = join(dir, "generated");
		const make = (...args: string[]) =>
			cli(
				"migrate",
				"make",
				...args,
				"--dialect",
				"sqlite",
				"--dir",
				generatedDir,
			);
		const created = make("create accounts")
			.trim()
			.replace(/^typesql migrate: created /, "");
		assert.match(created, /\d+_create-accounts\.ts$/);
		assert.match(readFileSync(created, "utf8"), /SqliteMigration/);
		const next = make("z add profile")
			.trim()
			.replace(/^typesql migrate: created /, "");
		assert.match(
			readFileSync(next, "utf8"),
			/MigrationSchema<typeof previousUp>/,
		);
		assert.match(
			readFileSync(next, "utf8"),
			/import type \{ up as previousUp \}/,
		);
		const { spawnSync, execFile } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const fail = (status: number, ...args: string[]) => {
			const result = spawnSync(process.execPath, [cliBin, "migrate", ...args], {
				encoding: "utf8",
			});
			assert.equal(result.status, status, result.stdout + result.stderr);
			return result.stderr;
		};
		assert.match(
			fail(2, "make", "--dialect", "sqlite", "--dir", generatedDir),
			/name/i,
		);
		assert.match(
			fail(
				1,
				"make",
				"../escape",
				"--dialect",
				"sqlite",
				"--dir",
				generatedDir,
			),
			/name|separator/i,
		);
		writeFileSync(join(generatedDir, "9999999999_future.ts"), second);
		assert.match(
			fail(1, "make", "earlier", "--dialect", "sqlite", "--dir", generatedDir),
			/sort|before/i,
		);

		const concurrentDir = join(dir, "concurrent");
		mkdirSync(concurrentDir);
		writeFileSync(
			join(concurrentDir, "one.ts"),
			`export async function up(db) { await new Promise(r => setTimeout(r, 50)); return db.add('CREATE TABLE once_only (id INTEGER)'); } export async function down(db) { return db.add('DROP TABLE once_only'); }`,
		);
		writeFileSync(
			join(concurrentDir, "two.ts"),
			`export async function up(db) { await db('INSERT INTO once_only VALUES (1)').execute(); return db; } export async function down() {}`,
		);
		const concurrentDb = join(dir, "concurrent.db");
		const invoke = promisify(execFile);
		const parallelArgs = [
			cliBin,
			"migrate",
			"latest",
			"--dialect",
			"sqlite",
			"--db",
			concurrentDb,
			"--dir",
			concurrentDir,
		];
		await Promise.all([
			invoke(process.execPath, parallelArgs),
			invoke(process.execPath, parallelArgs),
		]);
		const concurrent = new DatabaseSync(concurrentDb);
		try {
			assert.equal(
				concurrent.prepare("SELECT count(*) AS n FROM once_only").get()?.n,
				1,
			);
			assert.equal(
				concurrent.prepare("SELECT count(*) AS n FROM schema_migrations").get()
					?.n,
				2,
			);
		} finally {
			concurrent.close();
		}
	} finally {
		migrationDb.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

// Opt into the same built-package smoke on a disposable PostgreSQL database.
// Two sessions must serialize the whole command, including pending-file discovery.
if (process.env.TYPESQL_MIGRATION_POSTGRES_URL) {
	const migration = (await dist(
		"core/dist/migration/index.js",
	)) as typeof import("../packages/core/src/migration/index.ts");
	const { createRequire } = await import("node:module");
	const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const require = createRequire(
		new URL("../packages/core/package.json", import.meta.url),
	);
	interface PgConnection {
		connect(): Promise<void>;
		end(): Promise<void>;
		query(
			text: string,
			values?: readonly unknown[],
		): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
	}
	const { Client } = require("pg") as {
		Client: new (options: { connectionString: string }) => PgConnection;
	};
	const client = new Client({
		connectionString: process.env.TYPESQL_MIGRATION_POSTGRES_URL,
	});
	const other = new Client({
		connectionString: process.env.TYPESQL_MIGRATION_POSTGRES_URL,
	});
	const dir = mkdtempSync(join(tmpdir(), "typesql-pg-migrations-"));
	writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
	const schema = `typesql_migration_smoke_${process.pid}`;
	await client.connect();
	await other.connect();
	try {
		await client.query(`CREATE SCHEMA "${schema}"`);
		await client.query(`SET search_path TO "${schema}"`);
		await other.query(`SET search_path TO "${schema}"`);
		writeFileSync(
			join(dir, "alpha.ts"),
			`export async function up(db) { await db('SELECT pg_sleep(0.05)').execute(); return db.add('CREATE TABLE once_only (id integer PRIMARY KEY, note text)'); } export async function down(db) { return db.add('DROP TABLE once_only'); }`,
		);
		writeFileSync(
			join(dir, "beta.ts"),
			`export async function up(db) { await db('INSERT INTO once_only (id, note) VALUES ($1, $2)', 1, null).execute(); await db.raw('SAVEPOINT nested'); await db('INSERT INTO once_only (id) VALUES (2)').execute(); await db.raw('ROLLBACK WORK TO SAVEPOINT nested'); await db.raw('RELEASE SAVEPOINT nested'); return db; } export async function down(db) { await db('DELETE FROM once_only').execute(); }`,
		);
		const options = (connection: PgConnection) => ({
			dialect: "postgres" as const,
			migrationsDir: dir,
			execute: (text: string, values: readonly unknown[]) =>
				connection.query(text, values),
		});
		await assert.rejects(
			migration.migrateLatest({
				...options(client),
				migrationTable: "é".repeat(64),
			}),
			/identifier limit/,
		);
		const results = await Promise.all([
			migration.migrateLatest(options(client)),
			migration.migrateLatest(options(other)),
		]);
		assert.deepEqual(
			results.map((result) => result.migrations.length).sort(),
			[0, 2],
		);
		assert.equal(
			(await client.query("SELECT count(*)::integer AS n FROM once_only"))
				.rows[0]?.n,
			1,
		);
		assert.equal(
			(
				await client.query(
					`SELECT count(*)::integer AS n FROM "${schema}".schema_migrations`,
				)
			).rows[0]?.n,
			2,
		);
		writeFileSync(
			join(dir, "gamma.ts"),
			`export async function up(db) { await db.raw('CREATE TABLE rolled_back (id integer)'); return db.raw('CREATE INDEX CONCURRENTLY bad_index ON once_only (id)'); } export async function down() {}`,
		);
		await assert.rejects(
			migration.migrateLatest(options(client)),
			/transaction|concurrently/i,
		);
		assert.equal(
			(await client.query("SELECT to_regclass('rolled_back') AS name")).rows[0]
				?.name,
			null,
		);
		assert.equal(
			(
				await client.query(
					"SELECT count(*)::integer AS n FROM schema_migrations",
				)
			).rows[0]?.n,
			2,
		);
		writeFileSync(
			join(dir, "gamma.ts"),
			`export async function up(db) { return db.raw('CREATE TABLE escaped_transaction (id integer); /* end */ COMMIT'); } export async function down() {}`,
		);
		await assert.rejects(
			migration.migrateLatest(options(client)),
			/transaction/i,
		);
		assert.equal(
			(await client.query("SELECT to_regclass('escaped_transaction') AS name"))
				.rows[0]?.name,
			null,
		);
		assert.equal(
			(
				await client.query(
					"SELECT count(*)::integer AS n FROM schema_migrations",
				)
			).rows[0]?.n,
			2,
		);
		rmSync(join(dir, "gamma.ts"));
		assert.deepEqual((await migration.migrateDown(options(other))).migrations, [
			"beta.ts",
		]);
		assert.deepEqual(
			(await migration.migrateDown(options(client))).migrations,
			["alpha.ts"],
		);
		assert.deepEqual(
			(await migration.migrateDown(options(client))).migrations,
			[],
		);
	} finally {
		await client
			.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			.catch(() => undefined);
		await Promise.all([client.end(), other.end()]);
		rmSync(dir, { recursive: true, force: true });
	}
}

console.log("dist smoke test: ok");
