import type { Dialect, DialectTypes } from "../dialect.js";
import type { SqlPlugin } from "../plugin.js";
import type { Executor } from "../query.js";
import type { Transactional } from "../transaction.js";
import type { ApplyDdl } from "./engine/infer.js";
import type { ValidateDdl } from "./migrations.js";
import type { Sql } from "./sql/types.js";
import type { DefaultTypeMap } from "./type-map/index.js";

export interface Postgres extends DialectTypes {
	readonly typeMap: DefaultTypeMap;
	readonly sql: Sql<
		this["db"],
		this["tm"],
		this["plugins"] extends readonly SqlPlugin[] ? this["plugins"] : []
	>;
	readonly transactionalSql: TransactionalSql<
		this["db"],
		this["tm"],
		this["plugins"] extends readonly SqlPlugin[] ? this["plugins"] : []
	>;
	readonly validateDdl: ValidateDdl<this["db"], this["ddl"]>;
	readonly applyDdl: ApplyDdl<this["db"], this["ddl"]>;
}

export interface TransactionalSql<
	DB,
	TM,
	Plugins extends readonly SqlPlugin[] = [],
> extends Sql<DB, TM, Plugins>,
		Transactional<TransactionalSql<DB, TM, Plugins>> {
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): TransactionalSql<DB, TM, [...Plugins, P]>;
}

export interface PostgresDialect extends Dialect<Postgres> {
	readonly name: "postgres";
}

declare module "../create-sql.js" {
	interface CreateSql {
		// biome-ignore lint/style/useShorthandFunctionType: Dialects merge signatures into this interface.
		<DB, TM = DefaultTypeMap>(
			dialect: PostgresDialect,
			executor?: Executor,
		): Sql<DB, TM>;
	}
}

export const postgres: PostgresDialect = {
	name: "postgres",
};
