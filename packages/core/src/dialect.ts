import type { SqlPlugin } from "./plugin.js";

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
}
