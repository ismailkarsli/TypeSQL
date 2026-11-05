import type { ColOptions, Shaped, TsShape, TypeName } from "../../schema.js";

export type { View } from "../../schema.js";

export type MySqlTypeName =
	| "tinyint"
	| "smallint"
	| "mediumint"
	| "int"
	| "bigint"
	| "tinyint unsigned"
	| "smallint unsigned"
	| "mediumint unsigned"
	| "int unsigned"
	| "bigint unsigned"
	| "decimal"
	| "float"
	| "double"
	| "bit"
	| "char"
	| "varchar"
	| "tinytext"
	| "text"
	| "mediumtext"
	| "longtext"
	| "binary"
	| "varbinary"
	| "tinyblob"
	| "blob"
	| "mediumblob"
	| "longblob"
	| "enum"
	| "set"
	| "date"
	| "datetime"
	| "timestamp"
	| "time"
	| "year"
	| "json"
	| "geometry"
	| "point"
	| "uuid"
	| "inet4"
	| "inet6"
	| "vector"
	| (string & {});

export type ColFlags = {
	readonly nullable?: boolean;
	readonly hasDefault?: boolean;
	readonly position?: number;
	readonly autoIncrement?: boolean;
	readonly generated?: boolean;
	readonly hidden?: boolean;
};

// Options are read through ColOptions (see there) so columns with different
// options compare by these properties. An unset autoIncrement, generated,
// hidden or position is an optional `never` property, so a column that has it
// is not assignable to one that does not.
export type Col<T extends TypeName, F extends ColFlags = {}> = {
	readonly type: T;
	readonly nullable: ColOptions<F> extends { nullable: true } ? true : false;
	readonly hasDefault: ColOptions<F> extends { hasDefault: true }
		? true
		: ColOptions<F> extends { generated: true }
			? true
			: ColOptions<F> extends { autoIncrement: true }
				? true
				: false;
} & (ColOptions<F> extends { readonly position: infer P extends number }
	? { readonly i: P }
	: { readonly i?: never }) &
	(ColOptions<F> extends { readonly autoIncrement: true }
		? { readonly autoIncrement: true }
		: { readonly autoIncrement?: never }) &
	(ColOptions<F> extends { readonly generated: true }
		? { readonly generated: true }
		: { readonly generated?: never }) &
	(ColOptions<F> extends { readonly hidden: true }
		? { readonly hidden: true }
		: { readonly hidden?: never });

/** A column of type `Base` whose values are typed `T`. */
export type Typed<Base extends string, T> = Shaped<Base, TsShape<T>>;

/** A JSON column holding documents of type `T`. */
export type Json<T, F extends ColFlags = {}> = Col<Typed<"json", T>, F>;

/** An `ENUM` column with the given values. */
export type Enum<Values extends string, F extends ColFlags = {}> = Col<
	Typed<"enum", Values>,
	F
>;
