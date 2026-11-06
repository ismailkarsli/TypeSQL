import type { DdlCheck, Dialect, DialectTypes, PluginsOf } from "../dialect.js";
import type { Executor } from "../query.js";
import type { ApplyDdl } from "./engine/infer.js";
import type {
	MariaDbSql,
	MariaDbTransactionalSql,
	Sql,
	TransactionalSql,
} from "./sql/types.js";
import type { DefaultTypeMap, MariaDbTypeMap } from "./type-map/index.js";

export interface MySql extends DialectTypes {
	readonly typeMap: DefaultTypeMap;
	readonly sql: Sql<this["db"], this["tm"], PluginsOf<this["plugins"]>>;
	readonly transactionalSql: TransactionalSql<
		this["db"],
		this["tm"],
		PluginsOf<this["plugins"]>
	>;
	readonly validateDdl: DdlCheck<this, this["db"], this["ddl"]>;
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
	readonly validateDdl: DdlCheck<this, this["db"], this["ddl"]>;
	readonly applyDdl: ApplyDdl<this["db"], this["ddl"]>;
}

/** DDL script `Q` checked against schema `DB`: the script, or its error. */
export type ValidateDdl<DB, Q extends string> = DdlCheck<MySql, DB, Q>;

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

/**
 * MySQL's and MariaDB's lexis (see `Dialect`): strings take backslash
 * escapes, `--` starts a comment only before whitespace, `#` starts one too,
 * and block comments don't nest. `$` belongs to names, so `a$1` and `$1a`
 * are names. `MySqlLexis` states its quotes and comments for the types.
 */
export const mysqlLexis =
	/(?<![\w$])\$(\d+)(?![\w$])|'(?:[^'\\]|\\[\s\S]|'')*'?|"(?:[^"\\]|\\[\s\S]|"")*"?|`(?:[^`]|``)*`?|--(?=\s|$)[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/
		.source;

/** What MySQL and MariaDB text has in common. */
const MYSQL_TEXT = {
	quote: "`",
	emptyRow: "() VALUES ()",
	lexis: mysqlLexis,
} as const;

export const mysql: MySqlDialect = { name: "mysql", ...MYSQL_TEXT };

export const mariadb: MariaDbDialect = { name: "mariadb", ...MYSQL_TEXT };
