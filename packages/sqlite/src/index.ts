import type { RowKeys, SqlOptions } from "@typesql/core";
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
	Keys extends RowKeys = "preserve",
	TM = DefaultTypeMap,
> = TransactionalSql<DB, TM, Keys>;

export function createSql<DB>(
	db: SqliteDatabase | undefined,
	options: { readonly rowKeys: "camelCase"; readonly bigint: true },
): SqliteSql<DB, "camelCase", BigIntTypeMap>;
export function createSql<DB>(
	db: SqliteDatabase | undefined,
	options: { readonly rowKeys?: "preserve"; readonly bigint: true },
): SqliteSql<DB, "preserve", BigIntTypeMap>;
export function createSql<DB>(
	db: SqliteDatabase | undefined,
	options: { readonly rowKeys: "camelCase"; readonly bigint?: false },
): SqliteSql<DB, "camelCase">;
export function createSql<DB>(
	db?: SqliteDatabase,
	options?: { readonly rowKeys?: "preserve"; readonly bigint?: false },
): SqliteSql<DB>;
export function createSql<DB>(
	db?: SqliteDatabase,
	options?: SqlOptions & { readonly bigint?: boolean },
): SqliteSql<DB, RowKeys, DefaultTypeMap | BigIntTypeMap> {
	return createTransactionalSql<Sqlite, DB, DefaultTypeMap, SqliteDatabase>(
		sqlite,
		db,
		driver({ bigint: options?.bigint === true }),
		options,
	);
}
