import {
	createTransactionalSql,
	type RowKeys,
	type SqlOptions,
	type TransactionalSql,
} from "@typesql/core";
import { driver, type PostgresJsQueryable } from "./client.js";
import type { PostgresJsBigIntTypeMap, PostgresJsTypeMap } from "./type-map.js";

export {
	type Executor,
	NoResultError,
	type TransactionalSql,
} from "@typesql/core";
export {
	executor,
	type MigrationSource,
	migrate,
	type PostgresJsQueryable,
	type PostgresJsRows,
	type PostgresJsTransactable,
} from "./client.js";
export type {
	PostgresJsBigIntTypeMap,
	PostgresJsParamTypeMap,
	PostgresJsTypeMap,
} from "./type-map.js";

/** What `createSql<DB>(sql)` returns: core's `Sql` under `PostgresJsTypeMap`, with `transaction(fn)`. */
export type PostgresJsSql<
	DB,
	Keys extends RowKeys = "preserve",
> = TransactionalSql<DB, PostgresJsTypeMap, Keys>;
/** What `createBigIntSql<DB>(sql)` returns: core's `Sql` under `PostgresJsBigIntTypeMap`, with `transaction(fn)`. */
export type PostgresJsBigIntSql<
	DB,
	Keys extends RowKeys = "preserve",
> = TransactionalSql<DB, PostgresJsBigIntTypeMap, Keys>;

/**
 * `createSql<DB>()` from core, pre-bound to `PostgresJsTypeMap` (default parsers: `int8` and `count(*)` are `string`).
 * The queries' `execute*` methods run on the postgres.js `sql` instance (or a `TransactionSql`,
 * `ReservedSql`), and `sql.transaction(fn)` runs `fn` with a `sql` bound to one transaction.
 * `{ rowKeys: "camelCase" }` camelCases the rows' keys, in the types and at runtime.
 */
export function createSql<DB>(
	sql: PostgresJsQueryable | undefined,
	options: { readonly rowKeys: "camelCase" },
): PostgresJsSql<DB, "camelCase">;
export function createSql<DB>(
	sql?: PostgresJsQueryable,
	options?: { readonly rowKeys?: "preserve" },
): PostgresJsSql<DB>;
export function createSql<DB>(
	sql?: PostgresJsQueryable,
	options?: SqlOptions,
): PostgresJsSql<DB, RowKeys> {
	return createTransactionalSql<DB, PostgresJsTypeMap, PostgresJsQueryable>(
		sql,
		driver,
		options,
	);
}

/** For `postgres({ types: { bigint: postgres.BigInt } })` connections: `int8` and `count(*)` are `bigint`. */
export function createBigIntSql<DB>(
	sql: PostgresJsQueryable | undefined,
	options: { readonly rowKeys: "camelCase" },
): PostgresJsBigIntSql<DB, "camelCase">;
export function createBigIntSql<DB>(
	sql?: PostgresJsQueryable,
	options?: { readonly rowKeys?: "preserve" },
): PostgresJsBigIntSql<DB>;
export function createBigIntSql<DB>(
	sql?: PostgresJsQueryable,
	options?: SqlOptions,
): PostgresJsBigIntSql<DB, RowKeys> {
	return createTransactionalSql<
		DB,
		PostgresJsBigIntTypeMap,
		PostgresJsQueryable
	>(sql, driver, options);
}
