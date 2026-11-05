import type { Executor, SqlPlugin } from "@typesql/core";
import { createTransactionalSql, type SqlDriver } from "@typesql/core/adapter";
import {
	type MariaDb,
	type MariaDbTransactionalSql,
	type MariaDbTypeMap,
	type MySql,
	mariadb,
	mysql,
	type TransactionalSql,
} from "@typesql/core/mysql";
import {
	type DriverResult,
	executor as executorOf,
	type MySqlValue,
	driver as poolDriver,
	type Runner,
	resultOf,
} from "./pool.js";

/** A `mariadb` Pool, PoolConnection or Connection (the promise API). */
export interface MariaDbQueryable {
	query(sql: string, values?: MySqlValue[]): Promise<DriverResult>;
	execute(sql: string, values?: MySqlValue[]): Promise<DriverResult>;
}

const runner: Runner<MariaDbQueryable> = {
	query: async (client, text, values) =>
		resultOf(await client.query(text, values)),
	execute: async (client, text, values) =>
		resultOf(await client.execute(text, values)),
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
				mysql,
				client,
				driver,
			)
		: createTransactionalSql<MariaDb, DB, TM, MariaDbQueryable>(
				mariadb,
				client,
				driver,
			);
}
