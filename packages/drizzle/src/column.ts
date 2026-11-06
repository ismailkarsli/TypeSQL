// What the conversions read of Drizzle's types, in every dialect.

import type { ToCamelCase, ToSnakeCase } from "./casing.js";

export interface FromDrizzleOptions {
	readonly casing?: "snake_case" | "camelCase" | undefined;
	readonly timestamp?: "timestamp" | "timestamptz" | undefined;
	readonly time?: "time" | "timetz" | undefined;
}

export type ColumnLike = { readonly _: ColumnConfig };
export type ColumnConfig = {
	readonly brand: "Column";
	readonly name: string;
	readonly columnType: string;
	readonly notNull: boolean;
	readonly hasDefault: boolean;
	readonly hasRuntimeDefault: boolean;
	readonly enumValues: readonly string[] | undefined;
	readonly data: unknown;
	readonly baseColumn: unknown;
};

/** Whether a column has a database default: `$defaultFn()` runs in JavaScript. */
export type DbDefault<D extends ColumnConfig> = D["hasDefault"] extends true
	? D["hasRuntimeDefault"] extends true
		? false
		: true
	: false;

/** Whether a column is generated: it can't be written. */
export type IsGenerated<D> = D extends {
	readonly generated: { readonly type: string };
}
	? true
	: false;

export type IsAutoIncrement<D> = D extends { readonly isAutoincrement: true }
	? true
	: false;

export type Nullable<C extends ColumnConfig> = C["notNull"] extends true
	? false
	: true;

type Cased<N extends string, Opts> = Opts extends {
	readonly casing: "snake_case";
}
	? ToSnakeCase<N>
	: Opts extends { readonly casing: "camelCase" }
		? ToCamelCase<N>
		: N;

// Drizzle types an unnamed column's name as its key. Its casing setting renames
// only those; an explicit name that differs from the key is kept as written.
export type ColumnKey<C, K extends keyof C, Opts> = C[K] extends ColumnLike
	? C[K]["_"]["name"] extends K
		? Cased<C[K]["_"]["name"], Opts>
		: C[K]["_"]["name"]
	: never;

type Aliased = { readonly _: { readonly brand: "SQL.Aliased" } };
export type ViewKey<F, K extends keyof F, Opts> = F[K] extends ColumnLike
	? Cased<F[K]["_"]["name"], Opts>
	: F[K] extends Aliased
		? K
		: never;
