import type { RowKeys } from "./row-keys.js";

export interface DialectTypes {
	readonly typeMap: unknown;
	readonly db: unknown;
	readonly tm: unknown;
	readonly keys: RowKeys;
	readonly ddl: string;
	readonly sql: unknown;
	readonly transactionalSql: unknown;
	readonly validateDdl: unknown;
	readonly applyDdl: unknown;
}

type SqlInputs<DB, TM, Keys extends RowKeys> = {
	readonly db: DB;
	readonly tm: TM;
	readonly keys: Keys;
};

type DdlInputs<DB, Q extends string> = { readonly db: DB; readonly ddl: Q };

export type SqlOf<
	T extends DialectTypes,
	DB,
	TM,
	Keys extends RowKeys = "preserve",
> = (T & SqlInputs<DB, TM, Keys>)["sql"];

export type TransactionalSqlOf<
	T extends DialectTypes,
	DB,
	TM,
	Keys extends RowKeys = "preserve",
> = (T & SqlInputs<DB, TM, Keys>)["transactionalSql"];

export type ValidateDdlOf<T extends DialectTypes, DB, Q extends string> = (T &
	DdlInputs<DB, Q>)["validateDdl"];

export type ApplyDdlOf<T extends DialectTypes, DB, Q extends string> = (T &
	DdlInputs<DB, Q>)["applyDdl"];

export interface Dialect<T extends DialectTypes = DialectTypes> {
	readonly name: string;
	readonly types?: T;
}
