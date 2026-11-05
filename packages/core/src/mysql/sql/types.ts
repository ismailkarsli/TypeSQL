import type { DIALECT, DialectBrand, StrictSql } from "../../dialect.js";
import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { MariaDbEngine, MySqlEngine } from "../engine/engine.js";

// Invariant parameters and the [DIALECT] brand: see the PostgreSQL Sql.
export interface Sql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends StrictSql<SqlApi<MySqlEngine, DB, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"mysql", DB, TM, Plugins>;
	/** The database this `sql` runs on: `"mysql"`. */
	readonly dialect: "mysql";
}

export interface MariaDbSql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends StrictSql<SqlApi<MariaDbEngine, DB, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"mariadb", DB, TM, Plugins>;
	/** The database this `sql` runs on: `"mariadb"`. */
	readonly dialect: "mariadb";
}
