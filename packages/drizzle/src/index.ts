import type { DefaultTypeMap, TransactionalSql } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
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

export function createSql<
	Schema,
	TM = DefaultTypeMap,
	Opts extends FromDrizzleOptions = {},
>(db?: DrizzleDatabase): DrizzleSql<Schema, TM, Opts> {
	return createTransactionalSql<FromDrizzle<Schema, Opts>, TM, DrizzleDatabase>(
		db,
		driver,
	) as DrizzleSql<Schema, TM, Opts>;
}
