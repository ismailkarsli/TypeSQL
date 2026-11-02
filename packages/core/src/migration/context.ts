import { createDialectSql } from "../create-sql.js";
import type {
	ApplyDdlOf,
	DialectTypes,
	StrictNullChecksMessage,
	ValidateDdlOf,
} from "../dialect.js";
import type { EngineTypes } from "../engine/contract.js";
import type { SqlError } from "../errors.js";
import { postgres } from "../postgres/dialect.js";
// The types come from the public entry points, so the declarations of a
// project that exports a migration can name its schema's types (TS2883).
import type { PgEngine } from "../postgres/engine/index.js";
import type { Postgres } from "../postgres/index.js";
import type { Executor } from "../query.js";
import type { SqlApi } from "../sql/api.js";
import type { BoxCallArgs, CallRet, GateCallCheck } from "../sql/call.js";
import { sqlite } from "../sqlite/dialect.js";
import type { SqliteEngine } from "../sqlite/engine/index.js";
import type { Sqlite } from "../sqlite/index.js";

// Without strictNullChecks every query and DDL statement is this error, as
// for `sql` (see StrictSql).
type NonStrict = null extends string
	? SqlError<StrictNullChecksMessage, null>
	: never;

// The strictNullChecks check sits inside the [DB, Q] inference: as the outer
// conditional, the editor's string completion in `.add("…")` took about 35s.
type GateDdl<T extends DialectTypes, DB, Q extends string> = [DB, Q] extends [
	infer D,
	infer Text extends string,
]
	? null extends string
		? NonStrict
		: ValidateDdlOf<T, D, Text>
	: never;

/** A checked SQL executor whose schema evolves after each awaited DDL statement. */
export interface MigrationContext<
	in out E extends EngineTypes,
	in out T extends DialectTypes,
	in out DB,
	in out TM = T["typeMap"],
> extends Omit<SqlApi<E, DB, TM>, "raw"> {
	/** Type-only schema marker; no database introspection is performed. */
	readonly schema: DB;
	<const Q extends string>(
		query: (null extends string
			? NonStrict
			: DB extends MissingSchema
				? MissingSchemaError
				: GateCallCheck<E, DB, TM, Q>) &
			Q,
		...params: null extends string
			? readonly unknown[]
			: BoxCallArgs<E, DB, TM, Q>
	): null extends string ? any : CallRet<E, DB, TM, Q>;
	add<const Q extends string>(
		ddl: (DB extends MissingSchema ? MissingSchemaError : GateDdl<T, DB, Q>) &
			Q,
	): Promise<MigrationContext<E, T, ApplyDdlOf<T, DB, Q>, TM>>;
	/** Execute SQL the checker cannot see, explicitly asserting its resulting schema. */
	raw<NewSchema = DB>(
		sql: string,
	): Promise<MigrationContext<E, T, NewSchema, TM>>;
}

export type PostgresMigration<Base = {}> = MigrationContext<
	PgEngine,
	Postgres,
	Base
>;
export type SqliteMigration<Base = {}> = MigrationContext<
	SqliteEngine,
	Sqlite,
	Base
>;

declare const MISSING_SCHEMA: unique symbol;
/** The schema of a migration whose `up` doesn't return its context. */
export type MissingSchema = { readonly [MISSING_SCHEMA]: true };
type MissingSchemaError = SqlError<
	"the previous migration's up() does not return its migration context, so its schema is unknown; end it with `return db`",
	0
>;

/**
 * Internal factory: execution is bound to the runner's active transaction.
 * `step` runs each `.add()` and `.raw()` statement; the runner splits a
 * SQLite script into its statements there.
 */
export function createMigrationContext(
	dialect: "postgres" | "sqlite",
	execute: Executor,
	step: (kind: "add" | "raw", statement: string) => Promise<void> = async (
		_,
		statement,
	) => {
		await execute(statement, []);
	},
): PostgresMigration | SqliteMigration {
	// Avoid comparing the two recursive SQL APIs when choosing a runtime dialect.
	let sql: object;
	if (dialect === "postgres") sql = createDialectSql(postgres, execute);
	else if (dialect === "sqlite") sql = createDialectSql(sqlite, execute);
	else throw new Error(`typesql: unsupported migration dialect: ${dialect}`);
	const next = (kind: "add" | "raw") => async (statement: string) => {
		await step(kind, statement);
		return createMigrationContext(dialect, execute, step);
	};
	return Object.assign(sql, {
		add: next("add"),
		raw: next("raw"),
	}) as unknown as PostgresMigration | SqliteMigration;
}
