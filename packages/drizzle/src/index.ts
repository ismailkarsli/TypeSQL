import { createTransactionalSql } from "@typesql/core/adapter";
import type {
	MariaDbDialect,
	MariaDbTransactionalSql,
	MySqlDialect,
	Mysql2MariaDbTypeMap,
	TransactionalSql as MysqlTransactionalSql,
	DefaultTypeMap as MysqlTypeMap,
} from "@typesql/core/mysql";
import type {
	DefaultTypeMap,
	PostgresDialect,
	TransactionalSql,
} from "@typesql/core/postgres";
import type {
	SqliteDialect,
	TransactionalSql as SqliteTransactionalSql,
	DefaultTypeMap as SqliteTypeMap,
} from "@typesql/core/sqlite";
import {
	type DrizzleDatabase,
	driver,
	isDrizzleDatabase,
	isMysqlDatabase,
	isSqliteDatabase,
} from "./client.js";
import type { FromDrizzle, FromDrizzleOptions } from "./from-drizzle.js";
import type { FromDrizzleMysql } from "./from-drizzle-mysql.js";
import type { FromDrizzleSqlite } from "./from-drizzle-sqlite.js";
import { type DrizzleMysqlDatabase, mysqlDriver } from "./mysql-client.js";
import { type DrizzleSqliteDatabase, sqliteDriver } from "./sqlite-client.js";

export { type DrizzleDatabase, executor } from "./client.js";
export type {
	DrizzleColumnTypes,
	FromDrizzle,
	FromDrizzleOptions,
} from "./from-drizzle.js";
export type {
	DrizzleMysqlColumnTypes,
	FromDrizzleMysql,
} from "./from-drizzle-mysql.js";
export type {
	DrizzleSqliteColumnTypes,
	FromDrizzleSqlite,
} from "./from-drizzle-sqlite.js";
export { type DrizzleMysqlDatabase, mysqlExecutor } from "./mysql-client.js";
export { mysqlType, pgType, sqliteType } from "./pg-type.js";
export { type DrizzleSqliteDatabase, sqliteExecutor } from "./sqlite-client.js";

export type DrizzleSql<
	Schema,
	TM = DefaultTypeMap,
	Opts extends FromDrizzleOptions = {},
> = TransactionalSql<FromDrizzle<Schema, Opts>, TM>;

export type DrizzleSqliteSql<
	Schema,
	TM = SqliteTypeMap,
	Opts extends FromDrizzleOptions = {},
> = SqliteTransactionalSql<FromDrizzleSqlite<Schema, Opts>, TM>;

export type DrizzleMysqlSql<
	Schema,
	TM = MysqlTypeMap,
	Opts extends FromDrizzleOptions = {},
> = MysqlTransactionalSql<FromDrizzleMysql<Schema, Opts>, TM>;

/** Drizzle reaches MariaDB through mysql2, so rows are typed the way mysql2 reads it. */
export type DrizzleMariaDbSql<
	Schema,
	TM = Mysql2MariaDbTypeMap,
	Opts extends FromDrizzleOptions = {},
> = MariaDbTransactionalSql<FromDrizzleMysql<Schema, Opts>, TM>;

export type DrizzleSchema<D> = D extends {
	readonly _: { readonly fullSchema: infer S };
}
	? S
	: never;

const notMysql = (dialect: string): Error =>
	new Error(
		`typesql: createSql(${dialect}, db) needs a Drizzle MySQL database (with a session)`,
	);

export function createSql<
	D extends DrizzleMysqlDatabase & {
		readonly _: { readonly fullSchema: Record<string, unknown> };
	},
>(dialect: MySqlDialect, db: D): DrizzleMysqlSql<DrizzleSchema<D>>;
export function createSql<
	Schema,
	TM = MysqlTypeMap,
	Opts extends FromDrizzleOptions = {},
>(
	dialect: MySqlDialect,
	db?: DrizzleMysqlDatabase,
): DrizzleMysqlSql<Schema, TM, Opts>;
export function createSql<
	D extends DrizzleMysqlDatabase & {
		readonly _: { readonly fullSchema: Record<string, unknown> };
	},
>(dialect: MariaDbDialect, db: D): DrizzleMariaDbSql<DrizzleSchema<D>>;
export function createSql<
	Schema,
	TM = Mysql2MariaDbTypeMap,
	Opts extends FromDrizzleOptions = {},
>(
	dialect: MariaDbDialect,
	db?: DrizzleMysqlDatabase,
): DrizzleMariaDbSql<Schema, TM, Opts>;
export function createSql<
	D extends DrizzleSqliteDatabase & {
		readonly _: { readonly fullSchema: Record<string, unknown> };
	},
>(dialect: SqliteDialect, db: D): DrizzleSqliteSql<DrizzleSchema<D>>;
export function createSql<
	Schema,
	TM = SqliteTypeMap,
	Opts extends FromDrizzleOptions = {},
>(
	dialect: SqliteDialect,
	db?: DrizzleSqliteDatabase,
): DrizzleSqliteSql<Schema, TM, Opts>;
export function createSql<
	D extends DrizzleDatabase & {
		readonly _: { readonly fullSchema: Record<string, unknown> };
	},
>(dialect: PostgresDialect, db: D): DrizzleSql<DrizzleSchema<D>>;
export function createSql<
	Schema,
	TM = DefaultTypeMap,
	Opts extends FromDrizzleOptions = {},
>(dialect: PostgresDialect, db?: DrizzleDatabase): DrizzleSql<Schema, TM, Opts>;
export function createSql(
	dialect: PostgresDialect | SqliteDialect | MySqlDialect | MariaDbDialect,
	db?: DrizzleDatabase | DrizzleSqliteDatabase | DrizzleMysqlDatabase,
): object {
	switch (dialect.name) {
		case "sqlite":
			if (db === undefined || isSqliteDatabase(db))
				return createTransactionalSql(dialect, db, sqliteDriver);
			throw new Error(
				"typesql: createSql(sqlite, db) needs a Drizzle SQLite database (with all() and run())",
			);
		case "mysql":
			if (db === undefined || isMysqlDatabase(db))
				return createTransactionalSql(dialect, db, mysqlDriver);
			throw notMysql(dialect.name);
		case "mariadb":
			if (db === undefined || isMysqlDatabase(db))
				return createTransactionalSql(dialect, db, mysqlDriver);
			throw notMysql(dialect.name);
		default:
			if (db === undefined || isDrizzleDatabase(db))
				return createTransactionalSql(dialect, db, driver);
			throw new Error(
				"typesql: createSql(postgres, db) needs a Drizzle database (with a session)",
			);
	}
}
