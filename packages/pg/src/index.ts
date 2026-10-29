import type { RowKeys, SqlOptions } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
import {
	type Postgres,
	postgres,
	type TransactionalSql,
} from "@typesql/core/postgres";
import { driver, type PgQueryable } from "./client.js";
import type { PgTypeMap } from "./type-map.js";

export {
	executor,
	type MigrationSource,
	migrate,
	type PgPoolLike,
	type PgQueryable,
	type PgQueryConfig,
	type PgResult,
	type PgTransactionClient,
} from "./client.js";
export type { PgInterval, PgParamTypeMap, PgTypeMap } from "./type-map.js";

export type PgSql<DB, Keys extends RowKeys = "preserve"> = TransactionalSql<
	DB,
	PgTypeMap,
	Keys
>;

export function createSql<DB>(
	client: PgQueryable | undefined,
	options: { readonly rowKeys: "camelCase" },
): PgSql<DB, "camelCase">;
export function createSql<DB>(
	client?: PgQueryable,
	options?: { readonly rowKeys?: "preserve" },
): PgSql<DB>;
export function createSql<DB>(
	client?: PgQueryable,
	options?: SqlOptions,
): PgSql<DB, RowKeys> {
	return createTransactionalSql<Postgres, DB, PgTypeMap, PgQueryable>(
		postgres,
		client,
		driver,
		options,
	);
}
