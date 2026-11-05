import type { SqlPlugin } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
import {
	type DefaultTypeMap,
	type MariaDb,
	type MariaDbTransactionalSql,
	type MySql,
	type Mysql2MariaDbTypeMap,
	mariadb,
	mysql,
	type TransactionalSql,
} from "@typesql/core/mysql";
import { driver, type Mysql2Queryable } from "./mysql2.js";

export { executor, type Mysql2Queryable } from "./mysql2.js";

export type MySqlSql<
	DB,
	TM = DefaultTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = TransactionalSql<DB, TM, Plugins>;

export type MariaDbSql<
	DB,
	TM = Mysql2MariaDbTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = MariaDbTransactionalSql<DB, TM, Plugins>;

export interface CreateSqlOptions {
	/** The server's SQL dialect (default `"mysql"`). */
	readonly dialect?: "mysql" | "mariadb";
}

/**
 * `TM` is the type map of the rows mysql2 returns; pass `BigNumberStringsTypeMap`
 * or `DateStringsTypeMap` from `@typesql/core/mysql` to match the pool's
 * `bigNumberStrings` or `dateStrings` option.
 */
export function createSql<DB, TM = Mysql2MariaDbTypeMap>(
	client: Mysql2Queryable | undefined,
	options: { readonly dialect: "mariadb" },
): MariaDbSql<DB, TM>;
export function createSql<DB, TM = DefaultTypeMap>(
	client?: Mysql2Queryable,
	options?: { readonly dialect?: "mysql" },
): MySqlSql<DB, TM>;
export function createSql<DB, TM>(
	client?: Mysql2Queryable,
	options?: CreateSqlOptions,
): MySqlSql<DB, TM> | MariaDbSql<DB, TM> {
	return options?.dialect === "mariadb"
		? createTransactionalSql<MariaDb, DB, TM, Mysql2Queryable>(
				mariadb,
				client,
				driver,
			)
		: createTransactionalSql<MySql, DB, TM, Mysql2Queryable>(
				mysql,
				client,
				driver,
			);
}
