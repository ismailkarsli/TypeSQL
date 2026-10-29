import { createTransactionalSql } from "@typesql/core/adapter";
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
import { type DrizzleDatabase, driver } from "./client.js";
import type { FromDrizzle, FromDrizzleOptions } from "./from-drizzle.js";
import type { FromDrizzleSqlite } from "./from-drizzle-sqlite.js";
import { type DrizzleSqliteDatabase, sqliteDriver } from "./sqlite-client.js";

export { type DrizzleDatabase, executor } from "./client.js";
export type {
	DrizzleColumnTypes,
	FromDrizzle,
	FromDrizzleOptions,
} from "./from-drizzle.js";
export type {
	DrizzleSqliteColumnTypes,
	FromDrizzleSqlite,
} from "./from-drizzle-sqlite.js";
export { pgType, sqliteType } from "./pg-type.js";
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

export type DrizzleSchema<D> = D extends {
	readonly _: { readonly fullSchema: infer S };
}
	? S
	: never;

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
	dialect: PostgresDialect | SqliteDialect,
	db?: DrizzleDatabase | DrizzleSqliteDatabase,
): unknown {
	return dialect.name === "sqlite"
		? createTransactionalSql(
				dialect,
				db as DrizzleSqliteDatabase | undefined,
				sqliteDriver,
			)
		: createTransactionalSql(
				dialect,
				db as DrizzleDatabase | undefined,
				driver,
			);
}
