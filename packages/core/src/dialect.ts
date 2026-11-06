import type { AnyErr, SqlError } from "./errors.js";
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

/**
 * What the brand of every `sql` of dialect `Name` with `Plugins`, for any
 * schema and type map, is assignable to.
 */
export type AnyDialectBrand<Name extends string, Plugins = []> = {
	readonly name: Name;
	readonly inputs: (
		inputs: [never, never, Plugins],
	) => [unknown, unknown, Plugins];
};

type StrictNullChecksMessage =
	"TypeSQL requires strictNullChecks: set strict or strictNullChecks to true in tsconfig.json";

/**
 * The error every statement is without strictNullChecks, and `never` with
 * it. `null extends string` holds only without strictNullChecks; it involves
 * no type parameter, so TypeScript resolves it once, where it is declared.
 */
export type NonStrict = null extends string
	? SqlError<StrictNullChecksMessage, null>
	: never;

/**
 * What an `sql` is without strictNullChecks: every call is an error saying
 * so, members included. Without it `null` and `undefined` belong to every
 * type, so nullability cannot be inferred and the checks instantiate too
 * deeply (TS2589).
 */
interface NonStrictSql {
	(query: NonStrict, ...params: readonly unknown[]): any;
	readonly [member: string]: NonStrictSql;
}

/**
 * `Api` with strictNullChecks on, and NonStrictSql without it. Like
 * NonStrict, the check is resolved once and costs nothing per query.
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

/** A dialect's `plugins` slot as its `sql` takes it: a plugin list, or none. */
export type PluginsOf<P> = P extends readonly SqlPlugin[] ? P : [];

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

/**
 * A DDL script checked in dialect `T`: the script, or its error. A `string`
 * that isn't a literal is an error before `applyDdl` reads it.
 */
export type DdlCheck<
	T extends DialectTypes,
	DB,
	Q extends string,
> = string extends Q
	? SqlError<
			"migrations need a string literal; use .raw() for SQL the type checker cannot see",
			null
		>
	: ApplyDdlOf<T, DB, Q> extends infer R
		? R extends AnyErr
			? R
			: Q
		: never;

/**
 * The runtime side of a dialect: its name and the facts of its SQL text. A
 * fact it leaves out is standard SQL's: `"` quotes names, `DEFAULT VALUES`
 * is a row of defaults, and the lexis is `LEXIS` (runtime/compile.ts).
 */
export interface Dialect<T extends DialectTypes = DialectTypes> {
	readonly name: string;
	readonly types?: T;
	/** Whether `sql.values` may write `DEFAULT` for a column a row leaves out. */
	readonly valuesDefault?: boolean;
	/** The identifier quote `sql.id`, `sql.set` and `sql.values` write. */
	readonly quote?: '"' | "`";
	/** What `sql.values` writes for a row of defaults. */
	readonly emptyRow?: string;
	/**
	 * The text that holds no parameters, as a regular expression source:
	 * strings, quoted names and comments, then a `$n` parameter, whose number
	 * is its first capture group. A bare `/*` alternative opens a block comment
	 * that nests. compile() reads `:name` parameters and inline values outside
	 * it, and the drivers' `$n` rewriters read `$n` with it. The dialect's
	 * engine states the same rules for its types (`EngineTypes["lexis"]`).
	 */
	readonly lexis?: string;
}
