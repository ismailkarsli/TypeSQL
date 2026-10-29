import type { RowKeys, SqlOptions, TransactionalSql } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
import { driver, type PostgresJsQueryable } from "./client.js";
import type { PostgresJsBigIntTypeMap, PostgresJsTypeMap } from "./type-map.js";

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

export type PostgresJsSql<
	DB,
	Keys extends RowKeys = "preserve",
	TM = PostgresJsTypeMap,
> = TransactionalSql<DB, TM, Keys>;

interface PostgresJsSqlOptions extends SqlOptions {
	readonly bigint?: boolean;
}

export function createSql<DB>(
	sql: PostgresJsQueryable | undefined,
	options: { readonly rowKeys: "camelCase"; readonly bigint: true },
): PostgresJsSql<DB, "camelCase", PostgresJsBigIntTypeMap>;
export function createSql<DB>(
	sql: PostgresJsQueryable | undefined,
	options: { readonly rowKeys?: "preserve"; readonly bigint: true },
): PostgresJsSql<DB, "preserve", PostgresJsBigIntTypeMap>;
export function createSql<DB>(
	sql: PostgresJsQueryable | undefined,
	options: { readonly rowKeys: "camelCase"; readonly bigint?: false },
): PostgresJsSql<DB, "camelCase">;
export function createSql<DB>(
	sql?: PostgresJsQueryable,
	options?: { readonly rowKeys?: "preserve"; readonly bigint?: false },
): PostgresJsSql<DB>;
export function createSql<DB>(
	sql?: PostgresJsQueryable,
	options?: PostgresJsSqlOptions,
): PostgresJsSql<DB, RowKeys, PostgresJsTypeMap | PostgresJsBigIntTypeMap> {
	return createTransactionalSql<DB, PostgresJsTypeMap, PostgresJsQueryable>(
		sql,
		driver,
		options,
	);
}
