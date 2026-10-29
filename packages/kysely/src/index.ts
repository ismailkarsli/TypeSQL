import type {
	DefaultTypeMap,
	RowKeys,
	SqlOptions,
	TransactionalSql,
} from "@typesql/core";
import { createTransactionalSql } from "@typesql/core/adapter";
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

export function createSql<
	DB,
	TM = DefaultTypeMap,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
>(
	db: KyselyExecutor | undefined,
	options: { readonly rowKeys: "camelCase" },
): KyselySql<DB, TM, Overrides, Options, "camelCase">;
export function createSql<
	DB,
	TM = DefaultTypeMap,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
>(
	db?: KyselyExecutor,
	options?: { readonly rowKeys?: "preserve" },
): KyselySql<DB, TM, Overrides, Options>;
export function createSql<
	DB,
	TM = DefaultTypeMap,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
>(
	db?: KyselyExecutor,
	options?: SqlOptions,
): KyselySql<DB, TM, Overrides, Options, RowKeys> {
	return createTransactionalSql<
		FromKysely<DB, Overrides, Options>,
		TM,
		KyselyExecutor
	>(db, driver, options);
}
