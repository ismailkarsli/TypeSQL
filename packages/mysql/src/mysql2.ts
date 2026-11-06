import type { Executor } from "@typesql/core";
import {
	type MySqlResult,
	type MySqlValue,
	mysqlResult,
	type SqlDriver,
} from "@typesql/core/adapter";
import {
	executor as executorOf,
	driver as poolDriver,
	type Runner,
} from "./pool.js";

/** A `mysql2/promise` Pool, PoolConnection or Connection. */
export interface Mysql2Queryable {
	query(
		sql: string,
		values?: MySqlValue[],
	): Promise<readonly [MySqlResult, unknown]>;
	execute(
		sql: string,
		values?: MySqlValue[],
	): Promise<readonly [MySqlResult, unknown]>;
}

const runner: Runner<Mysql2Queryable> = {
	query: async (client, text, values) =>
		mysqlResult((await client.query(text, values))[0]),
	execute: async (client, text, values) =>
		mysqlResult((await client.execute(text, values))[0]),
};

export const driver: SqlDriver<Mysql2Queryable> = poolDriver(runner, "mysql2");

export function executor(client: Mysql2Queryable): Executor {
	return executorOf(runner, client);
}
