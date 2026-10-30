import type { SqlPlugin } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
import {
	type Postgres,
	postgres,
	type TransactionalSql,
} from "@typesql/core/postgres";
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
	TM = PostgresJsTypeMap,
	Plugins extends readonly SqlPlugin[] = [],
> = TransactionalSql<DB, TM, Plugins>;

export function createSql<DB>(
	client: PostgresJsQueryable | undefined,
	options: { readonly bigint: true },
): PostgresJsSql<DB, PostgresJsBigIntTypeMap>;
export function createSql<DB>(
	client?: PostgresJsQueryable,
	options?: { readonly bigint?: false },
): PostgresJsSql<DB>;
export function createSql<DB>(
	client?: PostgresJsQueryable,
	_options?: { readonly bigint?: boolean },
): PostgresJsSql<DB, PostgresJsTypeMap | PostgresJsBigIntTypeMap> {
	return createTransactionalSql<
		Postgres,
		DB,
		PostgresJsTypeMap,
		PostgresJsQueryable
	>(postgres, client, driver);
}
