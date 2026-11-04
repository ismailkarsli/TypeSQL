import type { DIALECT, DialectBrand, StrictSql } from "../../dialect.js";
import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { PgEngine } from "../engine/engine.js";
import type { NormalizeSchema } from "../schema/normalize.js";

// An `sql` for one schema, type map or plugin list is not one for another.
// The parameters are declared invariant because TypeScript cannot measure
// their variance through the conditional types that read them, and the
// [DIALECT] brand carries them for structural comparisons (a TransactionalSql
// against an Sql).
export interface Sql<
	in out DB,
	in out TM,
	in out Plugins extends readonly SqlPlugin[] = [],
> extends StrictSql<SqlApi<PgEngine, NormalizeSchema<DB>, TM, Plugins>> {
	readonly [DIALECT]?: DialectBrand<"postgres", DB, TM, Plugins>;
	/** The database this `sql` runs on: `"postgres"`. */
	readonly dialect: "postgres";
}
