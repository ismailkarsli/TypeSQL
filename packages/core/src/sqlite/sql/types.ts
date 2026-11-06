import type { DIALECT, DialectBrand, StrictSql } from "../../dialect.js";
import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { Transactional } from "../../transaction.js";
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
	/** This `sql` with `plugin` after its plugins. */
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): Sql<DB, TM, [...Plugins, P]>;
}

/** An `sql` with `transaction(fn)`, as adapters create it. */
export interface TransactionalSql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends Sql<DB, TM, Plugins>,
		Transactional<TransactionalSql<DB, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"sqlite", DB, TM, Plugins>;
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): TransactionalSql<DB, TM, [...Plugins, P]>;
}
