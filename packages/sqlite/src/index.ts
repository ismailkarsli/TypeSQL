import type { SqlPlugin } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
import {
	type BigIntTypeMap,
	type DefaultTypeMap,
	type Sqlite,
	sqlite,
	type TransactionalSql,
} from "@typesql/core/sqlite";
import { driver, type SqliteDatabase } from "./client.js";

export {
	type ExecutorOptions,
	executor,
	type MigrationSource,
	migrate,
	type SqliteDatabase,
	type SqliteStatement,
} from "./client.js";

export type SqliteSql<
	DB,
	TM = DefaultTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = TransactionalSql<DB, TM, Plugins>;

export function createSql<DB>(
	client: SqliteDatabase | undefined,
	options: { readonly bigint: true },
): SqliteSql<DB, BigIntTypeMap>;
export function createSql<DB>(
	client?: SqliteDatabase,
	options?: { readonly bigint?: false },
): SqliteSql<DB>;
export function createSql<DB>(
	client?: SqliteDatabase,
	options?: { readonly bigint?: boolean },
): SqliteSql<DB, DefaultTypeMap | BigIntTypeMap> {
	return createTransactionalSql<Sqlite, DB, DefaultTypeMap, SqliteDatabase>(
		sqlite,
		client,
		driver({ bigint: options?.bigint === true }),
	);
}
