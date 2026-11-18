import type {
	DIALECT,
	Dialect,
	DialectBrand,
	DialectTypes,
	SqlPlugin,
} from "@typesql/core";
import { createStatementSql, dialectFamily } from "@typesql/core/adapter";
import type {
	MariaDb,
	MariaDbDialect,
	MariaDbSql,
	MySql,
	MySqlDialect,
	Sql as MySqlSql,
} from "@typesql/core/mysql";
import type {
	Postgres,
	PostgresDialect,
	Sql as PostgresSql,
} from "@typesql/core/postgres";
import type {
	Sqlite,
	SqliteDialect,
	Sql as SqliteSql,
	DefaultTypeMap as SqliteTypeMap,
} from "@typesql/core/sqlite";
import type { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import { type EffectStatement, onClient, statementOf } from "./statement.js";
import type { EffectMysqlTypeMap, EffectPgTypeMap } from "./type-map.js";

export {
	type EffectQuery,
	type EffectQueryObject,
	type EffectStatement,
	NoResultError,
} from "./statement.js";
export type {
	EffectMysqlTypeMap,
	EffectPgInterval,
	EffectPgParamTypeMap,
	EffectPgTypeMap,
} from "./type-map.js";

interface EffectSqlMembers<R> {
	/** The client's `withTransaction`. */
	withTransaction<A, E, R2>(
		effect: Effect.Effect<A, E, R2>,
	): Effect.Effect<A, E | SqlError, R | R2>;
}

// Interfaces with the [DIALECT] brand, not intersections: TypeScript compares
// them by the brand instead of every member, which overflows (TS2589).

/** `R` is what statements require: `SqlClient` without a client, nothing with one. */
export interface EffectSql<
	in out DB,
	in out TM = EffectPgTypeMap,
	in out Plugins extends readonly SqlPlugin[] = [],
	in out R = SqlClient,
> extends PostgresSql<DB, TM, Plugins, EffectStatement<R>>,
		EffectSqlMembers<R> {
	readonly [DIALECT]?: DialectBrand<
		"postgres",
		DB,
		TM,
		Plugins,
		EffectStatement<R>
	>;
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): EffectSql<DB, TM, [...Plugins, P], R>;
}

export interface EffectSqliteSql<
	in out DB,
	in out TM = SqliteTypeMap,
	in out Plugins extends readonly SqlPlugin[] = [],
	in out R = SqlClient,
> extends SqliteSql<DB, TM, Plugins, EffectStatement<R>>,
		EffectSqlMembers<R> {
	readonly [DIALECT]?: DialectBrand<
		"sqlite",
		DB,
		TM,
		Plugins,
		EffectStatement<R>
	>;
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): EffectSqliteSql<DB, TM, [...Plugins, P], R>;
}

export interface EffectMysqlSql<
	in out DB,
	in out TM = EffectMysqlTypeMap,
	in out Plugins extends readonly SqlPlugin[] = [],
	in out R = SqlClient,
> extends MySqlSql<DB, TM, Plugins, EffectStatement<R>>,
		EffectSqlMembers<R> {
	readonly [DIALECT]?: DialectBrand<
		"mysql",
		DB,
		TM,
		Plugins,
		EffectStatement<R>
	>;
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): EffectMysqlSql<DB, TM, [...Plugins, P], R>;
}

export interface EffectMariaDbSql<
	in out DB,
	in out TM = EffectMysqlTypeMap,
	in out Plugins extends readonly SqlPlugin[] = [],
	in out R = SqlClient,
> extends MariaDbSql<DB, TM, Plugins, EffectStatement<R>>,
		EffectSqlMembers<R> {
	readonly [DIALECT]?: DialectBrand<
		"mariadb",
		DB,
		TM,
		Plugins,
		EffectStatement<R>
	>;
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): EffectMariaDbSql<DB, TM, [...Plugins, P], R>;
}

export type EffectSqlOf<
	T extends DialectTypes,
	DB,
	TM,
	Plugins extends readonly SqlPlugin[] = [],
	R = SqlClient,
> = T extends Postgres
	? EffectSql<DB, TM, Plugins, R>
	: T extends Sqlite
		? EffectSqliteSql<DB, TM, Plugins, R>
		: T extends MariaDb
			? EffectMariaDbSql<DB, TM, Plugins, R>
			: T extends MySql
				? EffectMysqlSql<DB, TM, Plugins, R>
				: never;

interface RuntimeSql {
	withPlugin(plugin: SqlPlugin): RuntimeSql;
}

/** An `sql` whose statements are Effects on `client`, or on the fiber's `SqlClient`. */
export function createSql<DB, TM = EffectPgTypeMap>(
	dialect: PostgresDialect,
): EffectSql<DB, TM>;
export function createSql<DB, TM = EffectPgTypeMap>(
	dialect: PostgresDialect,
	client: SqlClient,
): EffectSql<DB, TM, [], never>;
export function createSql<DB, TM = SqliteTypeMap>(
	dialect: SqliteDialect,
): EffectSqliteSql<DB, TM>;
export function createSql<DB, TM = SqliteTypeMap>(
	dialect: SqliteDialect,
	client: SqlClient,
): EffectSqliteSql<DB, TM, [], never>;
export function createSql<DB, TM = EffectMysqlTypeMap>(
	dialect: MySqlDialect,
): EffectMysqlSql<DB, TM>;
export function createSql<DB, TM = EffectMysqlTypeMap>(
	dialect: MySqlDialect,
	client: SqlClient,
): EffectMysqlSql<DB, TM, [], never>;
export function createSql<DB, TM = EffectMysqlTypeMap>(
	dialect: MariaDbDialect,
): EffectMariaDbSql<DB, TM>;
export function createSql<DB, TM = EffectMysqlTypeMap>(
	dialect: MariaDbDialect,
	client: SqlClient,
): EffectMariaDbSql<DB, TM, [], never>;
export function createSql(dialect: Dialect, client?: SqlClient): object {
	const on = onClient(client);
	const members = {
		withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
			on((client) => client.withTransaction(effect)),
	};
	// withPlugin() returns the dialect's plain `sql`.
	const extend = (sql: RuntimeSql): RuntimeSql => {
		const { withPlugin } = sql;
		return Object.assign(sql, members, {
			withPlugin: (plugin: SqlPlugin) => extend(withPlugin(plugin)),
		});
	};
	const sql = createStatementSql(
		dialect,
		statementOf(dialectFamily(dialect.name), on),
	);
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: the dialect's `sql` type is computed from its type parameters.
	return extend(sql as RuntimeSql);
}
