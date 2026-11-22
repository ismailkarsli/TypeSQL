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
	type RowStream,
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

/** The callback connection under a mysql2/promise connection, which streams. */
interface Mysql2Core {
	query(sql: string, values: MySqlValue[]): { stream(): RowStream };
}

const hasCore = (
	client: Mysql2Queryable,
): client is Mysql2Queryable & { readonly connection: Mysql2Core } =>
	"connection" in client &&
	typeof client.connection === "object" &&
	client.connection !== null &&
	"query" in client.connection &&
	typeof client.connection.query === "function";

const runner: Runner<Mysql2Queryable> = {
	query: async (client, text, values) =>
		mysqlResult((await client.query(text, values))[0]),
	execute: async (client, text, values) =>
		mysqlResult((await client.execute(text, values))[0]),
	stream: (conn, text, values) =>
		hasCore(conn) ? conn.connection.query(text, values).stream() : undefined,
};

export const driver: SqlDriver<Mysql2Queryable> = poolDriver(runner, "mysql2");

export function executor(client: Mysql2Queryable): Executor {
	return executorOf(runner, client);
}
