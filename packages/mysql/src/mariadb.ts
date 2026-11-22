import type { Executor, SqlPlugin } from "@typesql/core";
import {
	createTransactionalSql,
	type MySqlResult,
	type MySqlValue,
	mysqlResult,
	type SqlDriver,
} from "@typesql/core/adapter";
import {
	type MariaDb,
	type MariaDbTransactionalSql,
	type MariaDbTypeMap,
	type MySql,
	mariadbDialect,
	mysqlDialect,
	type TransactionalSql,
} from "@typesql/core/mysql";
import {
	executor as executorOf,
	driver as poolDriver,
	type RowStream,
	type Runner,
} from "./pool.js";

/** A `mariadb` Pool, PoolConnection or Connection (the promise API). */
export interface MariaDbQueryable {
	query(sql: string, values?: MySqlValue[]): Promise<MySqlResult>;
	execute(sql: string, values?: MySqlValue[]): Promise<MySqlResult>;
}

// A connection streams; a pool does not.
const canStream = (
	conn: MariaDbQueryable,
): conn is MariaDbQueryable & {
	queryStream(sql: string, values: MySqlValue[]): RowStream;
} => "queryStream" in conn && typeof conn.queryStream === "function";

const runner: Runner<MariaDbQueryable> = {
	query: async (client, text, values) =>
		mysqlResult(await client.query(text, values)),
	execute: async (client, text, values) =>
		mysqlResult(await client.execute(text, values)),
	stream: (conn, text, values) =>
		canStream(conn) ? conn.queryStream(text, values) : undefined,
};

const driver: SqlDriver<MariaDbQueryable> = poolDriver(runner, "mariadb");

export function executor(client: MariaDbQueryable): Executor {
	return executorOf(runner, client);
}

export type MariaDbSql<
	DB,
	TM = MariaDbTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = MariaDbTransactionalSql<DB, TM, Plugins>;

export type MySqlSql<
	DB,
	TM = MariaDbTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = TransactionalSql<DB, TM, Plugins>;

export interface CreateSqlOptions {
	/** The server's SQL dialect (default `"mariadb"`); the connector also speaks to MySQL. */
	readonly dialect?: "mysql" | "mariadb";
}

export function createSql<DB, TM = MariaDbTypeMap>(
	client: MariaDbQueryable | undefined,
	options: { readonly dialect: "mysql" },
): MySqlSql<DB, TM>;
export function createSql<DB, TM = MariaDbTypeMap>(
	client?: MariaDbQueryable,
	options?: { readonly dialect?: "mariadb" },
): MariaDbSql<DB, TM>;
export function createSql<DB, TM>(
	client?: MariaDbQueryable,
	options?: CreateSqlOptions,
): MySqlSql<DB, TM> | MariaDbSql<DB, TM> {
	return options?.dialect === "mysql"
		? createTransactionalSql<MySql, DB, TM, MariaDbQueryable>(
				mysqlDialect,
				client,
				driver,
			)
		: createTransactionalSql<MariaDb, DB, TM, MariaDbQueryable>(
				mariadbDialect,
				client,
				driver,
			);
}
