import type { Executor, ExecutorResult } from "../query.js";
import { createMigrationContext } from "./context.js";
import {
	isMigration,
	MIGRATION_FROM,
	type Migration,
	type SCHEMA,
	type SchemaOf,
} from "./define.js";
import { fingerprint, isFingerprint, sha256 } from "./fingerprint.js";

type Dialect = "postgres" | "sqlite";
// `down` takes what `up` returns, so only `any` accepts every migration.
// biome-ignore lint/suspicious/noExplicitAny: see above.
type AnyMigration = Migration<never, any>;
type Migrations = readonly AnyMigration[];

/** The schema after the last migration of an array. */
type LastSchema<M extends Migrations> = M extends readonly []
	? {}
	: M extends readonly [...unknown[], infer Last]
		? SchemaOf<Last>
		: unknown;

/**
 * An array type without an order, such as `const all = [m1, m2]`, has no
 * last migration: it is an error unless the schema is given.
 */
type Ordered<M extends Migrations> = number extends M["length"]
	? Unordered
	: unknown;
type Unordered =
	"typesql: this migrations array's type has no order, so its last schema is unknown; write the array in the call, declare it with `as const`, or give the schema: createMigrator<DB>()";

declare const UNSET: unique symbol;
/** The default of a schema type argument that isn't given. */
type Unset = typeof UNSET;

/**
 * A config without a `migrations` array. The last overload's errors are the
 * ones TypeScript shows, so an unordered array's error is here.
 */
type DirectoryConfig = Omit<MigratorConfig, "migrations"> & {
	readonly migrations?: Unordered;
};

export interface MigratorConfig {
	readonly dialect: Dialect;
	/** A PostgreSQL connection URL; the migrator connects with `pg`. */
	readonly url?: string | undefined;
	/** A SQLite database file; the migrator opens it with `node:sqlite`. */
	readonly db?: string | undefined;
	/** Your own connection, used for every call and never closed. */
	readonly execute?: Executor | undefined;
	/** A directory of migration files, run in filename order. */
	readonly migrationsDir?: string | undefined;
	/** The migrations themselves, in order. */
	readonly migrations?:
		| readonly AnyMigration[]
		// A tuple context keeps TypeScript from comparing every pair of a
		// long inline array's migrations.
		| readonly [AnyMigration, ...AnyMigration[]]
		| undefined;
	/** The history table (default: schema_migrations). */
	readonly migrationTable?: string | undefined;
	/** Directory mode: where `generate()` writes the schema (default: db.ts). */
	readonly schemaFile?: string | undefined;
	/** Directory mode: write the schema file after `up`, `down` and `latest` (default: true). */
	readonly generate?: boolean | undefined;
	/** Run each migration in a transaction and lock the history (default: true). */
	readonly transaction?: boolean | undefined;
}

/** What writing the schema file after a command did: its path, or why it failed. */
interface SchemaWrite {
	readonly schemaFile?: string;
	/** The database is migrated; only the schema file was not written. */
	readonly schemaError?: Error;
}

export interface UpResult extends SchemaWrite {
	readonly applied: readonly string[];
}

/**
 * The result of `latest()`. `SchemaOf<typeof result>` is the schema after
 * the last migration.
 */
export interface LatestResult<Schema = unknown> extends UpResult {
	/** Type-only: there is no such property at runtime. */
	readonly [SCHEMA]: Schema;
}

export interface DownResult extends SchemaWrite {
	readonly reverted: readonly string[];
}

/**
 * A migration failed and was rolled back. `applied` lists the migrations the
 * same call applied before it; with migrationsDir, the schema file was
 * written for them, as after a command that succeeds.
 */
export class MigrationError extends Error {
	override readonly name = "MigrationError";
	/** The migration that failed: its file name, or its position in the array. */
	readonly migration: string;
	readonly applied: readonly string[];
	readonly schemaFile?: string;
	readonly schemaError?: Error;
	constructor(
		message: string,
		options: {
			readonly cause: unknown;
			readonly migration: string;
			readonly applied: readonly string[];
		} & SchemaWrite,
	) {
		super(message, { cause: options.cause });
		this.migration = options.migration;
		this.applied = options.applied;
		if (options.schemaFile !== undefined) this.schemaFile = options.schemaFile;
		if (options.schemaError !== undefined)
			this.schemaError = options.schemaError;
	}
}

export interface MigrationStatus {
	readonly name: string;
	readonly applied: boolean;
	readonly appliedAt: Date | null;
}

/**
 * Runs migrations. `Schema` is the schema after the last one: inferred
 * from an array, or given as `createMigrator<DB>()`. `SchemaOf<typeof
 * migrator>` is that schema too.
 */
export interface Migrator<Schema = unknown> {
	/** Type-only: there is no such property at runtime. */
	readonly [SCHEMA]: Schema;
	readonly config: MigratorConfig;
	/** Apply every pending migration. */
	latest(): Promise<LatestResult<Schema>>;
	/** Apply the next pending migration. */
	up(): Promise<UpResult>;
	/** Revert the last applied migration. */
	down(): Promise<DownResult>;
	/** List applied and pending migrations. */
	status(): Promise<MigrationStatus[]>;
	/** Directory mode: create a migration file and return its path. */
	make(name: string): Promise<string>;
	/** Directory mode: write the schema of the last migration and return the file's path. */
	generate(): Promise<string>;
	/** A new migrator with some config replaced. */
	with<const M extends Migrations>(
		overrides: Partial<Omit<MigratorConfig, "migrations">> & {
			readonly migrations: M & Ordered<M>;
		},
	): Migrator<LastSchema<M>>;
	with<NewSchema = Unset>(
		overrides: [NewSchema] extends [Unset]
			? Partial<DirectoryConfig>
			: Partial<MigratorConfig>,
	): Migrator<[NewSchema] extends [Unset] ? Schema : NewSchema>;
}

const MIGRATOR: unique symbol = Symbol.for("typesql.migrator") as never;

/** Whether `value` is a migrator from any copy of `@typesql/core`. */
export function isMigrator(value: unknown): value is Migrator {
	return (
		value !== null &&
		typeof value === "object" &&
		(value as { [MIGRATOR]?: unknown })[MIGRATOR] === true
	);
}

/** A loaded migration, from the array or a file. */
interface Entry {
	readonly name: string;
	readonly up: (db: never) => unknown;
	readonly down: (db: never) => unknown;
	/** What it starts from, when it was defined with migration(). */
	readonly from: unknown;
	/** What a later migration's `from` is when it follows this one. */
	readonly self: unknown;
}

interface Row {
	readonly name: string;
	readonly hash: string;
	readonly at: unknown;
}

const CONNECTIONS = ["url", "db", "execute"] as const;
const SOURCES = ["migrationsDir", "migrations"] as const;

/**
 * Bundlers for Workers follow a literal import() into `node:` modules; the
 * Node-only parts load only when a directory, `url`, `db` or `generate()`
 * needs them.
 */
const nodeOnly = <T>(path: string): Promise<T> =>
	import(new URL(path, import.meta.url).href) as Promise<T>;
type Files = typeof import("./files.js");
type Connect = typeof import("./connect.js");
type Generate = typeof import("./generate.js");

function validate(config: MigratorConfig): void {
	if (config.dialect !== "postgres" && config.dialect !== "sqlite")
		throw new Error(
			`typesql: unsupported migration dialect: ${String(config.dialect)} (expected postgres or sqlite)`,
		);
	const sources = SOURCES.filter((key) => config[key] !== undefined);
	if (sources.length !== 1)
		throw new Error(
			sources.length === 0
				? "typesql: set migrationsDir (a directory of migration files) or migrations (an array of migrations)"
				: "typesql: set migrationsDir or migrations, not both",
		);
	if (config.migrations !== undefined && !Array.isArray(config.migrations))
		throw new Error("typesql: migrations must be an array of migrations");
	const connections = CONNECTIONS.filter((key) => config[key] !== undefined);
	if (connections.length > 1)
		throw new Error(
			`typesql: set one of url, db and execute, not ${connections.join(" and ")}`,
		);
	if (config.url !== undefined && config.dialect !== "postgres")
		throw new Error("typesql: url connects to PostgreSQL; use db for SQLite");
	if (config.db !== undefined && config.dialect !== "sqlite")
		throw new Error("typesql: db opens a SQLite file; use url for PostgreSQL");
	for (const key of [
		"url",
		"db",
		"migrationsDir",
		"migrationTable",
		"schemaFile",
	] as const) {
		const value = config[key];
		if (value !== undefined && (typeof value !== "string" || value === ""))
			throw new Error(`typesql: ${key} must be a non-empty string`);
	}
	if (config.execute !== undefined && typeof config.execute !== "function")
		throw new Error("typesql: execute must be a function");
	for (const key of ["generate", "transaction"] as const) {
		const value = config[key];
		if (value !== undefined && typeof value !== "boolean")
			throw new Error(`typesql: ${key} must be a boolean`);
	}
}

/** Create a migrator. It connects only when a method needs the database. */
export function createMigrator<const M extends Migrations>(
	config: Omit<MigratorConfig, "migrations"> & {
		readonly migrations: M & Ordered<M>;
	},
): Migrator<LastSchema<M>>;
export function createMigrator<Schema = Unset>(
	config: [Schema] extends [Unset] ? DirectoryConfig : MigratorConfig,
): Migrator<[Schema] extends [Unset] ? unknown : Schema>;
export function createMigrator(
	input: MigratorConfig | DirectoryConfig,
): Migrator {
	const config = input as MigratorConfig;
	validate(config);
	const settled: MigratorConfig = Object.freeze({ ...config });
	const directory = (what: string): string => {
		if (settled.migrationsDir === undefined)
			throw new Error(
				`typesql: ${what} works with migrationsDir; with migrations, the schema is SchemaOf<typeof last>`,
			);
		return settled.migrationsDir;
	};
	const writeSchema = async (point: number | "last"): Promise<string> => {
		const dir = directory("generate()");
		const { writeSchema } = await nodeOnly<Generate>("./generate.js");
		return writeSchema({
			migrationsDir: dir,
			dialect: settled.dialect,
			schemaFile: settled.schemaFile ?? "db.ts",
			point,
		});
	};
	const afterCommand = async (applied: number): Promise<SchemaWrite> => {
		if (settled.migrationsDir === undefined || settled.generate === false)
			return {};
		try {
			return { schemaFile: await writeSchema(applied) };
		} catch (error) {
			return {
				schemaError: error instanceof Error ? error : new Error(String(error)),
			};
		}
	};
	const command = async (
		kind: "latest" | "up" | "down",
	): Promise<{ names: string[] } & SchemaWrite> => {
		try {
			const { names, applied } = await run(settled, kind);
			return { names, ...(await afterCommand(applied)) };
		} catch (error) {
			if (!(error instanceof Failed)) throw error;
			throw new MigrationError(error.message, {
				cause: error.cause,
				migration: error.migration,
				applied: error.names,
				...(error.names.length > 0 ? await afterCommand(error.applied) : {}),
			});
		}
	};
	const migrator: Omit<Migrator, typeof SCHEMA> = {
		config: settled,
		async latest() {
			const { names, ...write } = await command("latest");
			return { applied: names, ...write } as UpResult as LatestResult;
		},
		async up() {
			const { names, ...write } = await command("up");
			return { applied: names, ...write };
		},
		async down() {
			const { names, ...write } = await command("down");
			return { reverted: names, ...write };
		},
		async status() {
			return (await run(settled, "status")).status;
		},
		async make(name) {
			const dir = directory("make()");
			const { makeMigration } = await nodeOnly<Files>("./files.js");
			return makeMigration(dir, name, settled.dialect);
		},
		generate: () => writeSchema("last"),
		// The schema type follows the overrides; the runtime is the same.
		with: ((overrides: Partial<MigratorConfig>) => {
			const next: Record<string, unknown> = { ...settled };
			const given = Object.entries(overrides).filter(
				([, value]) => value !== undefined,
			);
			for (const group of [CONNECTIONS, SOURCES] as const)
				if (given.some(([key]) => (group as readonly string[]).includes(key)))
					for (const key of group) delete next[key];
			for (const [key, value] of given) next[key] = value;
			return createMigrator<unknown>(next as unknown as MigratorConfig);
		}) as Migrator["with"],
	};
	Object.defineProperty(migrator, MIGRATOR, { value: true });
	return Object.freeze(migrator) as Migrator;
}

async function load(config: MigratorConfig): Promise<Entry[]> {
	if (config.migrationsDir !== undefined) {
		const { loadMigrations } = await nodeOnly<Files>("./files.js");
		return loadMigrations(config.migrationsDir);
	}
	return (config.migrations ?? []).map((migration, index): Entry => {
		const name = label(index);
		if (!isMigration(migration))
			throw new Error(
				`typesql: migrations[${index}] is not a migration; define it with migration()`,
			);
		return {
			name,
			up: migration.up,
			down: migration.down,
			from: (migration as { [MIGRATION_FROM]?: unknown })[MIGRATION_FROM],
			self: migration,
		};
	});
}

/** An array migration's history name: its position, zero-padded. */
const label = (index: number): string => String(index + 1).padStart(4, "0");

const describe = (entries: readonly Entry[], index: number): string =>
	`migration ${index + 1} (${entries[index]?.name ?? "missing"})`;

/** Each migration must start where the one before it ends. */
function checkChain(dialect: Dialect, entries: readonly Entry[]): void {
	entries.forEach((entry, index) => {
		const { from } = entry;
		if (from === undefined) return;
		const previous = entries[index - 1];
		if (typeof from === "string") {
			if (previous !== undefined)
				throw new Error(
					`typesql: ${describe(entries, index)} starts from ${JSON.stringify(from)}, but it follows ${describe(entries, index - 1)}; start it from that migration`,
				);
			if (from !== dialect)
				throw new Error(
					`typesql: ${describe(entries, index)} starts from ${JSON.stringify(from)}, but the migrator's dialect is ${dialect}`,
				);
			return;
		}
		if (previous === undefined)
			throw new Error(
				`typesql: ${describe(entries, index)} starts from another migration, but it is the first one; start it from ${JSON.stringify(dialect)}`,
			);
		// A later migration may also start from a 3.x migration's up.
		if (from === previous.self || from === previous.up) return;
		const found = entries.findIndex(
			(other) => other.self === from || other.up === from,
		);
		throw new Error(
			found < 0
				? `typesql: ${describe(entries, index)} starts from a migration that isn't in the list; start it from ${describe(entries, index - 1)}, the one before it`
				: `typesql: ${describe(entries, index)} starts from ${describe(entries, found)}, not from ${describe(entries, index - 1)}, the one before it; check the order of the migrations`,
		);
	});
}

function identifier(name: string): string {
	if (name.includes("\0"))
		throw new Error("typesql: the migration table name must not contain NUL");
	return `"${name.replaceAll('"', '""')}"`;
}

async function rows(
	execute: Executor,
	text: string,
	values: readonly unknown[] = [],
): Promise<readonly unknown[]> {
	const result = await execute(text, values);
	return Array.isArray(result) ? result : (result as ExecutorResult).rows;
}

function readHistory(records: readonly unknown[]): Row[] {
	return records.map((record) => {
		if (
			typeof record !== "object" ||
			record === null ||
			!("name" in record) ||
			typeof record.name !== "string" ||
			!("hash" in record) ||
			typeof record.hash !== "string"
		)
			throw new Error(
				"typesql: invalid migration history: expected string name and hash columns",
			);
		return {
			name: record.name,
			hash: record.hash,
			at: "at" in record ? record.at : null,
		};
	});
}

function appliedAt(value: unknown): Date | null {
	if (value instanceof Date) return value;
	if (typeof value !== "string") return null;
	// SQLite's text is UTC: 2026-11-01 12:00:00.000.
	const date = new Date(
		/^\d{4}-\d\d-\d\d \d/.test(value) ? `${value.replace(" ", "T")}Z` : value,
	);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** The applied rows must be the first migrations, by position and fingerprint. */
function checkHistory(
	history: readonly Row[],
	entries: readonly Entry[],
	fingerprints: readonly string[],
	directoryMode: boolean,
): void {
	history.forEach((row, index) => {
		if (!isFingerprint(row.hash))
			throw new Error(
				directoryMode
					? `typesql: applied migration ${index + 1} (${row.name}) has a 3.x source hash, and no migration file is named ${row.name}`
					: `typesql: the history was written by TypeSQL 3.x; run a command once with migrationsDir to convert it, then switch to migrations`,
			);
		const entry = entries[index];
		if (entry === undefined)
			throw new Error(
				`typesql: applied migration ${index + 1} (${row.name}) is missing: there are only ${entries.length} migrations`,
			);
		if (row.hash !== fingerprints[index])
			throw new Error(
				`typesql: applied migration ${index + 1} (${row.name}) ${row.name === entry.name ? "has changed" : `does not match ${describe(entries, index)}`}: it was edited, or a migration was inserted, removed or reordered before it`,
			);
	});
}

type Command = "latest" | "up" | "down" | "status";

/** A migration failed; createMigrator adds the schema file to it. */
class Failed extends Error {
	readonly migration: string;
	/** What the call applied or reverted before it, and how many are applied. */
	readonly names: string[];
	readonly applied: number;
	constructor(
		message: string,
		cause: unknown,
		migration: string,
		names: string[],
		applied: number,
	) {
		super(message, { cause });
		this.migration = migration;
		this.names = names;
		this.applied = applied;
	}
}

// pg rejects a refused `localhost` connection (IPv4 and IPv6) with an
// AggregateError whose own message is empty.
const text = (error: unknown): string => {
	if (!(error instanceof Error)) return String(error);
	const message = error.message
		? error.message
		: error instanceof AggregateError && error.errors.length > 0
			? [...new Set(error.errors.map(text))].join("; ")
			: ((error as { code?: string }).code ?? error.name);
	return message.replace(/^typesql: /, "");
};

/** The history table on one connection, and the transactions around it. */
async function openHistory(
	execute: Executor,
	dialect: Dialect,
	tableName: string,
	transaction: boolean,
) {
	const postgres = dialect === "postgres";
	let table = identifier(tableName);
	let lock: string | undefined;
	if (postgres) {
		const [location] = await rows(
			execute,
			"SELECT current_schema() AS schema, current_database() AS database, current_setting('max_identifier_length')::integer AS max_identifier_length",
		);
		if (
			typeof location !== "object" ||
			location === null ||
			!("schema" in location) ||
			typeof location.schema !== "string" ||
			!("database" in location) ||
			typeof location.database !== "string" ||
			!("max_identifier_length" in location) ||
			typeof location.max_identifier_length !== "number"
		)
			throw new Error(
				"typesql: cannot determine the PostgreSQL migration schema",
			);
		if (
			new TextEncoder().encode(tableName).length >
			location.max_identifier_length
		)
			throw new Error(
				`typesql: the migration table name exceeds PostgreSQL's ${location.max_identifier_length}-byte identifier limit`,
			);
		table = `${identifier(location.schema)}.${table}`;
		if (transaction) {
			const digest = await sha256(
				JSON.stringify([location.database, location.schema, tableName]),
			);
			lock = new DataView(digest).getBigInt64(0).toString();
			await execute("SELECT pg_advisory_lock($1::bigint)", [lock]);
		}
	}
	const control = (statement: string) => async () => {
		if (transaction) await execute(statement, []);
	};
	return {
		begin: control(postgres ? "BEGIN" : "BEGIN IMMEDIATE"),
		commit: control("COMMIT"),
		rollback: control("ROLLBACK"),
		async unlock() {
			if (lock !== undefined)
				await execute("SELECT pg_advisory_unlock($1::bigint)", [lock]);
		},
		/** Create the table if needed, and read it in the order it was applied. */
		async read(): Promise<Row[]> {
			await execute(
				`CREATE TABLE IF NOT EXISTS ${table} (name TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at ${postgres ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
				[],
			);
			return readHistory(
				await rows(
					execute,
					postgres
						? `SELECT name, hash, to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM ${table} ORDER BY applied_at, name`
						: `SELECT name, hash, applied_at AS at FROM ${table} ORDER BY applied_at, name`,
				),
			);
		},
		/** Record a migration, after every earlier one (applied_at strictly increases). */
		async insert(name: string, hash: string): Promise<void> {
			await execute(
				postgres
					? `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, $2, greatest(clock_timestamp(), max(applied_at) + interval '1 microsecond') FROM ${table}`
					: `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, $2, CASE WHEN max(applied_at) IS NULL OR strftime('%Y-%m-%d %H:%M:%f', 'now') > max(applied_at) THEN strftime('%Y-%m-%d %H:%M:%f', 'now') ELSE strftime('%Y-%m-%d %H:%M:%f', max(applied_at), '+0.001 seconds') END FROM ${table}`,
				[name, hash],
			);
		},
		async remove(name: string): Promise<void> {
			await execute(`DELETE FROM ${table} WHERE name = $1`, [name]);
		},
		async rehash(name: string, hash: string): Promise<void> {
			await execute(`UPDATE ${table} SET hash = $1 WHERE name = $2`, [
				hash,
				name,
			]);
		},
	};
}

/**
 * 3.x stored source hashes. Trust that the files are the ones 3.x last
 * checked, and store their fingerprints instead. Returns whether any row
 * changed.
 */
async function convertHistory(
	history: Awaited<ReturnType<typeof openHistory>>,
	rows: readonly Row[],
	entries: readonly Entry[],
	fingerprints: readonly string[],
): Promise<boolean> {
	let converted = false;
	for (const row of rows) {
		if (isFingerprint(row.hash)) continue;
		const index = entries.findIndex((entry) => entry.name === row.name);
		const hash = fingerprints[index];
		if (hash === undefined) continue;
		await history.rehash(row.name, hash);
		converted = true;
	}
	return converted;
}

async function run(
	config: MigratorConfig,
	command: Command,
): Promise<{ names: string[]; applied: number; status: MigrationStatus[] }> {
	const { dialect } = config;
	const entries = await load(config);
	// Dry runs come first: one that fails stops the command before anything
	// touches the database.
	const fingerprints: string[] = [];
	for (const [index, entry] of entries.entries())
		fingerprints.push(
			await fingerprint(dialect, entry.up, `${index + 1} (${entry.name})`),
		);
	checkChain(dialect, entries);

	const directoryMode = config.migrationsDir !== undefined;
	const connection = await connect(config);
	const names: string[] = [];
	let applied = 0;
	let status: MigrationStatus[] = [];
	try {
		const history = await openHistory(
			connection.execute,
			dialect,
			config.migrationTable ?? "schema_migrations",
			config.transaction ?? true,
		);
		try {
			for (;;) {
				// The migration this iteration runs, once it is known.
				let current: { name: string; label: string } | undefined;
				await history.begin();
				try {
					// SQLite reads the history only after taking its write lock.
					let rows = await history.read();
					// Nothing else to do keeps the history unchanged, unless it
					// was converted.
					const converted =
						directoryMode &&
						(await convertHistory(history, rows, entries, fingerprints));
					if (converted) rows = await history.read();
					checkHistory(rows, entries, fingerprints, directoryMode);
					applied = rows.length;
					const index = command === "down" ? rows.length - 1 : rows.length;
					const entry = entries[index];
					if (command === "status" || entry === undefined) {
						status = entries.map((entry, index) => {
							const row = rows[index];
							return {
								name: row?.name ?? entry.name,
								applied: row !== undefined,
								appliedAt: row === undefined ? null : appliedAt(row.at),
							};
						});
						await (converted ? history.commit() : history.rollback());
						break;
					}
					const name = rows[index]?.name ?? entry.name;
					current = {
						name,
						label: `${command === "down" ? "reverting " : ""}migration ${index + 1} (${name})`,
					};
					await runStep(
						dialect,
						connection.execute,
						command === "down" ? entry.down : entry.up,
					);
					if (command === "down") await history.remove(name);
					else await history.insert(name, fingerprints[index] ?? "");
					await history.commit();
					names.push(name);
					applied += command === "down" ? -1 : 1;
				} catch (error) {
					let failure = error;
					let message = text(error);
					try {
						await history.rollback();
					} catch (rollbackError) {
						// A lost connection fails the rollback with the same error.
						if (rollbackError !== error) {
							failure = new AggregateError(
								[error, rollbackError],
								"typesql: the migration failed and rolling it back failed too",
							);
							message += `; rolling it back failed too: ${text(rollbackError)}`;
						}
					}
					if (current === undefined) throw failure;
					throw new Failed(
						`typesql: ${current.label} failed: ${message}`,
						failure,
						current.name,
						names,
						applied,
					);
				}
				if (command !== "latest") break;
			}
		} finally {
			await history.unlock();
		}
	} finally {
		await connection.close();
	}
	return { names, applied, status };
}

async function connect(
	config: MigratorConfig,
): Promise<{ execute: Executor; close(): Promise<void> }> {
	if (config.execute !== undefined)
		return { execute: config.execute, close: async () => {} };
	if (config.url !== undefined) {
		const { connectPostgres } = await nodeOnly<Connect>("./connect.js");
		return connectPostgres(config.url);
	}
	if (config.db !== undefined) {
		const { connectSqlite } = await nodeOnly<Connect>("./connect.js");
		return connectSqlite(config.db);
	}
	throw new Error(
		config.dialect === "postgres"
			? "typesql: set url (or execute) to run PostgreSQL migrations"
			: "typesql: set db (or execute) to run SQLite migrations",
	);
}

/** Run one `up` or `down` on a guarded connection inside the runner's transaction. */
async function runStep(
	dialect: Dialect,
	execute: Executor,
	step: (db: never) => unknown,
): Promise<void> {
	let active = true;
	const check = (sql: string): void => {
		if (!active)
			throw new Error(
				"typesql: a migration's db cannot execute after its migration has finished",
			);
		assertMigrationSql(sql, dialect);
	};
	const count = execute.count;
	const guarded: Executor = Object.assign(
		async (sql: string, values: readonly unknown[]) => {
			check(sql);
			return execute(sql, values);
		},
		count === undefined
			? {}
			: {
					count: async (sql: string, values: readonly unknown[]) => {
						check(sql);
						return count(sql, values);
					},
				},
	);
	try {
		// A prepared SQLite statement runs only the first statement of a
		// script (node:sqlite, bun:sqlite, D1), so the runner sends each one.
		await step(
			createMigrationContext(
				dialect,
				guarded,
				dialect === "sqlite"
					? async (_kind, script) => {
							for (const statement of sqliteStatements(script))
								await guarded(statement, []);
						}
					: undefined,
			) as never,
		);
	} finally {
		active = false;
	}
}

/**
 * The statements of a SQLite script, split at semicolons outside quotes,
 * comments and a trigger's BEGIN … END body.
 */
function sqliteStatements(sql: string): string[] {
	const statements: string[] = [];
	const words: string[] = [];
	let begin = 0;
	let content = false;
	let trigger = false;
	let start = true;
	for (let i = 0; i < sql.length; ) {
		const char = sql.charAt(i);
		if (/\s/.test(char)) {
			i++;
			continue;
		}
		if (sql.startsWith("--", i)) {
			const end = /[\r\n]/.exec(sql.slice(i + 2));
			i = end === null ? sql.length : i + 2 + end.index + 1;
			continue;
		}
		if (sql.startsWith("/*", i)) {
			const end = sql.indexOf("*/", i + 2);
			i = end < 0 ? sql.length : end + 2;
			continue;
		}
		if (char === "'" || char === '"' || char === "`" || char === "[") {
			content = true;
			const end = char === "[" ? "]" : char;
			i++;
			while (i < sql.length) {
				if (sql[i] === end) {
					if (sql[i + 1] === end && char !== "[") i += 2;
					else {
						i++;
						break;
					}
				} else i++;
			}
			start = false;
			continue;
		}
		if (char === ";") {
			i++;
			start = true;
			// A trigger's body statements end in semicolons too.
			if (trigger) continue;
			if (content) statements.push(sql.slice(begin, i));
			begin = i;
			words.length = 0;
			content = false;
			continue;
		}
		content = true;
		const word = /^[a-zA-Z_][a-zA-Z_0-9$]*/.exec(sql.slice(i))?.[0];
		if (word) {
			const upper = word.toUpperCase();
			if (trigger && start && upper === "END") trigger = false;
			if (words.length < 4) words.push(upper);
			if (
				upper === "TRIGGER" &&
				/^CREATE (?:TEMP |TEMPORARY )?TRIGGER$/.test(words.join(" "))
			)
				trigger = true;
			start = false;
			i += word.length;
			continue;
		}
		start = false;
		i++;
	}
	if (content) statements.push(sql.slice(begin));
	return statements;
}

/** Keep transaction ownership with the runner, including multi-statement raw SQL. */
function assertMigrationSql(sql: string, dialect: Dialect): void {
	const words: string[] = [];
	const checkRollback = (): void => {
		if (
			words[0] === "ROLLBACK" &&
			words[1] !== "TO" &&
			!(
				(words[1] === "WORK" || words[1] === "TRANSACTION") &&
				words[2] === "TO"
			)
		)
			throw new Error(
				"typesql: migrations cannot roll back their enclosing transaction; use ROLLBACK TO a savepoint",
			);
	};
	let trigger = false;
	let start = true;
	for (let i = 0; i < sql.length; ) {
		const char = sql.charAt(i);
		if (/\s/.test(char)) {
			i++;
			continue;
		}
		if (sql.startsWith("--", i)) {
			const end = /[\r\n]/.exec(sql.slice(i + 2));
			i = end === null ? sql.length : i + 2 + end.index + 1;
			continue;
		}
		if (sql.startsWith("/*", i)) {
			let depth = 1;
			i += 2;
			while (i < sql.length && depth > 0) {
				if (sql.startsWith("/*", i) && dialect === "postgres") {
					depth++;
					i += 2;
				} else if (sql.startsWith("*/", i)) {
					depth--;
					i += 2;
				} else i++;
			}
			continue;
		}
		if (
			char === "'" ||
			char === '"' ||
			(dialect === "sqlite" && (char === "`" || char === "["))
		) {
			const end = char === "[" ? "]" : char;
			const escapes =
				dialect === "postgres" &&
				char === "'" &&
				/[eE]/.test(sql[i - 1] ?? "") &&
				!/[\w$]/.test(sql[i - 2] ?? "");
			i++;
			while (i < sql.length) {
				if (escapes && sql[i] === "\\") i += 2;
				else if (sql[i] === end) {
					if (sql[i + 1] === end && char !== "[") i += 2;
					else {
						i++;
						break;
					}
				} else i++;
			}
			if (words.length < 4) words.push("");
			start = false;
			continue;
		}
		if (char === "$" && dialect === "postgres") {
			const tag = /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/.exec(sql.slice(i))?.[0];
			if (tag) {
				const end = sql.indexOf(tag, i + tag.length);
				i = end < 0 ? sql.length : end + tag.length;
				if (words.length < 4) words.push("");
				start = false;
				continue;
			}
		}
		if (char === ";") {
			checkRollback();
			words.length = 0;
			start = true;
			i++;
			continue;
		}
		const word = /^[a-zA-Z_][a-zA-Z_0-9$]*/.exec(sql.slice(i))?.[0];
		if (word) {
			const upper = word.toUpperCase();
			if (trigger && start && upper === "END") trigger = false;
			else if (
				!trigger &&
				start &&
				/^(BEGIN|START|COMMIT|END|ABORT)$/.test(upper)
			)
				throw new Error(
					"typesql: migrations cannot control transactions; each migration runs in its own transaction",
				);
			if (words.length < 4) words.push(upper);
			if (
				words.length === 2 &&
				words[0] === "PREPARE" &&
				upper === "TRANSACTION"
			)
				throw new Error("typesql: migrations cannot prepare transactions");
			if (
				dialect === "sqlite" &&
				upper === "TRIGGER" &&
				(words.join(" ") === "CREATE TRIGGER" ||
					words.join(" ") === "CREATE TEMP TRIGGER" ||
					words.join(" ") === "CREATE TEMPORARY TRIGGER")
			)
				trigger = true;
			start = false;
			i += word.length;
			continue;
		}
		if (words.length < 4) words.push("");
		start = false;
		i++;
	}
	checkRollback();
}
