import type { FlaggedCol, Typed, TypeName } from "../../schema.js";

export type { Typed, View } from "../../schema.js";

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

export type Col<T extends TypeName, F extends ColFlags = {}> = FlaggedCol<
	T,
	F,
	"autoIncrement",
	true
>;

/** A JSON column holding documents of type `T`. */
export type Json<T, F extends ColFlags = {}> = Col<Typed<"json", T>, F>;

/** An `ENUM` column with the given values. */
export type Enum<Values extends string, F extends ColFlags = {}> = Col<
	Typed<"enum", Values>,
	F
>;
