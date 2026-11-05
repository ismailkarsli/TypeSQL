import type { Cat } from "../engine/types.js";

/**
 * mysql2's defaults on MySQL: integers and `FLOAT`/`DOUBLE` as numbers
 * (`BIGINT` too, which loses precision past 2^53), `DECIMAL` as strings,
 * dates as `Date`, binary strings as `Buffer` and JSON parsed.
 */
export interface DefaultTypeMap {
	tinyint: number;
	smallint: number;
	mediumint: number;
	int: number;
	bigint: number;
	"tinyint unsigned": number;
	"smallint unsigned": number;
	"mediumint unsigned": number;
	"int unsigned": number;
	"bigint unsigned": number;
	year: number;
	decimal: string;
	float: number;
	double: number;
	bit: Uint8Array;
	char: string;
	varchar: string;
	tinytext: string;
	text: string;
	mediumtext: string;
	longtext: string;
	enum: string;
	set: string;
	binary: Uint8Array;
	varbinary: Uint8Array;
	tinyblob: Uint8Array;
	blob: Uint8Array;
	mediumblob: Uint8Array;
	longblob: Uint8Array;
	date: Date;
	datetime: Date;
	timestamp: Date;
	time: string;
	json: unknown;
	geometry: unknown;
	point: { x: number; y: number };
	uuid: string;
	inet4: string;
	inet6: string;
	vector: unknown;
	null: null;
	unknown: unknown;
}

/**
 * mysql2 on MariaDB: the same as on MySQL. mysql2 reads MariaDB's column
 * metadata, so JSON comes back parsed although MariaDB stores it as text.
 */
export type Mysql2MariaDbTypeMap = DefaultTypeMap;

/**
 * The mariadb connector's defaults: `BIGINT` as `bigint`, `DECIMAL` as
 * strings, dates as `Date`, JSON parsed, `SET` as an array of its values,
 * `BIT(1)` as a boolean and geometry as GeoJSON.
 */
export interface MariaDbTypeMap
	extends Omit<
		DefaultTypeMap,
		"bigint" | "bigint unsigned" | "bit" | "set" | "point"
	> {
	bigint: bigint;
	"bigint unsigned": bigint;
	bit: Uint8Array | boolean;
	set: string[];
	point: { type: "Point"; coordinates: number[] };
}

/**
 * HTTP drivers (PlanetScale's `@planetscale/database`, TiDB Cloud's
 * `@tidbcloud/serverless`): 64-bit integers, decimals, dates and times as
 * strings, binary strings as `Uint8Array`, JSON parsed.
 */
export interface ServerlessTypeMap
	extends Omit<
		DefaultTypeMap,
		"bigint" | "bigint unsigned" | "date" | "datetime" | "timestamp" | "point"
	> {
	bigint: string;
	"bigint unsigned": string;
	date: string;
	datetime: string;
	timestamp: string;
	point: unknown;
}

/** mysql2 with `supportBigNumbers` and `bigNumberStrings`: 64-bit integers as strings. */
export interface BigNumberStringsTypeMap
	extends Omit<DefaultTypeMap, "bigint" | "bigint unsigned"> {
	bigint: string;
	"bigint unsigned": string;
}

/** mysql2 with `dateStrings: true`: dates and times as strings. */
export interface DateStringsTypeMap
	extends Omit<DefaultTypeMap, "date" | "datetime" | "timestamp"> {
	date: string;
	datetime: string;
	timestamp: string;
}

// biome-ignore lint/plugin: a type map maps any SQL type name to any TypeScript type.
export type TypeMap = { readonly [mysqlType: string]: unknown };

export type Bindable =
	| string
	| number
	| bigint
	| boolean
	| Date
	| Uint8Array
	| null;

/** Values parameters accept besides the read type of their column. */
export interface DefaultParamTypeMap {
	tinyint: number | bigint | boolean;
	smallint: number | bigint;
	mediumint: number | bigint;
	int: number | bigint;
	bigint: number | bigint | string;
	"tinyint unsigned": number | bigint | boolean;
	"smallint unsigned": number | bigint;
	"mediumint unsigned": number | bigint;
	"int unsigned": number | bigint;
	"bigint unsigned": number | bigint | string;
	year: number;
	decimal: number | bigint | string;
	float: number;
	double: number;
	bit: number | bigint;
	date: Date | string;
	datetime: Date | string;
	timestamp: Date | string;
	time: string;
	binary: Uint8Array | string;
	varbinary: Uint8Array | string;
	tinyblob: Uint8Array | string;
	blob: Uint8Array | string;
	mediumblob: Uint8Array | string;
	longblob: Uint8Array | string;
	json: string;
	bool: boolean | number;
	/** `LIMIT` and `OFFSET` take only numbers: drivers send a string quoted. */
	limit: number;
	unknown: Bindable;
}

export type ParamTypeMapOf<TM> = TM extends { readonly $params: infer P }
	? P
	: DefaultParamTypeMap;

type Fallback<C> = C extends "int"
	? "int"
	: C extends "decimal"
		? "decimal"
		: C extends "float"
			? "double"
			: C extends "string"
				? "varchar"
				: C extends "binary"
					? "blob"
					: C extends "bit"
						? "bit"
						: C extends "temporal"
							? "datetime"
							: C extends "json"
								? "json"
								: C extends "geo"
									? "geometry"
									: "unknown";

type TsTypeOf<TM, T> = T extends {
	readonly shape: { readonly k: "ts"; readonly v: infer V };
}
	? V
	: T extends keyof TM
		? TM[T]
		: Fallback<Cat<T>> extends infer K extends string
			? K extends keyof TM
				? TM[K]
				: unknown
			: never;

export type TsOf<
	TM,
	_DB,
	T extends { type: string; nullable: boolean },
> = T["type"] extends "null"
	? null
	: T["nullable"] extends true
		? TsTypeOf<TM, T["type"]> | null
		: TsTypeOf<TM, T["type"]>;

export type TsParamTypeOf<TM, _DB, T extends string> = ParamTs<
	TM,
	ParamTypeMapOf<TM>,
	T
>;
type ParamTs<TM, PM, T> = T extends {
	readonly shape: { readonly k: "ts"; readonly v: infer V };
}
	? V
	: T extends "bool" | "limit" | "unknown"
		? T extends keyof PM
			? PM[T]
			: unknown
		: T extends keyof TM
			? TM[T] | (T extends keyof PM ? PM[T] : never)
			: Fallback<Cat<T>> extends infer K extends string
				? ParamTs<TM, PM, K>
				: never;
