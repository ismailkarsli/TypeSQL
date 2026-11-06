import type { DdlCheck, Dialect, DialectTypes, PluginsOf } from "../dialect.js";
import type { Executor } from "../query.js";
import type { ApplyDdl } from "./engine/infer.js";
import type { Sql, TransactionalSql } from "./sql/types.js";
import type { DefaultTypeMap } from "./type-map/index.js";

export interface Sqlite extends DialectTypes {
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

/** DDL script `Q` checked against schema `DB`: the script, or its error. */
export type ValidateDdl<DB, Q extends string> = DdlCheck<Sqlite, DB, Q>;

export interface SqliteDialect extends Dialect<Sqlite> {
	readonly name: "sqlite";
}

declare module "../create-sql.js" {
	interface CreateSql {
		// biome-ignore lint/style/useShorthandFunctionType: Dialects merge signatures into this interface.
		<DB, TM = DefaultTypeMap>(
			dialect: SqliteDialect,
			executor?: Executor,
		): Sql<DB, TM>;
	}
}

/**
 * SQLite's lexis (see `Dialect`): names are quoted with "", `` and [],
 * strings take no backslash escapes, and block comments don't nest. `$`
 * belongs to a name after its first character, so `x$1` is a name.
 * `SqliteLexis` states these rules for the types.
 */
export const sqliteLexis =
	/(?<![\w$])\$(\d+)|'(?:[^']|'')*'?|"(?:[^"]|"")*"?|`(?:[^`]|``)*`?|\[[^\]]*\]?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/
		.source;

export const sqlite: SqliteDialect = {
	name: "sqlite",
	// SQLite has no DEFAULT in a VALUES row.
	valuesDefault: false,
	lexis: sqliteLexis,
};
