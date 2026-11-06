import type { DIALECT, DialectBrand, StrictSql } from "../../dialect.js";
import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { Transactional } from "../../transaction.js";
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
	/** This `sql` with `plugin` after its plugins. */
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): Sql<DB, TM, [...Plugins, P]>;
}

export interface MariaDbSql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends StrictSql<SqlApi<MariaDbEngine, DB, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"mariadb", DB, TM, Plugins>;
	/** The database this `sql` runs on: `"mariadb"`. */
	readonly dialect: "mariadb";
	/** This `sql` with `plugin` after its plugins. */
	withPlugin<const P extends SqlPlugin>(
		plugin: P,
	): MariaDbSql<DB, TM, [...Plugins, P]>;
}

/** An `sql` with `transaction(fn)`, as adapters create it. */
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
