import type { SqlPlugin } from "@typesql/core";
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

export type PgSql<
	DB,
	Plugins extends readonly SqlPlugin[] = [],
> = TransactionalSql<DB, PgTypeMap, Plugins>;

export function createSql<DB>(client?: PgQueryable): PgSql<DB> {
	return createTransactionalSql<Postgres, DB, PgTypeMap, PgQueryable>(
		postgres,
		client,
		driver,
	);
}
