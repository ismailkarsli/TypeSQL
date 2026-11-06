import type {
	FromKyselyOf,
	KyselyDialect,
	KyselyOptions,
	KyselyOverrides,
} from "./from-kysely.js";

/**
 * MySQL's reading of a kysely-codegen schema, which types ENUM columns as
 * unions of their values, BIGINT and DECIMAL as strings that insert from
 * numbers, and JSON as `unknown`. A `"db.table"` key is a table of another
 * database: MySQL has no default schema.
 */
interface MysqlDialect extends KyselyDialect {
	readonly name: "mysql";
	readonly defaultSchema: never;
	readonly registry: never;
	readonly unknown: "json";
	readonly never: "varchar";
	readonly string: "varchar";
	readonly numberString: "decimal";
	readonly bigintString: "bigint";
	readonly literals: "enum";
	readonly number: "int";
	readonly bigint: "bigint";
	readonly boolean: "tinyint";
	readonly date: "datetime";
	readonly bytes: "blob";
}

export type FromKyselyMysql<
	DB,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
> = FromKyselyOf<DB, Overrides, Options, MysqlDialect>;
