import type { RowKeys, SqlOptions } from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
import type {
	DefaultTypeMap,
	PostgresDialect,
	TransactionalSql,
} from "@typesql/core/postgres";
import type { ControlledTransaction, Kysely, Transaction } from "kysely";
import { driver, type KyselyExecutor } from "./client.js";
import type {
	FromKysely,
	KyselyOptions,
	KyselyOverrides,
} from "./from-kysely.js";

export { executor, type KyselyExecutor } from "./client.js";
export type {
	ColumnOverride,
	FromKysely,
	InferColumn,
	KyselyOptions,
	KyselyOverrides,
	SnakeCase,
	TableOverride,
} from "./from-kysely.js";

export type KyselySql<
	DB,
	TM = DefaultTypeMap,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
	Keys extends RowKeys = "preserve",
> = TransactionalSql<FromKysely<DB, Overrides, Options>, TM, Keys>;

export type KyselyDB<K> =
	K extends ControlledTransaction<infer DB, any>
		? DB
		: K extends Transaction<infer DB>
			? DB
			: K extends Kysely<infer DB>
				? DB
				: never;

export function createSql<K extends KyselyExecutor & Kysely<any>>(
	dialect: PostgresDialect,
	db: K,
	options: { readonly rowKeys: "camelCase" },
): KyselySql<KyselyDB<K>, DefaultTypeMap, {}, {}, "camelCase">;
export function createSql<K extends KyselyExecutor & Kysely<any>>(
	dialect: PostgresDialect,
	db: K,
	options?: { readonly rowKeys?: "preserve" },
): KyselySql<KyselyDB<K>>;
export function createSql<
	DB,
	TM = DefaultTypeMap,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
>(
	dialect: PostgresDialect,
	db: KyselyExecutor | undefined,
	options: { readonly rowKeys: "camelCase" },
): KyselySql<DB, TM, Overrides, Options, "camelCase">;
export function createSql<
	DB,
	TM = DefaultTypeMap,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
>(
	dialect: PostgresDialect,
	db?: KyselyExecutor,
	options?: { readonly rowKeys?: "preserve" },
): KyselySql<DB, TM, Overrides, Options>;
export function createSql(
	dialect: PostgresDialect,
	db?: KyselyExecutor,
	options?: SqlOptions,
): unknown {
	return createTransactionalSql(dialect, db, driver, options);
}
