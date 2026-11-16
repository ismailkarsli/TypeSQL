import type { Dialect, DialectTypes, SqlOf, SqlPlugin } from "@typesql/core";
import { createStatementSql, dialectFamily } from "@typesql/core/adapter";
import type {
	MariaDb,
	MariaDbDialect,
	MySql,
	MySqlDialect,
} from "@typesql/core/mysql";
import type { Postgres, PostgresDialect } from "@typesql/core/postgres";
import type {
	Sqlite,
	SqliteDialect,
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

interface EffectSqlMembers<
	T extends DialectTypes,
	DB,
	TM,
	Plugins extends readonly SqlPlugin[],
	R,
> {
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): EffectSqlOf<T, DB, TM, [...Plugins, P], R>;
	/** The client's `withTransaction`. */
	withTransaction<A, E, R2>(
		effect: Effect.Effect<A, E, R2>,
	): Effect.Effect<A, E | SqlError, R | R2>;
}

/** `R` is what statements require: `SqlClient` without a client, nothing with one. */
export type EffectSqlOf<
	T extends DialectTypes,
	DB,
	TM,
	Plugins extends readonly SqlPlugin[] = [],
	R = SqlClient,
> = EffectSqlMembers<T, DB, TM, Plugins, R> &
	SqlOf<T, DB, TM, Plugins, EffectStatement<R>>;

export type EffectSql<
	DB,
	TM = EffectPgTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
	R = SqlClient,
> = EffectSqlOf<Postgres, DB, TM, Plugins, R>;

export type EffectSqliteSql<
	DB,
	TM = SqliteTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
	R = SqlClient,
> = EffectSqlOf<Sqlite, DB, TM, Plugins, R>;

export type EffectMysqlSql<
	DB,
	TM = EffectMysqlTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
	R = SqlClient,
> = EffectSqlOf<MySql, DB, TM, Plugins, R>;

export type EffectMariaDbSql<
	DB,
	TM = EffectMysqlTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
	R = SqlClient,
> = EffectSqlOf<MariaDb, DB, TM, Plugins, R>;

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
