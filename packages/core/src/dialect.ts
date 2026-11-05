import type { SqlError } from "./errors.js";
import type { SqlPlugin } from "./plugin.js";

/**
 * Type-only key of a dialect's `Sql` interface. Its value names the dialect
 * and holds the schema, type map and plugins invariantly, so two `sql`s
 * compare by this one property: a PostgreSQL `sql` is not a SQLite one, and
 * an `sql` for one schema is not one for another, without relating every
 * overloaded member (which is too deep, and too loose for generic members).
 */
export declare const DIALECT: unique symbol;

export type DialectBrand<Name extends string, DB, TM, Plugins> = {
	readonly name: Name;
	readonly inputs: (inputs: [DB, TM, Plugins]) => [DB, TM, Plugins];
};

export type StrictNullChecksMessage =
	"TypeSQL requires strictNullChecks: set strict or strictNullChecks to true in tsconfig.json";

/**
 * What an `sql` is without strictNullChecks: every call is an error saying
 * so, members included. Without it `null` and `undefined` belong to every
 * type, so nullability cannot be inferred and the checks instantiate too
 * deeply (TS2589).
 */
interface NonStrictSql {
	(
		query: SqlError<StrictNullChecksMessage, null>,
		...params: readonly unknown[]
	): any;
	readonly [member: string]: NonStrictSql;
}

/**
 * `Api` with strictNullChecks on, and NonStrictSql without it.
 * `null extends string` holds only without strictNullChecks; it involves no
 * type parameter, so TypeScript resolves it once, where it is declared, and
 * it costs nothing per query.
 */
export type StrictSql<Api> = null extends string ? NonStrictSql : Api;

export interface DialectTypes {
	readonly typeMap: unknown;
	readonly db: unknown;
	readonly tm: unknown;
	// SqlInputs constrains this slot; keeping it unknown preserves exact plugin tuples.
	readonly plugins: unknown;
	readonly ddl: string;
	readonly sql: unknown;
	readonly transactionalSql: unknown;
	readonly validateDdl: unknown;
	readonly applyDdl: unknown;
}

type SqlInputs<DB, TM, Plugins extends readonly SqlPlugin[]> = {
	readonly db: DB;
	readonly tm: TM;
	readonly plugins: Plugins;
};

type DdlInputs<DB, Q extends string> = { readonly db: DB; readonly ddl: Q };

export type SqlOf<
	T extends DialectTypes,
	DB,
	TM,
	Plugins extends readonly SqlPlugin[] = [],
> = (T & SqlInputs<DB, TM, Plugins>)["sql"];

export type TransactionalSqlOf<
	T extends DialectTypes,
	DB,
	TM,
	Plugins extends readonly SqlPlugin[] = [],
> = (T & SqlInputs<DB, TM, Plugins>)["transactionalSql"];

export type ValidateDdlOf<T extends DialectTypes, DB, Q extends string> = (T &
	DdlInputs<DB, Q>)["validateDdl"];

export type ApplyDdlOf<T extends DialectTypes, DB, Q extends string> = (T &
	DdlInputs<DB, Q>)["applyDdl"];

export interface Dialect<T extends DialectTypes = DialectTypes> {
	readonly name: string;
	readonly types?: T;
	readonly valuesDefault?: boolean;
	/** The identifier quote `sql.id`, `sql.set` and `sql.values` write; default `"`. */
	readonly quote?: '"' | "`";
	/** What `sql.values` writes for a row of defaults; default `DEFAULT VALUES`. */
	readonly emptyRow?: string;
}
