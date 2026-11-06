import { mysqlPositional } from "./mysql/driver.js";
import type { PositionalStatement } from "./runtime/compile.js";
import { positional } from "./sqlite/driver.js";

/**
 * The dialects whose statements a driver writes alike: MariaDB's are
 * MySQL's.
 */
export type DialectFamily = "postgres" | "sqlite" | "mysql";

/** The family of the dialect named `name`; PostgreSQL's for any other. */
export const dialectFamily = (name: string): DialectFamily =>
	name === "sqlite"
		? name
		: name === "mysql" || name === "mariadb"
			? "mysql"
			: "postgres";

/**
 * A statement as a driver of each family takes it: PostgreSQL's keeps its
 * `$n` parameters, SQLite's and MySQL's have `?` with the values in order.
 * `map` converts each value for the driver; without it, PostgreSQL's are
 * sent as they are, and SQLite's and MySQL's as sqliteValue and mysqlValue
 * convert them.
 */
export const familyStatement: Readonly<
	Record<
		DialectFamily,
		<V, R>(
			text: string,
			values: readonly V[],
			map?: (value: V | undefined) => R,
		) => PositionalStatement
	>
> = {
	postgres: (text, values, map) => ({
		text,
		values: map ? values.map(map) : [...values],
	}),
	sqlite: positional,
	mysql: mysqlPositional,
};
