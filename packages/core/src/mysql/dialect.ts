import type {
	DIALECT,
	Dialect,
	DialectBrand,
	DialectTypes,
} from "../dialect.js";
import type { SqlPlugin } from "../plugin.js";
import type { Executor } from "../query.js";
import type { Transactional } from "../transaction.js";
import type { ApplyDdl } from "./engine/infer.js";
import type { ValidateDdl } from "./migrations.js";
import type { MariaDbSql, Sql } from "./sql/types.js";
import type { DefaultTypeMap, MariaDbTypeMap } from "./type-map/index.js";

type PluginsOf<P> = P extends readonly SqlPlugin[] ? P : [];

export interface MySql extends DialectTypes {
	readonly typeMap: DefaultTypeMap;
	readonly sql: Sql<this["db"], this["tm"], PluginsOf<this["plugins"]>>;
	readonly transactionalSql: TransactionalSql<
		this["db"],
		this["tm"],
		PluginsOf<this["plugins"]>
	>;
	readonly validateDdl: ValidateDdl<this["db"], this["ddl"]>;
	readonly applyDdl: ApplyDdl<this["db"], this["ddl"]>;
}

export interface MariaDb extends DialectTypes {
	readonly typeMap: MariaDbTypeMap;
	readonly sql: MariaDbSql<this["db"], this["tm"], PluginsOf<this["plugins"]>>;
	readonly transactionalSql: MariaDbTransactionalSql<
		this["db"],
		this["tm"],
		PluginsOf<this["plugins"]>
	>;
	readonly validateDdl: ValidateDdl<this["db"], this["ddl"]>;
	readonly applyDdl: ApplyDdl<this["db"], this["ddl"]>;
}

// Invariant parameters, as on Sql.
export interface TransactionalSql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends Sql<DB, TM, Plugins>,
		Transactional<TransactionalSql<DB, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"mysql", DB, TM, Plugins>;
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): TransactionalSql<DB, TM, [...Plugins, P]>;
}

export interface MariaDbTransactionalSql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends MariaDbSql<DB, TM, Plugins>,
		Transactional<MariaDbTransactionalSql<DB, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"mariadb", DB, TM, Plugins>;
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): MariaDbTransactionalSql<DB, TM, [...Plugins, P]>;
}

/** MySQL and the servers that speak its dialect: Amazon Aurora, PlanetScale, TiDB, Google Cloud SQL, Azure. */
export interface MySqlDialect extends Dialect<MySql> {
	readonly name: "mysql";
}

export interface MariaDbDialect extends Dialect<MariaDb> {
	readonly name: "mariadb";
}

declare module "../create-sql.js" {
	interface CreateSql {
		// biome-ignore lint/style/useShorthandFunctionType: Dialects merge signatures into this interface.
		<DB, TM = DefaultTypeMap>(
			dialect: MySqlDialect,
			executor?: Executor,
		): Sql<DB, TM>;
		<DB, TM = MariaDbTypeMap>(
			dialect: MariaDbDialect,
			executor?: Executor,
		): MariaDbSql<DB, TM>;
	}
}

export const mysql: MySqlDialect = {
	name: "mysql",
	quote: "`",
	emptyRow: "() VALUES ()",
};

export const mariadb: MariaDbDialect = {
	name: "mariadb",
	quote: "`",
	emptyRow: "() VALUES ()",
};
