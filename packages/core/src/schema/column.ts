import type { TsShape } from "../engine/json.js";
import type { Shaped } from "../engine/shape.js";
import type { Overloads } from "../engine/typer/catalog.js";
import type { PgTypeName } from "./pg-types.js";

export type ColDesc = {
	readonly type: string;
	readonly nullable: boolean;
	readonly hasDefault: boolean;
};

export type Col<
	T extends PgTypeName | (string & {}),
	Flags extends Partial<ColDesc> = {},
> = {
	readonly type: T;
	readonly nullable: Flags extends { nullable: true } ? true : false;
	readonly hasDefault: Flags extends { hasDefault: true } ? true : false;
};

export type Nullable<T extends PgTypeName | (string & {})> = Col<
	T,
	{ nullable: true }
>;
export type Generated<T extends PgTypeName | (string & {})> = Col<
	T,
	{ hasDefault: true }
>;
export type NullableGenerated<T extends PgTypeName | (string & {})> = Col<
	T,
	{ nullable: true; hasDefault: true }
>;
export type Arr<
	T extends PgTypeName | (string & {}),
	Flags extends Partial<ColDesc> = {},
> = Col<`${T}[]`, Flags>;
export type Json<
	T,
	Flags extends Partial<ColDesc> = {},
	Base extends "json" | "jsonb" = "jsonb",
> = Col<Shaped<Base, TsShape<T>>, Flags>;
export type Enum<
	Name extends string,
	Flags extends Partial<ColDesc> = {},
> = Col<Name, Flags>;

export type Table = { readonly [column: string]: ColDesc };

export type View<Cols extends Table> = { readonly $view: Cols };

export type TypeRegistry = { readonly [name: string]: string };

export type Namespace = { readonly [table: string]: Table | View<Table> };

export type FunctionRegistry = { readonly [name: string]: Overloads };

export type Schema = {
	readonly [key: string]:
		| Table
		| View<Table>
		| Namespace
		| TypeRegistry
		| FunctionRegistry;
};
