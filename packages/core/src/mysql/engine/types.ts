export type {
	AggMode,
	Cell,
	Col as MyCol,
	ColMap as MyColMap,
	ColOf as MyColOf,
	CteMap as MyCteMap,
	Ctx as MyCtx,
	Item as MyItem,
	Level as MyLevel,
	MkCtx,
} from "../../engine/family/types.js";

/** The server family: MySQL (and compatible servers) or MariaDB. */
export type Flavor = "mysql" | "mariadb";

/** MariaDB statements are analyzed against `DB & MariaDbFlag`. */
export type MariaDbFlag = { readonly $flavor: "mariadb" };

export type FlavorOf<DB> = DB extends { readonly $flavor: "mariadb" }
	? "mariadb"
	: "mysql";

type IntName = "tinyint" | "smallint" | "mediumint" | "int" | "bigint";
type StringName =
	| "char"
	| "varchar"
	| "tinytext"
	| "text"
	| "mediumtext"
	| "longtext"
	| "enum"
	| "set"
	| "uuid"
	| "inet4"
	| "inet6";
type BinaryName =
	| "binary"
	| "varbinary"
	| "tinyblob"
	| "blob"
	| "mediumblob"
	| "longblob"
	| "vector";
type TemporalName = "date" | "datetime" | "timestamp" | "time";
type GeoName =
	| "geometry"
	| "point"
	| "linestring"
	| "polygon"
	| "multipoint"
	| "multilinestring"
	| "multipolygon"
	| "geometrycollection";

/** The kind of value a type holds, which decides how expressions combine it. */
export type Cat<T> = T extends "null"
	? "null"
	: T extends "unknown"
		? "unknown"
		: T extends IntName | `${IntName} unsigned` | "year"
			? "int"
			: T extends "decimal"
				? "decimal"
				: T extends "float" | "double"
					? "float"
					: T extends StringName
						? "string"
						: T extends BinaryName
							? "binary"
							: T extends "bit"
								? "bit"
								: T extends TemporalName
									? "temporal"
									: T extends "json"
										? "json"
										: T extends GeoName
											? "geo"
											: "other";

export type IsUnsigned<T> = T extends `${string} unsigned` ? true : false;

/** A schema type as the engine reads it: lowercase, without a length. */
export type NormalizeType<T> = T extends { readonly shape: unknown }
	? T
	: T extends string
		? StripLength<Lowercase<T>>
		: "unknown";
type StripLength<T extends string> = T extends `${infer B}(${string})${infer R}`
	? `${B}${R}`
	: T;
