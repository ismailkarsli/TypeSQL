import { mariadb, mysql } from "./mysql.js";
import { postgres } from "./postgres.js";
import type { MigratorDialect } from "./session.js";
import { sqlite } from "./sqlite.js";

/** The dialects migrations run on: every list of them is this record's keys. */
export const DIALECTS = {
	postgres,
	sqlite,
	mysql,
	mariadb,
} as const satisfies Readonly<Record<string, MigratorDialect>>;

/** The name of a dialect migrations run on. */
export type DialectName = keyof typeof DIALECTS;

export const isDialectName = (value: unknown): value is DialectName =>
	typeof value === "string" && Object.hasOwn(DIALECTS, value);

/** "postgres, sqlite, mysql or mariadb". */
export const DIALECT_LIST = Object.keys(DIALECTS)
	.join(", ")
	.replace(/, (?=[^,]*$)/, " or ");
