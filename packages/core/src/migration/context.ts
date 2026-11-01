import { createDialectSql } from "../create-sql.js";
import type {
	ApplyDdlOf,
	DialectTypes,
	StrictNullChecksMessage,
	ValidateDdlOf,
} from "../dialect.js";
import type { EngineTypes } from "../engine/contract.js";
import type { SqlError } from "../errors.js";
import { type Postgres, postgres } from "../postgres/dialect.js";
import type { PgEngine } from "../postgres/engine/engine.js";
import type { Executor } from "../query.js";
import type { SqlApi } from "../sql/api.js";
import type { BoxCallArgs, CallRet, GateCallCheck } from "../sql/call.js";
import { type Sqlite, sqlite } from "../sqlite/dialect.js";
import type { SqliteEngine } from "../sqlite/engine/engine.js";

// Without strictNullChecks every query and DDL statement is this error, as
// for `sql` (see StrictSql).
type NonStrict = null extends string
	? SqlError<StrictNullChecksMessage, null>
	: never;

type GateDdl<T extends DialectTypes, DB, Q extends string> = null extends string
	? NonStrict
	: [DB, Q] extends [infer D, infer Text extends string]
		? ValidateDdlOf<T, D, Text>
		: never;

/** A checked SQL executor whose schema evolves after each awaited DDL statement. */
export interface MigrationContext<
	E extends EngineTypes,
	T extends DialectTypes,
	DB,
	TM = T["typeMap"],
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
 * `step` runs each `.add()` and `.raw()` statement; the fingerprint's dry
 * run records them instead.
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
