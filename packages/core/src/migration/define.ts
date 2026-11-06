import type {
	AnyMigrationContext,
	MariaDbMigration,
	MySqlMigration,
	PostgresMigration,
	SqliteMigration,
} from "./context.js";
import { DIALECTS, type DialectName, isDialectName } from "./dialects/index.js";

/**
 * A migration: `up` takes the schema the previous migration leaves and
 * returns its context, and `down` takes what `up` returns.
 */
export interface Migration<in Before = never, in out After = unknown> {
	/** Its name in the history: needed in an array; a file's is its file name. */
	readonly name?: string | undefined;
	readonly up: (db: Before) => Promise<After>;
	// biome-ignore lint/plugin: the result of `down` is ignored, and `Promise<void>` would reject `async (db) => db.ddl(...)`.
	readonly down: (db: After) => Promise<unknown>;
}

/** The `name`, `up` and `down` passed to {@link migration}. */
export interface MigrationSteps<Before, After> {
	/** Its name in the history: needed in an array; a file's is its file name. */
	readonly name?: string | undefined;
	readonly up: (db: Before) => Promise<After>;
	// biome-ignore lint/plugin: see `Migration.down`.
	readonly down: (db: NoInfer<After>) => Promise<unknown>;
}

/** Where a migration starts; the runner checks the chain with it. */
const MIGRATION_FROM: unique symbol = Symbol.for("typesql.migration.from");

/** What `migration()` starts from, as its overloads take it. */
type From =
	| DialectName
	| { readonly up: (db: never) => Promise<{ readonly schema: unknown }> }
	| ((db: never) => Promise<{ readonly schema: unknown }>);

/**
 * Define a migration. `from` is `"postgres"`, `"sqlite"`, `"mysql"` or
 * `"mariadb"` for the first migration, and the previous migration for a
 * later one. `up`'s `db` starts from the schema `from` leaves; `down`'s `db`
 * starts from what `up` returns. `name` is its name in the history, which a
 * migration in an array needs; a migration file's name is its file name.
 *
 * The starting schema is inferred from `from` as a function argument rather
 * than computed by a type alias, so checking a migration costs the same
 * however many migrations come before it.
 */
export function migration<After>(
	from: "postgres",
	steps: MigrationSteps<PostgresMigration, After>,
): Migration<PostgresMigration, After>;
export function migration<After>(
	from: "sqlite",
	steps: MigrationSteps<SqliteMigration, After>,
): Migration<SqliteMigration, After>;
export function migration<After>(
	from: "mysql",
	steps: MigrationSteps<MySqlMigration, After>,
): Migration<MySqlMigration, After>;
export function migration<After>(
	from: "mariadb",
	steps: MigrationSteps<MariaDbMigration, After>,
): Migration<MariaDbMigration, After>;
export function migration<Before extends { readonly schema: unknown }, After>(
	from:
		| { readonly up: (db: never) => Promise<Before> }
		| ((db: never) => Promise<Before>),
	steps: MigrationSteps<Before, After>,
): Migration<Before, After>;
export function migration(
	from: From,
	steps: MigrationSteps<never, unknown>,
): Migration<never, unknown> {
	if (!isDialectName(from) && typeof from !== "function" && !isMigration(from))
		throw new TypeError(
			`typesql: migration() starts from ${Object.keys(DIALECTS)
				.map((name) => JSON.stringify(name))
				.join(", ")} or the previous migration`,
		);
	if (!isMigration(steps))
		throw new TypeError(
			"typesql: migration() takes { up, down } with async functions",
		);
	const { name, up, down } = steps;
	if (name !== undefined && (typeof name !== "string" || name.trim() === ""))
		throw new TypeError(
			"typesql: a migration's name must be a non-empty string",
		);
	const defined: Migration<never, unknown> =
		name === undefined ? { up, down } : { name, up, down };
	Object.defineProperty(defined, MIGRATION_FROM, { value: from });
	return Object.freeze(defined);
}

/**
 * A migration's `up` or `down` as the runner calls it: with the context of
 * the migrator's dialect. The runner awaits what it returns.
 */
export type Step = (db: AnyMigrationContext) => void;

/**
 * Whether `value` is a function the runner can call as a step. The chain
 * check, not this, makes the context it gets the one it starts from.
 */
export function isStep(value: unknown): value is Step {
	return typeof value === "function";
}

/** A migration as the runner reads it, from any copy of `@typesql/core`. */
export interface Runnable {
	readonly name?: string | undefined;
	readonly up: Step;
	readonly down: Step;
}

/** A loaded migration, from the array or a file. */
export interface Entry {
	readonly name: string;
	readonly up: Step;
	readonly down: Step;
	/** What it starts from, when it was defined with migration(). */
	readonly from: unknown;
	/** What a later migration's `from` is when it follows this one. */
	readonly self: unknown;
}

export function toEntry(name: string, migration: Runnable): Entry {
	return {
		name,
		up: migration.up,
		down: migration.down,
		from: MIGRATION_FROM in migration ? migration[MIGRATION_FROM] : undefined,
		self: migration,
	};
}

/** Whether `value` has a migration's `up` and `down` functions. */
export function isMigration<V>(value: V): value is V & Runnable {
	return (
		value !== null &&
		typeof value === "object" &&
		"up" in value &&
		typeof value.up === "function" &&
		"down" in value &&
		typeof value.down === "function"
	);
}
