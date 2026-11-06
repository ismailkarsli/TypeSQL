import type { ColInfo } from "../../engine/types.js";
import type { JsonAs, NullableTs, ParamMapOf, TsShape } from "../../schema.js";
import type { SchemaTypes } from "../engine/db.js";
import type {
	AnyShaped,
	BaseOf,
	NullElems,
	Shaped,
	ShapeOfType,
} from "../engine/shape.js";
import type { RangeT, TypeFact } from "../schema/type-facts.js";

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
	jsonpath: string;
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
	regconfig: string;
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
	xid: string;
	xid8: string;
	pg_lsn: string;
	pg_snapshot: string;
	txid_snapshot: string;
	refcursor: string;
	aclitem: string;
	int2vector: string;
	oidvector: string;
	pg_node_tree: string;
	record: unknown;
	void: void;
	unknown: unknown;
}

/**
 * What node-postgres returns with its default parsers (pg-types), as the
 * migrator's `pg` client and `@typesql/pg` read rows. `bytea` is a Node
 * `Buffer`, typed here as the `Uint8Array` it extends.
 */
export interface NodePostgresTypeMap
	extends Omit<DefaultTypeMap, "interval" | "record" | "void"> {
	interval: {
		years?: number;
		months?: number;
		days?: number;
		hours?: number;
		minutes?: number;
		seconds?: number;
		milliseconds?: number;
		toPostgres(): string;
		toISO(): string;
		toISOString(): string;
	};
	record: string;
	void: string;
	// Array types without a registered parser come back as their text.
	"aclitem[]": string;
	"char[]": string;
}

// biome-ignore lint/plugin: a type map maps any SQL type name to any TypeScript type.
export type TypeMap = { readonly [pgType: string]: unknown };

export type TsTypeOf<TM, DB, T extends string> = T extends AnyShaped
	? ShapedTs<TM, DB, T>
	: T extends keyof TM
		? TM[T]
		: T extends `${infer E}[]`
			? TsTypeOf<TM, DB, E>[]
			: T extends keyof SchemaTypes<DB>
				? SchemaTypes<DB>[T]
				: unknown;

type ShapedTs<TM, DB, T extends string> =
	T extends Shaped<"json" | "jsonb", infer S>
		? BaseOf<T> extends infer B extends keyof TM
			? JsonAs<TM[B], JsonTs<S, DB>>
			: JsonTs<S, DB>
		: TsTypeOf<TM, DB, BaseOf<T>>;

export type TsOf<
	TM,
	DB,
	T extends { type: string; nullable: boolean },
> = NullableTs<T, ValueTs<TM, DB, T>>;
type ValueTs<
	TM,
	DB,
	T extends { type: string; nullable: boolean },
> = T extends NullElems
	? T["type"] extends keyof TM
		? TM[T["type"]]
		: T["type"] extends `${infer E}[]`
			? (TsTypeOf<TM, DB, E> | null)[]
			: TsTypeOf<TM, DB, T["type"]>
	: TsTypeOf<TM, DB, T["type"]>;

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

export type ParamTypeMapOf<TM> = ParamMapOf<TM, DefaultParamTypeMap>;

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
			? readonly (ParamTsOf<TM, PM, DB, E> | null)[]
			: T extends keyof SchemaTypes<DB>
				? SchemaTypes<DB>[T]
				: unknown;

/** The TypeScript type of a JSON value of shape S. */
type JsonTs<S, DB> = S extends { readonly k: "obj"; readonly m: infer M }
	? [keyof M] extends [never]
		? Record<string, never>
		: {
				-readonly [K in keyof M]: M[K] extends ColInfo
					? JsonValueTs<M[K], DB>
					: never;
			}
	: S extends { readonly k: "arr"; readonly e: infer E extends ColInfo }
		? JsonValueTs<E, DB>[]
		: S extends {
					readonly k: "tup";
					readonly es: infer Es extends readonly ColInfo[];
				}
			? { -readonly [I in keyof Es]: JsonValueTs<Es[I], DB> }
			: S extends { readonly k: "rec"; readonly v: infer V extends ColInfo }
				? { [key: string]: JsonValueTs<V, DB> }
				: S extends { readonly k: "val"; readonly c: infer C extends ColInfo }
					? JsonValueTs<C, DB>
					: S extends TsShape<infer T>
						? T
						: unknown;

type JsonValueTs<C extends ColInfo, DB> = C extends ColInfo
	? C["nullable"] extends true
		? JsonOfInfo<C, DB> | null
		: JsonOfInfo<C, DB>
	: never;
type JsonOfInfo<C extends ColInfo, DB> = C extends NullElems
	? C["type"] extends `${infer E}[]`
		? (JsonOfType<E, DB> | null)[]
		: JsonOfType<C["type"], DB>
	: JsonOfType<C["type"], DB>;

type JsonForm = { number: number; boolean: boolean; string: string };

type JsonOfType<T extends string, DB> = T extends AnyShaped
	? ShapeOfType<T> extends infer S
		? S extends null
			? unknown
			: JsonTs<S, DB>
		: never
	: TypeFact<T, "json"> extends infer F extends keyof JsonForm
		? JsonForm[F]
		: T extends "null"
			? null
			: T extends `${infer E}[]`
				? JsonOfType<E, DB>[]
				: T extends RangeT | `${string}multirange`
					? string
					: T extends keyof SchemaTypes<DB>
						? SchemaTypes<DB>[T]
						: unknown;
