import type { AnyErr, SqlError } from "./engine/errors.js";
import type { ApplyDdl } from "./engine/infer.js";

/**
 * `Q` when the DDL script applies cleanly to `DB`, otherwise the `SqlError`. Used as
 * `ddl: ValidateDdl<DB, Q> & Q` so a bad statement is a compile error on the literal.
 */
export type ValidateDdl<DB, Q extends string> = string extends Q
	? SqlError<
			"migrations need a string literal; use .raw() for SQL the type checker cannot see",
			null
		>
	: ApplyDdl<DB, Q> extends infer R
		? R extends AnyErr
			? R
			: Q
		: never;

type GateValidateDdl<DB, Q extends string> = [DB, Q] extends [
	infer D,
	infer Q2 extends string,
]
	? ValidateDdl<D, Q2>
	: never;

/**
 * An immutable list of migration statements plus, at the type level, the schema they
 * produce. Build one with `migrations()`; every `.add()` returns a new builder.
 *
 *   const m = migrations()
 *     .add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
 *     .add("ALTER TABLE users ADD COLUMN display_name text");
 *   type DB = SchemaOf<typeof m>;          // { users: { id: Generated<"int4">; ... } }
 *   const sql = createSql<DB>();
 *   await runMigrations(client, m);         // BEGIN; each statement; COMMIT
 */
export class Migrations<DB = {}> {
	/** Phantom: the schema after every statement. Type-level only; `undefined` at runtime. */
	declare readonly schema: DB;
	/** The SQL texts in order, one entry per `.add()` / `.raw()` (an entry may hold several `;`-separated statements). */
	readonly statements: readonly string[];

	/** Use `migrations()`. */
	constructor(statements: readonly string[] = []) {
		this.statements = Object.freeze([...statements]);
		Object.freeze(this);
	}

	/**
	 * Append a DDL script (one or more statements). It is checked against the schema built
	 * so far: an invalid statement is a compile error on the literal, and the returned
	 * builder's `schema` is the schema after it. Queries and DML (seed data) are validated
	 * and leave the schema unchanged.
	 */
	add<const Q extends string>(
		ddl: GateValidateDdl<DB, Q> & Q,
	): Migrations<ApplyDdl<DB, Q>> {
		return new Migrations([...this.statements, ddl]);
	}

	/**
	 * Escape hatch: append SQL without checking it. The schema type is unchanged unless you
	 * state the resulting schema: `.raw<NewSchema>("...")`.
	 */
	raw<After = DB>(sql: string): Migrations<After> {
		return new Migrations<After>([...this.statements, sql]);
	}
}

/** Start a migration list, from an empty database or from an existing schema type `Base`. */
export function migrations<Base = {}>(): Migrations<Base> {
	return new Migrations<Base>();
}

/** The schema type produced by a migration list: `SchemaOf<typeof m>`. */
export type SchemaOf<M extends { readonly schema: unknown }> = M["schema"];

/**
 * What `runMigrations` needs from a driver: run one SQL text (no parameters) on a single
 * connection. node-postgres: a `Client` or a `PoolClient` from `pool.connect()` (not the
 * pool itself: BEGIN and COMMIT must reach the same connection). postgres.js:
 * `{ query: (text) => reserved.unsafe(text) }` with `const reserved = await sql.reserve()`.
 */
export interface MigrationClient {
	query(text: string): Promise<unknown>;
}

/**
 * Run every statement of `m` in order inside one transaction: `BEGIN`, each entry of
 * `m.statements`, `COMMIT`. On the first failure it sends `ROLLBACK` and rethrows the
 * original error (a failing ROLLBACK does not mask it). Statements that cannot run inside
 * a transaction block (`CREATE INDEX CONCURRENTLY`, ...) need a separate, manual step.
 */
export async function runMigrations(
	client: MigrationClient,
	m: { readonly statements: readonly string[] },
): Promise<void> {
	await client.query("BEGIN");
	try {
		for (const text of m.statements) await client.query(text);
		await client.query("COMMIT");
	} catch (err) {
		try {
			await client.query("ROLLBACK");
		} catch {
			// keep the original error
		}
		throw err;
	}
}
