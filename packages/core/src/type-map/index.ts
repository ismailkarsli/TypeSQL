import type { JsonTs } from "../engine/json.js";
import type { AnyShaped, BaseOf, Shaped } from "../engine/shape.js";
import type { TypeRegistry } from "../schema/column.js";

/**
 * A type map converts canonical Postgres type names into TS types at the projection
 * boundary. Adapters ship their own (`PgTypeMap`, `PostgresJsTypeMap`); this default
 * matches `pg` with no custom type parsers. It types rows; parameters accept the row type plus
 * `DefaultParamTypeMap` (a map can declare its own under `$params`).
 */
export interface DefaultTypeMap {
	bool: boolean;
	int2: number;
	int4: number;
	int8: string;
	float4: number;
	float8: number;
	numeric: string;
	money: string;
	text: string;
	varchar: string;
	bpchar: string;
	char: string;
	name: string;
	bytea: Uint8Array;
	date: Date;
	time: string;
	timetz: string;
	timestamp: Date;
	timestamptz: Date;
	interval: {
		years?: number;
		months?: number;
		days?: number;
		hours?: number;
		minutes?: number;
		seconds?: number;
		milliseconds?: number;
	};
	uuid: string;
	json: unknown;
	jsonb: unknown;
	xml: string;
	inet: string;
	cidr: string;
	macaddr: string;
	macaddr8: string;
	bit: string;
	varbit: string;
	oid: number;
	regclass: string;
	regtype: string;
	regproc: string;
	point: { x: number; y: number };
	line: string;
	lseg: string;
	box: string;
	path: string;
	polygon: string;
	circle: { x: number; y: number; radius: number };
	tsvector: string;
	tsquery: string;
	int4range: string;
	int8range: string;
	numrange: string;
	tsrange: string;
	tstzrange: string;
	daterange: string;
	/** System types (`pg_catalog` columns, see `PgCatalog`): no driver parses them, so they arrive as text. */
	xid: string;
	xid8: string;
	pg_lsn: string;
	aclitem: string;
	int2vector: string;
	oidvector: string;
	pg_node_tree: string;
	record: unknown;
	void: void;
	unknown: unknown;
}

export type TypeMap = { readonly [pgType: string]: unknown };

/** Enum registry of a schema (`DB["$types"]`), or `{}`. */
export type EnumsOf<DB> = DB extends {
	readonly $types: infer R extends TypeRegistry;
}
	? R
	: {};

/**
 * Convert a canonical Postgres type name into a TS type.
 * An exact entry in the map wins (so a map may declare `"numeric[]": number[]`); otherwise
 * arrays map element-wise; enum names resolve through `DB["$types"]`; anything else is `unknown`.
 * Typed JSON values (json/jsonb with a known shape) are typed from their shape.
 */
export type TsTypeOf<TM, DB, T extends string> = T extends AnyShaped
	? ShapedTs<TM, DB, T>
	: T extends keyof TM
		? TM[T]
		: T extends `${infer E}[]`
			? TsTypeOf<TM, DB, E>[]
			: T extends keyof EnumsOf<DB>
				? EnumsOf<DB>[T]
				: unknown;

/**
 * A typed JSON value (engine/json.ts) is its JSON shape as a TS type, unless the map reads that
 * JSON type as a `string` (no JSON parser registered). A whole row is the map's `record`.
 */
type ShapedTs<TM, DB, T extends string> =
	T extends Shaped<"json" | "jsonb", infer S>
		? BaseOf<T> extends infer B extends keyof TM
			? [TM[B]] extends [string]
				? TM[B]
				: JsonTs<S, DB>
			: JsonTs<S, DB>
		: TsTypeOf<TM, DB, BaseOf<T>>;

/** `{ type, nullable }` → TS type with `| null` when nullable. */
export type TsOf<
	TM,
	DB,
	T extends { type: string; nullable: boolean },
> = T["type"] extends "null"
	? null
	: T["nullable"] extends true
		? TsTypeOf<TM, DB, T["type"]> | null
		: TsTypeOf<TM, DB, T["type"]>;

/**
 * Input side of a type map: TS types a parameter accepts *in addition to* the row type of
 * its Postgres type. A type map declares its own under the `$params` key
 * (`PgTypeMap["$params"]`, `PostgresJsTypeMap["$params"]`); a map without one uses this
 * default, which lists what both `pg` and postgres.js serialize correctly:
 *
 *   int8, numeric, money          number | bigint | string (sent as their decimal text)
 *   date, timestamp, timestamptz  Date | string
 *   interval                      string ('1 day 02:00:00', 'P1DT2H')
 *   bytea                         Uint8Array (Buffer is one)
 *
 * So a map whose rows type `timestamptz` as `string` (a custom parser) still accepts `Date`
 * params, and `numeric` params accept numbers although `numeric` rows are strings.
 */
export interface DefaultParamTypeMap {
	int8: number | bigint | string;
	numeric: number | bigint | string;
	money: number | bigint | string;
	date: Date | string;
	timestamp: Date | string;
	timestamptz: Date | string;
	interval: string;
	bytea: Uint8Array;
}

/** `TM["$params"]`, or `DefaultParamTypeMap` when the map has none. */
export type ParamTypeMapOf<TM> = TM extends { readonly $params: infer P }
	? P
	: DefaultParamTypeMap;

/**
 * The TS type a parameter of Postgres type `T` accepts: the row type (`TsTypeOf`) plus the
 * map's `$params` entry for `T`. Array elements also accept `null`: a Postgres array can
 * always hold NULLs, whatever the nullability of the array itself.
 */
export type TsParamTypeOf<TM, DB, T extends string> = ParamTsOf<
	TM,
	ParamTypeMapOf<TM>,
	DB,
	T
>;
type ParamTsOf<TM, PM, DB, T extends string> = T extends AnyShaped
	? ShapedTs<TM, DB, T>
	: T extends keyof TM
		? TM[T] | (T extends keyof PM ? PM[T] : never)
		: T extends `${infer E}[]`
			? (ParamTsOf<TM, PM, DB, E> | null)[]
			: T extends keyof EnumsOf<DB>
				? EnumsOf<DB>[T]
				: unknown;
