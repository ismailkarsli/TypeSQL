import type {
	MissingSchema,
	PostgresMigration,
	SqliteMigration,
} from "./context.js";

/**
 * A migration: `up` takes the schema the previous migration leaves and
 * returns its context, and `down` takes what `up` returns.
 */
export interface Migration<Before = never, After = unknown> {
	readonly up: (db: Before) => Promise<After>;
	readonly down: (db: After) => Promise<unknown>;
}

/** The `up` and `down` passed to {@link migration}. */
export interface MigrationSteps<Before, After> {
	readonly up: (db: Before) => Promise<After>;
	readonly down: (db: NoInfer<After>) => Promise<unknown>;
}

type ContextSchema<C> = C extends { readonly schema: infer Schema }
	? Schema
	: MissingSchema;

/** Type-only: the schema a migrator or its `latest()` result leaves. */
export declare const SCHEMA: unique symbol;

/**
 * The schema after a migration: `SchemaOf<typeof m>`. It also takes a
 * migrator or its `latest()` result (the schema after the last migration),
 * a 3.x migration's `up` function, or a migration context.
 */
export type SchemaOf<M> = M extends { readonly [SCHEMA]: infer Schema }
	? Schema
	: M extends { readonly up: (db: never) => Promise<infer After> }
		? ContextSchema<After>
		: M extends (db: never) => Promise<infer After>
			? ContextSchema<After>
			: ContextSchema<M>;

/** Where a migration starts; the runner checks the chain with it. */
export const MIGRATION_FROM: unique symbol = Symbol.for(
	"typesql.migration.from",
) as never;

/**
 * Define a migration. `from` is `"postgres"` or `"sqlite"` for the first
 * migration, and the previous migration for a later one. `up`'s `db` starts
 * from the schema `from` leaves; `down`'s `db` starts from what `up` returns.
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
export function migration<Before extends { readonly schema: unknown }, After>(
	from:
		| { readonly up: (db: never) => Promise<Before> }
		| ((db: never) => Promise<Before>),
	steps: MigrationSteps<Before, After>,
): Migration<Before, After>;
export function migration(
	from: unknown,
	steps: unknown,
): Migration<never, unknown> {
	if (
		from !== "postgres" &&
		from !== "sqlite" &&
		typeof from !== "function" &&
		!isMigration(from)
	)
		throw new TypeError(
			'typesql: migration() starts from "postgres", "sqlite" or the previous migration',
		);
	if (
		steps === null ||
		typeof steps !== "object" ||
		!("up" in steps) ||
		typeof steps.up !== "function" ||
		!("down" in steps) ||
		typeof steps.down !== "function"
	)
		throw new TypeError(
			"typesql: migration() takes { up, down } with async functions",
		);
	const defined = { up: steps.up, down: steps.down } as Migration<
		never,
		unknown
	>;
	Object.defineProperty(defined, MIGRATION_FROM, { value: from });
	return Object.freeze(defined);
}

/** Whether `value` has a migration's `up` and `down` functions. */
export function isMigration(value: unknown): value is Migration {
	return (
		value !== null &&
		typeof value === "object" &&
		"up" in value &&
		typeof value.up === "function" &&
		"down" in value &&
		typeof value.down === "function"
	);
}
