import type {
	FromKyselyOf,
	KyselyDialect,
	KyselyOptions,
	KyselyOverrides,
} from "./from-kysely.js";

/**
 * SQLite's reading of a kysely-codegen schema. A `"schema.table"` key is a
 * table of an attached database, except for `main` and `temp`.
 */
interface SqliteDialect extends KyselyDialect {
	readonly name: "sqlite";
	readonly defaultSchema: "main" | "temp";
	readonly registry: never;
	readonly unknown: "any";
	readonly never: "text";
	readonly string: "text";
	readonly numberString: "numeric";
	readonly bigintString: "integer";
	readonly literals: "text";
	readonly number: "numeric";
	readonly bigint: "integer";
	readonly boolean: "boolean";
	readonly date: "datetime";
	readonly bytes: "blob";
}

export type FromKyselySqlite<
	DB,
	Overrides extends KyselyOverrides = {},
	Options extends KyselyOptions = {},
> = FromKyselyOf<DB, Overrides, Options, SqliteDialect>;
