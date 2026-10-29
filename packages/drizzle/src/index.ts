import { createTransactionalSql } from "@typesql/core/adapter";
import type {
	DefaultTypeMap,
	PostgresDialect,
	TransactionalSql,
} from "@typesql/core/postgres";
import { type DrizzleDatabase, driver } from "./client.js";
import type { FromDrizzle, FromDrizzleOptions } from "./from-drizzle.js";

export { type DrizzleDatabase, executor } from "./client.js";
export type {
	DrizzleColumnTypes,
	FromDrizzle,
	FromDrizzleOptions,
} from "./from-drizzle.js";
export { pgType } from "./pg-type.js";

export type DrizzleSql<
	Schema,
	TM = DefaultTypeMap,
	Opts extends FromDrizzleOptions = {},
> = TransactionalSql<FromDrizzle<Schema, Opts>, TM>;

export type DrizzleSchema<D> = D extends {
	readonly _: { readonly fullSchema: infer S };
}
	? S
	: never;

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
	dialect: PostgresDialect,
	db?: DrizzleDatabase,
): unknown {
	return createTransactionalSql(dialect, db, driver);
}
