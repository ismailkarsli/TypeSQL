import type { JsonTs } from "../engine/json.js";
import type { AnyShaped, BaseOf, Shaped } from "../engine/shape.js";
import type { TypeRegistry } from "../schema/column.js";

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

export type EnumsOf<DB> = DB extends {
	readonly $types: infer R extends TypeRegistry;
}
	? R
	: {};

export type TsTypeOf<TM, DB, T extends string> = T extends AnyShaped
	? ShapedTs<TM, DB, T>
	: T extends keyof TM
		? TM[T]
		: T extends `${infer E}[]`
			? TsTypeOf<TM, DB, E>[]
			: T extends keyof EnumsOf<DB>
				? EnumsOf<DB>[T]
				: unknown;

type ShapedTs<TM, DB, T extends string> =
	T extends Shaped<"json" | "jsonb", infer S>
		? BaseOf<T> extends infer B extends keyof TM
			? [TM[B]] extends [string]
				? TM[B]
				: JsonTs<S, DB>
			: JsonTs<S, DB>
		: TsTypeOf<TM, DB, BaseOf<T>>;

export type TsOf<
	TM,
	DB,
	T extends { type: string; nullable: boolean },
> = T["type"] extends "null"
	? null
	: T["nullable"] extends true
		? TsTypeOf<TM, DB, T["type"]> | null
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

export type ParamTypeMapOf<TM> = TM extends { readonly $params: infer P }
	? P
	: DefaultParamTypeMap;

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
