import type { Dialect, DialectTypes } from "../dialect.js";
import type { Executor } from "../query.js";
import type { RowKeys, SqlOptions } from "../row-keys.js";
import type { Transactional } from "../transaction.js";
import type { ApplyDdl } from "./engine/infer.js";
import type { ValidateDdl } from "./migrations.js";
import type { Sql } from "./sql/types.js";
import type { DefaultTypeMap } from "./type-map/index.js";

export interface Sqlite extends DialectTypes {
	readonly typeMap: DefaultTypeMap;
	readonly sql: Sql<this["db"], this["tm"], this["keys"]>;
	readonly transactionalSql: TransactionalSql<
		this["db"],
		this["tm"],
		this["keys"]
	>;
	readonly validateDdl: ValidateDdl<this["db"], this["ddl"]>;
	readonly applyDdl: ApplyDdl<this["db"], this["ddl"]>;
}

export interface TransactionalSql<DB, TM, Keys extends RowKeys = "preserve">
	extends Sql<DB, TM, Keys>,
		Transactional<TransactionalSql<DB, TM, Keys>> {}

export interface SqliteDialect extends Dialect<Sqlite> {
	readonly name: "sqlite";
}

declare module "../create-sql.js" {
	interface CreateSql {
		<DB, TM = DefaultTypeMap>(
			dialect: SqliteDialect,
			executor: Executor | undefined,
			options: SqlOptions & { readonly rowKeys: "camelCase" },
		): Sql<DB, TM, "camelCase">;
		<DB, TM = DefaultTypeMap>(
			dialect: SqliteDialect,
			executor?: Executor,
			options?: SqlOptions & { readonly rowKeys?: "preserve" },
		): Sql<DB, TM>;
	}
}

export const sqlite: SqliteDialect = {
	name: "sqlite",
	valuesDefault: false,
};
