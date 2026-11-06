import type { DdlCheck, Dialect, DialectTypes, PluginsOf } from "../dialect.js";
import type { Executor } from "../query.js";
import type { ApplyDdl } from "./engine/infer.js";
import type { Sql, TransactionalSql } from "./sql/types.js";
import type { DefaultTypeMap } from "./type-map/index.js";

export interface Postgres extends DialectTypes {
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
export type ValidateDdl<DB, Q extends string> = DdlCheck<Postgres, DB, Q>;

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
	// E'' strings take backslash escapes, block comments nest, and $tag$
	// quotes a string up to the same tag. `$` belongs to a name after its
	// first character, so `x$1` and `a$b$` are names. PgLexis states these
	// rules for the types.
	lexis:
		/(?<![\w$])\$(\d+)|(?<![\w$])[Ee]'(?:[^'\\]|\\[\s\S]|'')*'?|'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*|(?<![\w$])(?<q>\$(?:[A-Za-z_]\w*)?\$)[\s\S]*?(?:\k<q>|$)/
			.source,
};
