import type { ColInfo, Scope } from "../../engine/types.js";

/** The server family: MySQL (and compatible servers) or MariaDB. */
export type Flavor = "mysql" | "mariadb";

/** MariaDB statements are analyzed against `DB & MariaDbFlag`. */
export type MariaDbFlag = { readonly $flavor: "mariadb" };

export type FlavorOf<DB> = DB extends { readonly $flavor: "mariadb" }
	? "mariadb"
	: "mysql";

export type MyCol = ColInfo & { readonly n: string };
export type MyColOf<T, N, Name> = {
	readonly type: T;
	readonly nullable: N;
	readonly n: Name;
};
export type MyColMap = { readonly [lc: string]: MyCol };

export type MyItem = {
	readonly alias: string | null;
	readonly cols: MyColMap;
	readonly skip: readonly string[];
	readonly order: readonly string[];
};
export type MyLevel = readonly MyItem[];

export type MyCteMap = {
	readonly [lc: string]: {
		readonly cols: MyColMap;
		readonly order: readonly string[];
	};
};

export type AggMode = "none" | "group" | "whole";

export type MyCtx = {
	readonly db: unknown;
	readonly scope: Scope;
	readonly ctes: MyCteMap;
	readonly agg: AggMode;
	readonly inAgg: boolean;
	readonly aliases: MyColMap;
};

export type MkCtx<
	DB,
	S extends Scope,
	Ctes extends MyCteMap,
	Agg extends AggMode = "none",
	Aliases extends MyColMap = {},
	AggScope extends Scope = S,
	InAgg extends boolean = false,
> = {
	readonly db: DB;
	readonly scope: S;
	readonly aggScope: AggScope;
	readonly ctes: Ctes;
	readonly agg: Agg;
	readonly inAgg: InAgg;
	readonly aliases: Aliases;
};

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

export type Cell = {
	readonly n: string;
	readonly t: ColInfo;
	readonly d?: string;
};

export type Tup<
	N extends number,
	A extends unknown[] = [],
> = A["length"] extends N ? A : Tup<N, [...A, 0]>;
export type GE<A extends number, B extends number> =
	Tup<A> extends [...Tup<B>, ...unknown[]] ? true : false;
