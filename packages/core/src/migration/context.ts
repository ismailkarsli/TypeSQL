import { createDialectSql } from "../create-sql.js";
import type { ApplyDdlOf, DialectTypes, ValidateDdlOf } from "../dialect.js";
import type { EngineTypes } from "../engine/contract.js";
import type { ParamsOf, RowOf } from "../engine/infer.js";
import { type Postgres, postgres } from "../postgres/dialect.js";
import type { PgEngine } from "../postgres/engine/engine.js";
import type { Executor, Query } from "../query.js";
import type { SqlApi } from "../sql/api.js";
import type {
	BoxCallArgs,
	BoxSlottedArgs,
	CallRet,
	GateCallCheck,
	GateSlottedCheck,
	SplicedOr,
} from "../sql/call.js";
import type { SlotMap, SlotsFor } from "../sql/slots.js";
import { type Sqlite, sqlite } from "../sqlite/dialect.js";
import type { SqliteEngine } from "../sqlite/engine/engine.js";

type GateDdl<T extends DialectTypes, DB, Q extends string> = [DB, Q] extends [
	infer D,
	infer Text extends string,
]
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
		query: GateCallCheck<E, DB, TM, "preserve", Q> & Q,
		...params: BoxCallArgs<E, DB, TM, "preserve", Q>
	): CallRet<E, DB, TM, "preserve", Q>;
	<const Q extends string, const S extends SlotMap>(
		query: GateSlottedCheck<E, DB, TM, Q, S> & Q,
		slots: S & SlotsFor<Q, S>,
		...params: BoxSlottedArgs<E, DB, TM, Q, S>
	): Query<
		RowOf<E, DB, TM, SplicedOr<Q, S>>,
		ParamsOf<E, DB, TM, SplicedOr<Q, S>>,
		SplicedOr<Q, S>
	>;
	add<const Q extends string>(
		ddl: GateDdl<T, DB, Q> & Q,
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

/** Extract the final schema returned by an async migration's up function. */
export type MigrationSchema<Up extends (...args: never[]) => unknown> =
	Awaited<ReturnType<Up>> extends { readonly schema: infer Schema }
		? Schema
		: never;

/** Internal factory: execution is bound to the runner's active transaction. */
export function createMigrationContext(
	dialect: "postgres" | "sqlite",
	execute: Executor,
): PostgresMigration | SqliteMigration {
	const sql =
		dialect === "postgres"
			? createDialectSql(postgres, execute)
			: createDialectSql(sqlite, execute);
	const next = async (statement: string) => {
		await execute(statement, []);
		return createMigrationContext(dialect, execute);
	};
	return Object.assign(sql, { add: next, raw: next }) as unknown as
		| PostgresMigration
		| SqliteMigration;
}
