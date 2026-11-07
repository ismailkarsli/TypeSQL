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
	driver,
	executor,
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
	TM = PgTypeMap,
> = TransactionalSql<DB, TM, Plugins>;

/**
 * `TM` is the type map of the rows the client returns: `PgTypeMap`, pg's
 * defaults, or one for the type parsers the client sets.
 */
export function createSql<DB, TM = PgTypeMap>(
	client?: PgQueryable,
): PgSql<DB, [], TM> {
	return createTransactionalSql<Postgres, DB, TM, PgQueryable>(
		postgres,
		client,
		driver,
	);
}
