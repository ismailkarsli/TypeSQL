import type { DIALECT, DialectBrand, StrictSql } from "../../dialect.js";
import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { SqliteEngine } from "../engine/engine.js";

// Invariant parameters and the [DIALECT] brand: see the PostgreSQL Sql.
export interface Sql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends StrictSql<SqlApi<SqliteEngine, DB, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"sqlite", DB, TM, Plugins>;
	/** The database this `sql` runs on: `"sqlite"`. */
	readonly dialect: "sqlite";
}
