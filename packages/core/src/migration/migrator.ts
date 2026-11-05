import type { Executor, ExecutorResult } from "../query.js";
import { createMigrationContext } from "./context.js";
import {
	type Dialect,
	type Entry,
	hasCode,
	isMigration,
	type Migration,
	type SCHEMA,
	type SchemaOf,
	type Step,
	toEntry,
} from "./define.js";

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
 * last migration: it is an error unless the schema is given. An array of
 * any migrations, as a `MigratorConfig` holds, has no schema to lose.
 */
type Ordered<M> = M extends readonly unknown[]
	? number extends M["length"]
		? AnyMigration extends M[number]
			? unknown
			: Unordered
		: unknown
	: unknown;
type Unordered =
	"typesql: this migrations array's type has no order, so its last schema is unknown; write the array in the call, declare it with `as const`, or give the schema: createMigrator<DB>()";

/** The schema after the migrations of a config: unknown without an ordered array. */
type ArraySchema<M> = [M] extends [Migrations]
	? AnyMigration extends M[number]
		? unknown
		: LastSchema<M>
	: unknown;

declare const UNSET: unique symbol;
/** The default of a schema type argument that isn't given. */
type Unset = typeof UNSET;

/**
 * A config whose `migrations` are inferred as `M`, or any migrations when
 * the schema is given. One signature, so a mistake in the config is
 * reported as itself.
 */
type ConfigOf<Schema, M> = Omit<MigratorConfig, "migrations"> & {
	readonly migrations?: [Schema] extends [Unset]
		? M & Ordered<M>
		: MigratorConfig["migrations"];
};

export interface MigratorConfig {
	readonly dialect: Dialect;
	/**
	 * A PostgreSQL, MySQL or MariaDB connection URL; the migrator connects
	 * with `pg` or `mysql2`.
	 */
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
 * A migration failed. `rolledBack` tells whether its transaction was rolled
 * back; `applied` lists the migrations the same call applied before it, and
 * with migrationsDir the schema file was written for them, as after a
 * command that succeeds.
 */
export class MigrationError extends Error {
	override readonly name = "MigrationError";
	/** The migration that failed: its file name, or its position in the array. */
	readonly migration: string;
	readonly applied: readonly string[];
	/**
	 * Whether the migrator rolled the whole migration back. Not with
	 * `transaction: false`, nor when its statements didn't run in its
	 * transaction (an executor on a pool) or the connection was lost, which
	 * ends the transaction on the server. On MySQL and MariaDB, which commit
	 * implicitly before and after each DDL statement, not once the migration
	 * ran a DDL statement: what ran up to its last DDL statement stays
	 * applied, and only the statements after it were rolled back.
	 */
	readonly rolledBack: boolean;
	readonly schemaFile?: string;
	readonly schemaError?: Error;
	constructor(
		message: string,
		options: {
			readonly cause: unknown;
			readonly migration: string;
			readonly applied: readonly string[];
			readonly rolledBack: boolean;
		} & SchemaWrite,
	) {
		super(message, { cause: options.cause });
		this.migration = options.migration;
		this.applied = options.applied;
		this.rolledBack = options.rolledBack;
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
	with<NewSchema = Unset, const M extends Migrations | undefined = undefined>(
		overrides: Partial<ConfigOf<NewSchema, M>>,
	): Migrator<
		[NewSchema] extends [Unset]
			? [M] extends [undefined]
				? Schema
				: ArraySchema<M>
			: NewSchema
	>;
}

const MIGRATOR: unique symbol = Symbol.for("typesql.migrator");

/** Whether `value` is a migrator from any copy of `@typesql/core`. */
export function isMigrator(value: unknown): value is Migrator {
	return (
		value !== null &&
		typeof value === "object" &&
		MIGRATOR in value &&
		value[MIGRATOR] === true
	);
}

/**
 * A migrator as it is at runtime. The type-only schema, and the types of
 * `latest()` and `with()` that follow it, come from `createMigrator`'s
 * signature.
 */
interface RuntimeMigrator
	extends Omit<Migrator, typeof SCHEMA | "latest" | "with"> {
	latest(): Promise<UpResult>;
	with(overrides: Partial<MigratorConfig>): RuntimeMigrator;
}

interface Row {
	readonly name: string;
	/** When it was applied: a Date, or a timestamp's text. */
	readonly at: Date | string | null;
}

const CONNECTIONS = ["url", "db", "execute"] as const;
const SOURCES = ["migrationsDir", "migrations"] as const;

/**
 * The Node-only parts load only when a directory, `url`, `db` or
 * `generate()` needs them. Bundlers include them: they reach Node's
 * built-ins through process.getBuiltinModule() and `pg` from node_modules at
 * runtime, so a Worker bundle has no Node imports to resolve.
 */
const loadFiles = () => import("./files.js");
const loadConnect = () => import("./connect.js");
const loadGenerate = () => import("./generate.js");

const DIALECTS: readonly Dialect[] = ["postgres", "sqlite", "mysql", "mariadb"];

/** MySQL and MariaDB run the same migrator; the dialect names the server. */
const isMySql = (dialect: Dialect): boolean =>
	dialect === "mysql" || dialect === "mariadb";

function validate(config: MigratorConfig): void {
	if (!DIALECTS.includes(config.dialect))
		throw new Error(
			`typesql: unsupported migration dialect: ${String(config.dialect)} (expected postgres, sqlite, mysql or mariadb)`,
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
	if (config.url !== undefined && config.dialect === "sqlite")
		throw new Error(
			"typesql: url connects to PostgreSQL, MySQL or MariaDB; use db for SQLite",
		);
	if (config.db !== undefined && config.dialect !== "sqlite")
		throw new Error(
			"typesql: db opens a SQLite file; use url for PostgreSQL, MySQL or MariaDB",
		);
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
export function createMigrator<
	Schema = Unset,
	const M extends Migrations | undefined = undefined,
>(
	config: ConfigOf<Schema, M>,
): Migrator<[Schema] extends [Unset] ? ArraySchema<M> : Schema>;
export function createMigrator(config: MigratorConfig): RuntimeMigrator {
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
		const { writeSchema } = await loadGenerate();
		return writeSchema({
			migrationsDir: dir,
			dialect: settled.dialect,
			schemaFile: settled.schemaFile ?? "db.ts",
			point,
		});
	};
	/** Write the schema file after a command that `changed` the history. */
	const afterCommand = async (
		applied: number,
		changed = true,
	): Promise<SchemaWrite> => {
		if (
			!changed ||
			settled.migrationsDir === undefined ||
			settled.generate === false
		)
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
				rolledBack: error.rolledBack,
				...(await afterCommand(error.applied, error.names.length > 0)),
			});
		}
	};
	const migrator: RuntimeMigrator = {
		config: settled,
		async latest() {
			const { names, ...write } = await command("latest");
			return { applied: names, ...write };
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
			const { makeMigration } = await loadFiles();
			return makeMigration(dir, name, settled.dialect);
		},
		async generate() {
			directory("generate()");
			// The DB file is written from the files' types; check first that
			// they start from this dialect and follow each other, as the
			// commands do.
			checkChain(settled.dialect, await load(settled));
			return writeSchema("last");
		},
		// The schema type follows the overrides; the runtime is the same.
		with: (overrides) => createMigrator(override(settled, overrides)),
	};
	Object.defineProperty(migrator, MIGRATOR, { value: true });
	return Object.freeze(migrator);
}

/**
 * `config` with the overrides that aren't undefined. One that sets a
 * connection replaces `url`, `db` and `execute`; one that sets a source
 * replaces `migrationsDir` and `migrations`.
 */
function override(
	config: MigratorConfig,
	overrides: Partial<MigratorConfig>,
): MigratorConfig {
	const replaces = (group: readonly (keyof MigratorConfig)[]) =>
		group.some((key) => overrides[key] !== undefined);
	let base = config;
	if (replaces(CONNECTIONS)) {
		const { url, db, execute, ...rest } = base;
		base = rest;
	}
	if (replaces(SOURCES)) {
		const { migrationsDir, migrations, ...rest } = base;
		base = rest;
	}
	return {
		...base,
		...Object.fromEntries(
			Object.entries(overrides).filter(([, value]) => value !== undefined),
		),
	};
}

async function load(config: MigratorConfig): Promise<Entry[]> {
	const entries =
		config.migrationsDir === undefined
			? (config.migrations ?? []).map((migration, index): Entry => {
					if (!isMigration(migration))
						throw new Error(
							`typesql: migrations[${index}] is not a migration; define it with migration()`,
						);
					if (migration.name === undefined)
						throw new Error(
							`typesql: migrations[${index}] has no name, which the history records it by; give it one: migration(from, { name: "create-users", up, down })`,
						);
					return toEntry(migration.name, migration);
				})
			: await (await loadFiles()).loadMigrations(config.migrationsDir);
	const seen = new Set<string>();
	for (const entry of entries) {
		if (seen.has(entry.name))
			throw new Error(
				`typesql: two migrations are named ${JSON.stringify(entry.name)}; the history records each by its name`,
			);
		seen.add(entry.name);
	}
	return entries;
}

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

function identifier(name: string, quote: '"' | "`" = '"'): string {
	if (name.includes("\0"))
		throw new Error("typesql: the migration table name must not contain NUL");
	return `${quote}${name.replaceAll(quote, quote + quote)}${quote}`;
}

/** Whether an executor returned its rows rather than a result. */
const isRowList = (
	result: readonly unknown[] | ExecutorResult,
): result is readonly unknown[] => Array.isArray(result);

async function rows(
	execute: Executor,
	text: string,
	values: readonly unknown[] = [],
): Promise<readonly unknown[]> {
	const result = await execute(text, values);
	return isRowList(result) ? result : result.rows;
}

/** The `xid` column of the first row. */
const firstXid = (records: readonly unknown[]) => {
	const [row] = records;
	return typeof row === "object" && row !== null && "xid" in row
		? row.xid
		: undefined;
};

function readHistory(records: readonly unknown[]): Row[] {
	return records.map((record) => {
		if (
			typeof record !== "object" ||
			record === null ||
			!("name" in record) ||
			typeof record.name !== "string"
		)
			throw new Error(
				"typesql: invalid migration history: expected a string name column",
			);
		const at = "at" in record ? record.at : null;
		return {
			name: record.name,
			at: at instanceof Date || typeof at === "string" ? at : null,
		};
	});
}

function appliedAt(value: Date | string | null): Date | null {
	if (value instanceof Date) return value;
	if (typeof value !== "string") return null;
	// SQLite's text is UTC: 2026-11-01 12:00:00.000.
	const date = new Date(
		/^\d{4}-\d\d-\d\d \d/.test(value) ? `${value.replace(" ", "T")}Z` : value,
	);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** The applied rows must be the first migrations, in order, by name. */
function checkHistory(
	history: readonly Row[],
	entries: readonly Entry[],
): void {
	history.forEach((row, index) => {
		if (entries[index]?.name === row.name) return;
		const later = entries.findIndex((entry) => entry.name === row.name);
		throw new Error(
			later < 0
				? `typesql: applied migration ${index + 1} (${row.name}) is not among the migrations: it was removed or renamed`
				: `typesql: ${describe(entries, index)} is not applied, but ${describe(entries, later)} after it is: a migration was added before applied ones, or the order changed`,
		);
	});
}

type Command = "latest" | "up" | "down" | "status";

/** SHA-256 of `text`, with Web Crypto (Node, Bun, Deno and Workers). */
const sha256 = (text: string): Promise<ArrayBuffer> =>
	crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));

/** PostgreSQL's in_failed_sql_transaction, from pg, postgres.js or Prisma. */
const aborted = (cause: unknown): boolean =>
	hasCode(cause, "25P02") ||
	/current transaction is aborted/.test(
		cause instanceof Error ? cause.message : String(cause),
	);

const SPLIT =
	"typesql: execute didn't keep a transaction across its calls, so migrations can't run in one: give it one dedicated connection, not a pool (Prisma, a pooled Kysely and libsql's client send each call to any connection), or set transaction: false";

/** A migration failed; createMigrator adds the schema file to it. */
class Failed extends Error {
	readonly migration: string;
	/** What the call applied or reverted before it, and how many are applied. */
	readonly names: string[];
	readonly applied: number;
	readonly rolledBack: boolean;
	constructor(
		message: string,
		cause: unknown,
		migration: string,
		names: string[],
		applied: number,
		rolledBack: boolean,
	) {
		super(message, { cause });
		this.migration = migration;
		this.names = names;
		this.applied = applied;
		this.rolledBack = rolledBack;
	}
}

// pg rejects a refused `localhost` connection (IPv4 and IPv6) with an
// AggregateError whose own message is empty.
const text = (cause: unknown): string => {
	if (!(cause instanceof Error)) return String(cause);
	const message = cause.message
		? cause.message
		: cause instanceof AggregateError && cause.errors.length > 0
			? Array.from(new Set(cause.errors.map(text))).join("; ")
			: "code" in cause && typeof cause.code === "string"
				? cause.code
				: cause.name;
	return message.replace(/^typesql: /, "");
};

/** The first row, when it is an object. */
const first = (records: readonly unknown[]): object | undefined => {
	const [row] = records;
	return typeof row === "object" && row !== null ? row : undefined;
};

/** MySQL's ER_SP_DOES_NOT_EXIST: `RELEASE SAVEPOINT` of a savepoint that isn't there. */
const noSavepoint = (cause: unknown): boolean =>
	(typeof cause === "object" &&
		cause !== null &&
		"errno" in cause &&
		cause.errno === 1305) ||
	/SAVEPOINT \S+ does not exist/i.test(
		cause instanceof Error ? cause.message : String(cause),
	);

/**
 * Why a failed migration was not rolled back: with `transaction: false`,
 * because its statements ran outside the migration's transaction (an
 * executor on a pool), or because MySQL's implicit commits around its DDL
 * statements ended the transaction before it failed.
 */
type NotRolledBack = "none" | "split" | "implicit";

/** The history table on one connection, and the transactions around it. */
async function openHistory(
	execute: Executor,
	dialect: Dialect,
	tableName: string,
	transaction: boolean,
) {
	const postgres = dialect === "postgres";
	const mysql = isMySql(dialect);
	let table = identifier(tableName);
	const createTable = (): string =>
		mysql
			? `CREATE TABLE IF NOT EXISTS ${table} (name VARCHAR(255) NOT NULL PRIMARY KEY, hash VARCHAR(64) NOT NULL, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin`
			: `CREATE TABLE IF NOT EXISTS ${table} (name TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at ${postgres ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
	let lock: string | undefined;
	/** MySQL: the connection's id, to tell whether a call reaches the same one. */
	let connectionId: unknown;
	/** MySQL: the session's autocommit before the migrator turned it off. */
	let autocommit: 0 | 1 = 1;
	/** MySQL: the session lock held for the command, released by close(). */
	let sessionLock: string | undefined;
	/**
	 * MySQL: whether this call reaches the connection the command started on.
	 * A BEGIN inside a transaction would commit it there, so the connection's
	 * id is compared instead.
	 */
	const sameConnection = async (): Promise<boolean> => {
		const row = first(await rows(execute, "SELECT CONNECTION_ID() AS id"));
		return row !== undefined && "id" in row && String(row.id) === connectionId;
	};
	if (mysql) {
		const location = first(
			await rows(
				execute,
				"SELECT DATABASE() AS db, @@autocommit AS autocommit, CONNECTION_ID() AS id",
			),
		);
		if (
			location === undefined ||
			!("db" in location) ||
			typeof location.db !== "string" ||
			!("autocommit" in location) ||
			!("id" in location)
		)
			throw new Error(
				"typesql: no database selected: put the database in the connection URL",
			);
		// MySQL and MariaDB count identifier length in characters.
		if (Array.from(tableName).length > 64)
			throw new Error(
				"typesql: the migration table name exceeds MySQL's 64-character identifier limit",
			);
		table = `${identifier(location.db, "`")}.${identifier(tableName, "`")}`;
		connectionId = String(location.id);
		autocommit = Number(location.autocommit) === 0 ? 0 : 1;
		if (transaction) {
			// A session-level named lock, released by close() or when the
			// connection ends. Lock names are limited to 64 characters. MariaDB
			// rejects a negative (infinite) timeout, so wait for up to a year.
			const digest = await sha256(JSON.stringify([location.db, tableName]));
			const name = `typesql_migrate_${Array.from(
				new Uint8Array(digest).slice(0, 20),
				(byte) => byte.toString(16).padStart(2, "0"),
			).join("")}`;
			// The lock belongs to a session: taken on a pooled connection that
			// the next call doesn't get, it would stay held. An executor that
			// changes connection is refused before taking it, and the lock is
			// given back when it still landed elsewhere.
			if (!(await sameConnection())) throw new Error(SPLIT);
			const locked = first(
				await rows(
					execute,
					"SELECT GET_LOCK($1, 31536000) AS locked, CONNECTION_ID() AS id",
					[name],
				),
			);
			if (
				locked === undefined ||
				!("locked" in locked) ||
				Number(locked.locked) !== 1
			)
				throw new Error("typesql: cannot acquire the migration lock");
			if (!("id" in locked) || String(locked.id) !== connectionId) {
				await Promise.resolve(execute("SELECT RELEASE_LOCK($1)", [name])).catch(
					() => {},
				);
				throw new Error(SPLIT);
			}
			sessionLock = name;
			// DDL commits implicitly, so the history table is created before
			// any migration's transaction. With autocommit off, the statements
			// after a migration's last DDL statement commit together with its
			// history record instead of one by one.
			try {
				await execute("SET autocommit = 0", []);
				await execute(createTable(), []);
			} catch (error) {
				await Promise.resolve(
					execute("SELECT RELEASE_LOCK($1)", [sessionLock]),
				).catch(() => {});
				throw error;
			}
		} else await execute(createTable(), []);
	}
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
		}
	}
	/** The transaction's id, on PostgreSQL. */
	let xid: unknown;
	/**
	 * MySQL: whether the transaction begin() started is still the open one.
	 * Its savepoint is dropped when the transaction ends: by a statement that
	 * reached another connection, or by the implicit commit around a DDL
	 * statement, after which (with autocommit off) the next statement
	 * started a new transaction that ROLLBACK ends. The probe recreates the
	 * savepoint, so it can be asked again.
	 */
	const sinceBegin = async (): Promise<boolean> => {
		try {
			await execute("RELEASE SAVEPOINT typesql_migration", []);
		} catch (cause) {
			if (noSavepoint(cause)) return false;
			throw cause;
		}
		await execute("SAVEPOINT typesql_migration", []);
		return true;
	};
	/**
	 * Whether this call runs in the transaction begin() started. An executor
	 * on a pool, or a client that runs each call on a connection of its own,
	 * such as libsql's, sends each statement wherever it likes.
	 */
	const inTransaction = async (): Promise<boolean> => {
		if (postgres) {
			return (
				firstXid(
					await rows(execute, "SELECT txid_current_if_assigned()::text AS xid"),
				) === xid
			);
		}
		if (mysql) return sameConnection();
		// A BEGIN fails inside a transaction. One that succeeds started a
		// transaction where there was none; end it.
		const began = await execute("BEGIN", []).then(
			() => true,
			() => false,
		);
		if (began) await Promise.resolve(execute("ROLLBACK", [])).catch(() => {});
		return !began;
	};
	return {
		async begin(): Promise<void> {
			if (!transaction) return;
			await execute(
				postgres ? "BEGIN" : mysql ? "START TRANSACTION" : "BEGIN IMMEDIATE",
				[],
			);
			try {
				// The lock ends with the transaction, so it can't stay held on
				// a pooled connection. Its void result stays in FROM: Prisma
				// can't read a void column.
				if (postgres)
					xid = firstXid(
						await rows(
							execute,
							"SELECT txid_current()::text AS xid FROM pg_advisory_xact_lock($1::bigint)",
							[lock],
						),
					);
				if (mysql) await execute("SAVEPOINT typesql_migration", []);
				if (!(await inTransaction()) || (mysql && !(await sinceBegin())))
					throw new Error(SPLIT);
			} catch (error) {
				// Leave no transaction, and with it the lock, open on the
				// caller's connection, where its later writes would be lost.
				await Promise.resolve(execute("ROLLBACK", [])).catch(() => {});
				throw error;
			}
		},
		async commit(): Promise<void> {
			if (!transaction) return;
			if (!(await inTransaction())) throw new Error(SPLIT);
			await execute("COMMIT", []);
		},
		/**
		 * Roll back after a failure, and tell whether it was rolled back: not
		 * without a transaction, or when its statements didn't run in it. On
		 * MySQL, a migration that ran a DDL statement is rolled back only
		 * after its last one: MySQL commits implicitly before and after DDL.
		 */
		async rollback(): Promise<true | NotRolledBack> {
			if (!transaction) return "none";
			const intact = await inTransaction().catch((cause: unknown) => {
				// After a failed statement PostgreSQL refuses every one but
				// ROLLBACK: the transaction is still there.
				if (postgres && aborted(cause)) return true;
				throw cause;
			});
			if (intact) {
				const whole = mysql ? await sinceBegin() : true;
				await execute("ROLLBACK", []);
				return whole ? true : "implicit";
			}
			// It may still reach the connection that holds the transaction.
			await Promise.resolve(execute("ROLLBACK", [])).catch(() => {});
			return "split";
		},
		/** Create the table if needed, and read it in the order it was applied. */
		async read(): Promise<Row[]> {
			// On MySQL the table was created before the transaction: DDL
			// would commit it.
			if (!mysql) await execute(createTable(), []);
			return readHistory(
				await rows(
					execute,
					postgres
						? `SELECT name, to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM ${table} ORDER BY applied_at, name`
						: mysql
							? `SELECT name, DATE_FORMAT(applied_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS at FROM ${table} ORDER BY applied_at, name`
							: `SELECT name, applied_at AS at FROM ${table} ORDER BY applied_at, name`,
				),
			);
		},
		/**
		 * Record a migration, after every earlier one (applied_at strictly
		 * increases). `hash` is unused; 3.x stored a hash of the file there.
		 */
		async insert(name: string): Promise<void> {
			await execute(
				postgres
					? `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, '', greatest(clock_timestamp(), max(applied_at) + interval '1 microsecond') FROM ${table}`
					: mysql
						? `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, '', GREATEST(UTC_TIMESTAMP(6), COALESCE(MAX(applied_at) + INTERVAL 1 MICROSECOND, UTC_TIMESTAMP(6))) FROM ${table}`
						: `INSERT INTO ${table} (name, hash, applied_at) SELECT $1, '', CASE WHEN max(applied_at) IS NULL OR strftime('%Y-%m-%d %H:%M:%f', 'now') > max(applied_at) THEN strftime('%Y-%m-%d %H:%M:%f', 'now') ELSE strftime('%Y-%m-%d %H:%M:%f', max(applied_at), '+0.001 seconds') END FROM ${table}`,
				[name],
			);
		},
		async remove(name: string): Promise<void> {
			await execute(`DELETE FROM ${table} WHERE name = $1`, [name]);
		},
		/** Release what the command held on the connection: MySQL's lock and autocommit. */
		async close(): Promise<void> {
			if (sessionLock === undefined) return;
			// The connection may be gone; the server then released the lock.
			try {
				await execute(`SET autocommit = ${autocommit}`, []);
			} catch {}
			try {
				await execute("SELECT RELEASE_LOCK($1)", [sessionLock]);
			} catch {}
		},
	};
}

async function run(
	config: MigratorConfig,
	command: Command,
): Promise<{ names: string[]; applied: number; status: MigrationStatus[] }> {
	const { dialect } = config;
	const entries = await load(config);
	checkChain(dialect, entries);

	const transaction = config.transaction ?? true;
	const connection = await connect(config);
	const names: string[] = [];
	let applied = 0;
	let status: MigrationStatus[] = [];
	let history: Awaited<ReturnType<typeof openHistory>> | undefined;
	try {
		history = await openHistory(
			connection.execute,
			dialect,
			config.migrationTable ?? "schema_migrations",
			transaction,
		);
		for (;;) {
			// The migration this iteration runs, once it is known.
			let current: { name: string; label: string } | undefined;
			await history.begin();
			try {
				// The history is read only after taking the lock.
				const rows = await history.read();
				checkHistory(rows, entries);
				applied = rows.length;
				const index = command === "down" ? rows.length - 1 : rows.length;
				const entry = entries[index];
				if (command === "status" || entry === undefined) {
					status = entries.map((entry, index) => {
						const row = rows[index];
						return {
							name: entry.name,
							applied: row !== undefined,
							appliedAt: row === undefined ? null : appliedAt(row.at),
						};
					});
					// Nothing to do leaves the history as it was.
					await history.rollback();
					break;
				}
				const { name } = entry;
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
				else await history.insert(name);
				await history.commit();
				names.push(name);
				applied += command === "down" ? -1 : 1;
			} catch (error) {
				let failure = error;
				let message = text(error);
				let rolledBack = false;
				try {
					const outcome = await history.rollback();
					rolledBack = outcome === true;
					if (!rolledBack && current !== undefined)
						message +=
							outcome === "implicit"
								? `; ${SERVERS[dialect]} commits implicitly before and after each DDL statement, so its statements up to its last DDL statement stay applied and only the ones after it were rolled back`
								: outcome === "split"
									? "; its statements didn't all run in the migration's transaction, so it was not rolled back and may be partly applied"
									: "; without a transaction it was not rolled back, and may be partly applied";
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
					rolledBack,
				);
			}
			if (command !== "latest") break;
		}
	} finally {
		await history?.close();
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
		const { connectPostgres, connectMysql } = await loadConnect();
		return isMySql(config.dialect)
			? connectMysql(config.url)
			: connectPostgres(config.url);
	}
	if (config.db !== undefined) {
		const { connectSqlite } = await loadConnect();
		return connectSqlite(config.db);
	}
	throw new Error(
		config.dialect === "sqlite"
			? "typesql: set db (or execute) to run SQLite migrations"
			: `typesql: set url (or execute) to run ${SERVERS[config.dialect]} migrations`,
	);
}

const SERVERS: Readonly<Record<Dialect, string>> = {
	postgres: "PostgreSQL",
	sqlite: "SQLite",
	mysql: "MySQL",
	mariadb: "MariaDB",
};

/** Run one `up` or `down` on a guarded connection inside the runner's transaction. */
async function runStep(
	dialect: Dialect,
	execute: Executor,
	step: Step,
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
			),
		);
	} finally {
		active = false;
	}
}

/**
 * Calls `on` for each token of `sql` outside whitespace and comments: an
 * uppercased word, ";", or "" for a quoted string, identifier or any other
 * character. `start` tells whether it begins a statement.
 */
function scanSql(
	sql: string,
	dialect: Dialect,
	on: (token: string, end: number, start: boolean) => void,
): void {
	const mysql = isMySql(dialect);
	let start = true;
	for (let i = 0; i < sql.length; ) {
		const char = sql.charAt(i);
		if (/\s/.test(char)) {
			i++;
			continue;
		}
		// MySQL's `--` comment needs whitespace after it (`--x` is subtraction
		// of a negative), and `#` opens one too.
		if (
			(sql.startsWith("--", i) &&
				(!mysql || i + 2 >= sql.length || /\s/.test(sql.charAt(i + 2)))) ||
			(mysql && char === "#")
		) {
			const end = /[\r\n]/.exec(sql.slice(i + 1));
			i = end === null ? sql.length : i + 1 + end.index + 1;
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
		let token = "";
		if (
			char === "'" ||
			char === '"' ||
			((dialect === "sqlite" || mysql) && char === "`") ||
			(dialect === "sqlite" && char === "[")
		) {
			const end = char === "[" ? "]" : char;
			// MySQL strings take backslash escapes; its quoted identifiers don't.
			const escapes =
				(mysql && char !== "`") ||
				(dialect === "postgres" &&
					char === "'" &&
					/[eE]/.test(sql[i - 1] ?? "") &&
					!/[\w$]/.test(sql[i - 2] ?? ""));
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
		} else if (char === ";") {
			token = ";";
			i++;
		} else {
			const rest = sql.slice(i);
			const tag =
				char === "$" && dialect === "postgres"
					? /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/.exec(rest)?.[0]
					: undefined;
			const word = /^[a-zA-Z_][a-zA-Z_0-9$]*/.exec(rest)?.[0];
			if (tag) {
				const end = sql.indexOf(tag, i + tag.length);
				i = end < 0 ? sql.length : end + tag.length;
			} else if (word) {
				token = word.toUpperCase();
				i += word.length;
			} else i++;
		}
		on(token, i, start);
		start = token === ";";
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
	scanSql(sql, "sqlite", (token, end, start) => {
		if (token === ";") {
			// A trigger's body statements end in semicolons too.
			if (trigger) return;
			if (content) statements.push(sql.slice(begin, end));
			begin = end;
			words.length = 0;
			content = false;
			return;
		}
		content = true;
		if (token === "") return;
		if (trigger && start && token === "END") trigger = false;
		if (words.length < 4) words.push(token);
		if (token === "TRIGGER" && opensTrigger(words)) trigger = true;
	});
	if (content) statements.push(sql.slice(begin));
	return statements;
}

function opensTrigger(words: readonly string[]): boolean {
	return /^CREATE (?:TEMP |TEMPORARY )?TRIGGER$/.test(words.join(" "));
}

// The kinds of object CREATE makes. In MySQL and MariaDB, a stored program's
// body may hold `;`-separated statements inside BEGIN … END.
const CREATE_KINDS = new Set([
	"TABLE",
	"VIEW",
	"INDEX",
	"DATABASE",
	"SCHEMA",
	"SEQUENCE",
	"USER",
	"ROLE",
	"SERVER",
	"TABLESPACE",
	"PACKAGE",
	"PROCEDURE",
	"FUNCTION",
	"TRIGGER",
	"EVENT",
]);
const STORED_PROGRAMS = new Set(["PROCEDURE", "FUNCTION", "TRIGGER", "EVENT"]);

const controlsTransaction = (): Error =>
	new Error(
		"typesql: migrations cannot control transactions; each migration runs in its own transaction",
	);

/** Keep transaction ownership with the runner, including multi-statement raw SQL. */
function assertMigrationSql(sql: string, dialect: Dialect): void {
	const mysql = isMySql(dialect);
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
	// MySQL and MariaDB: the kind of object a CREATE statement makes, and the
	// BEGIN/CASE … END nesting of a compound statement: a stored program's
	// body, which runs only when called, or MariaDB's BEGIN NOT ATOMIC block,
	// which runs now.
	let createKind: string | undefined;
	let compound: "program" | "block" | undefined;
	let depth = 0;
	/** Tokens that belong to the one before them: `END CASE`'s CASE. */
	let skip = 0;
	scanSql(sql, dialect, (token, end, start) => {
		if (token === ";") {
			if (compound !== "program" || depth === 0) checkRollback();
			words.length = 0;
			// A `;` inside a compound statement's BEGIN … END doesn't end it.
			if (compound !== undefined && depth > 0) return;
			createKind = undefined;
			compound = undefined;
			return;
		}
		if (skip > 0) {
			skip--;
			return;
		}
		const next = sql.slice(end);
		if (
			mysql &&
			start &&
			compound === undefined &&
			token === "BEGIN" &&
			/^\s+NOT\s+ATOMIC\b/i.test(next)
		) {
			compound = "block";
			depth = 1;
			skip = 2;
			return;
		}
		if (compound !== undefined) {
			if (token === "BEGIN" || token === "CASE") depth++;
			else if (token === "END") {
				if (/^\s+CASE\b/i.test(next)) {
					depth--;
					skip = 1;
				} else if (!/^\s+(?:IF|LOOP|WHILE|REPEAT|FOR)\b/i.test(next)) depth--;
			} else if (
				compound === "block" &&
				start &&
				/^(START|COMMIT|XA)$/.test(token)
			)
				throw controlsTransaction();
		} else if (trigger && start && token === "END") trigger = false;
		else if (
			!trigger &&
			start &&
			(/^(BEGIN|START|COMMIT|END|ABORT)$/.test(token) ||
				(mysql && token === "XA"))
		)
			throw controlsTransaction();
		if (
			mysql &&
			compound === undefined &&
			words[0] === "CREATE" &&
			createKind === undefined &&
			CREATE_KINDS.has(token)
		) {
			createKind = token;
			if (STORED_PROGRAMS.has(token)) {
				compound = "program";
				depth = 0;
			}
		}
		if (words.length < 4) words.push(token);
		if (words.length === 2 && words[0] === "PREPARE" && token === "TRANSACTION")
			throw new Error("typesql: migrations cannot prepare transactions");
		if (dialect === "sqlite" && token === "TRIGGER" && opensTrigger(words))
			trigger = true;
	});
	checkRollback();
}
