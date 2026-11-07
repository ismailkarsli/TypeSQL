import { errorMessage } from "../command.js";
import type { Executor } from "../query.js";
import { createMigrationContext } from "./context.js";
import {
	type Entry,
	isMigration,
	type Migration,
	type Step,
	toEntry,
} from "./define.js";
import {
	DIALECT_LIST,
	DIALECTS,
	type DialectName,
	isDialectName,
} from "./dialects/index.js";
import {
	type MigratorDialect,
	rows,
	SPLIT,
	tryRun,
} from "./dialects/session.js";
import type { SCHEMA, SchemaOf } from "./schema.js";
import { assertMigrationSql, splitStatements } from "./statements.js";

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
	readonly dialect: DialectName;
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
	/** How `typesql format` writes the SQL of TypeSQL calls. */
	readonly format?: FormatConfig | undefined;
}

export interface FormatConfig {
	/** `"upper"` writes keywords as `SELECT`, `"lower"` as `select` (default: `"upper"`). */
	readonly keywordCase?: "upper" | "lower" | undefined;
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
 * The config keys that name a file or directory: relative to the working
 * directory, or, in a config file, to the file.
 */
export const PATH_KEYS = ["migrationsDir", "schemaFile", "db"] as const;
export type PathKey = (typeof PATH_KEYS)[number];

/** The schema file of a migrations directory, by default. */
export const SCHEMA_FILE = "db.ts";

/** SQLite's in-memory database: a `db` that is not a file. */
export const MEMORY = ":memory:";

/**
 * The Node-only parts load only when a directory, `url`, `db` or
 * `generate()` needs them. Bundlers include them: they reach Node's
 * built-ins through process.getBuiltinModule() and `pg` from node_modules at
 * runtime, so a Worker bundle has no Node imports to resolve.
 */
const loadFiles = () => import("./files.js");
const loadGenerate = () => import("./generate.js");

function validate(config: MigratorConfig): void {
	if (!isDialectName(config.dialect))
		throw new Error(
			`typesql: unsupported migration dialect: ${String(config.dialect)} (expected ${DIALECT_LIST})`,
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
	const { target } = DIALECTS[config.dialect];
	if (config.url !== undefined && target !== "url")
		throw new Error(
			`typesql: url connects to ${servers("url")}; use db for ${servers("db")}`,
		);
	if (config.db !== undefined && target !== "db")
		throw new Error(
			`typesql: db opens a ${servers("db")} file; use url for ${servers("url")}`,
		);
	for (const key of [...PATH_KEYS, "url", "migrationTable"] as const) {
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
	const { format } = config;
	if (format !== undefined && (typeof format !== "object" || format === null))
		throw new Error("typesql: format must be an object");
	const keywordCase = format?.keywordCase;
	if (
		keywordCase !== undefined &&
		keywordCase !== "upper" &&
		keywordCase !== "lower"
	)
		throw new Error('typesql: format.keywordCase must be "upper" or "lower"');
}

/** The servers a connection target reaches: "PostgreSQL, MySQL or MariaDB". */
const servers = (target: "url" | "db"): string =>
	Object.values(DIALECTS)
		.filter((d) => d.target === target)
		.map((d) => d.server)
		.join(", ")
		.replace(/, (?=[^,]*$)/, " or ");

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
			schemaFile: settled.schemaFile ?? SCHEMA_FILE,
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
function checkChain(dialect: DialectName, entries: readonly Entry[]): void {
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
	dialect: MigratorDialect,
	tableName: string,
	transaction: boolean,
) {
	const session = await dialect.open(execute, tableName, transaction);
	const whole = () => session.whole?.() ?? true;
	return {
		async begin(): Promise<void> {
			if (!transaction) return;
			await session.begin();
			try {
				if (!(await session.inTransaction()) || !(await whole()))
					throw new Error(SPLIT);
			} catch (error) {
				// Leave no transaction, and with it the lock, open on the
				// caller's connection, where its later writes would be lost.
				await tryRun(execute, "ROLLBACK");
				throw error;
			}
		},
		async commit(): Promise<void> {
			if (!transaction) return;
			if (!(await session.inTransaction())) throw new Error(SPLIT);
			await execute("COMMIT", []);
		},
		/**
		 * Roll back after a failure, and tell whether it was rolled back: not
		 * without a transaction, or when its statements didn't run in it. On
		 * MySQL, a migration that ran a DDL statement is rolled back only
		 * after its last one.
		 */
		async rollback(): Promise<true | NotRolledBack> {
			if (!transaction) return "none";
			let intact: boolean;
			let all = false;
			try {
				intact = await session.inTransaction().catch((cause: unknown) => {
					if (session.aborted?.(cause)) return true;
					throw cause;
				});
				if (intact) all = await whole();
			} catch (error) {
				// Asking how it stands failed. Leave no transaction open: closing
				// the session could commit it (MySQL's SET autocommit = 1), and
				// the caller's later writes on its connection would join it.
				await tryRun(execute, "ROLLBACK");
				throw error;
			}
			if (!intact) {
				// It may still reach the connection that holds the transaction.
				await tryRun(execute, "ROLLBACK");
				return "split";
			}
			await execute("ROLLBACK", []);
			return all ? true : "implicit";
		},
		/** Create the table if needed, and read it in the order it was applied. */
		async read(): Promise<Row[]> {
			if (!session.created) await execute(session.createTable, []);
			return readHistory(await rows(execute, session.read));
		},
		/** Record a migration. `hash` is unused; 3.x stored a hash of the file there. */
		async insert(name: string): Promise<void> {
			await execute(session.insert, [name]);
		},
		async remove(name: string): Promise<void> {
			await execute(`DELETE FROM ${session.table} WHERE name = $1`, [name]);
		},
		close: async (): Promise<void> => session.close?.(),
	};
}

async function run(
	config: MigratorConfig,
	command: Command,
): Promise<{ names: string[]; applied: number; status: MigrationStatus[] }> {
	const dialect = DIALECTS[config.dialect];
	const entries = await load(config);
	checkChain(config.dialect, entries);

	const transaction = config.transaction ?? true;
	const connection = await connect(config, dialect);
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
				let message = errorMessage(error);
				let rolledBack = false;
				try {
					const outcome = await history.rollback();
					rolledBack = outcome === true;
					if (!rolledBack && current !== undefined)
						message +=
							outcome === "implicit"
								? `; ${dialect.server} commits implicitly before and after each DDL statement, so its statements up to its last DDL statement stay applied and only the ones after it were rolled back`
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
						message += `; rolling it back failed too: ${errorMessage(rollbackError)}`;
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
		try {
			await history?.close();
		} finally {
			await connection.close();
		}
	}
	return { names, applied, status };
}

async function connect(
	config: MigratorConfig,
	dialect: MigratorDialect,
): Promise<{ execute: Executor; close(): Promise<void> }> {
	if (config.execute !== undefined)
		return { execute: config.execute, close: async () => {} };
	const target = config[dialect.target];
	if (target !== undefined) return dialect.connect(target);
	throw new Error(
		`typesql: set ${dialect.target} (or execute) to run ${dialect.server} migrations`,
	);
}

/** Run one `up` or `down` on a guarded connection inside the runner's transaction. */
async function runStep(
	dialect: MigratorDialect,
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
		await step(
			createMigrationContext(dialect.sql, guarded, async (script) => {
				for (const statement of dialect.split
					? splitStatements(script, dialect)
					: [script])
					await guarded(statement, []);
			}),
		);
	} finally {
		active = false;
	}
}
