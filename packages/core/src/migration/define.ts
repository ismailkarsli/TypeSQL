import type { PostgresMigration, SqliteMigration } from "./context.js";

/**
 * Define a migration's `up` or `down`. `db` starts where `from` leaves off:
 * an empty schema of the dialect for the first migration's `up`, the
 * previous migration's `up` for a later one, and the same file's `up` for
 * `down`.
 *
 * The starting schema is inferred from `from` as a function argument rather
 * than computed by a type alias, so checking a migration costs the same
 * however many migrations come before it.
 */
export function migration<R>(
	from: "postgres",
	run: (db: PostgresMigration) => Promise<R>,
): (db: PostgresMigration) => Promise<R>;
export function migration<R>(
	from: "sqlite",
	run: (db: SqliteMigration) => Promise<R>,
): (db: SqliteMigration) => Promise<R>;
export function migration<Db extends { readonly schema: unknown }, R>(
	from: (db: never) => Promise<Db>,
	run: (db: Db) => Promise<R>,
): (db: Db) => Promise<R>;
export function migration(
	from: unknown,
	run: unknown,
): (db: never) => Promise<unknown> {
	if (from !== "postgres" && from !== "sqlite" && typeof from !== "function")
		throw new TypeError(
			'typesql: migration() starts from "postgres", "sqlite" or a migration\'s up',
		);
	if (typeof run !== "function")
		throw new TypeError("typesql: migration() takes an async function");
	return run as (db: never) => Promise<unknown>;
}
