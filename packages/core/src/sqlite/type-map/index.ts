import type { Affinity } from "../engine/types.js";

export interface DefaultTypeMap {
	integer: number;
	real: number;
	numeric: number;
	text: string;
	blob: Uint8Array;
	any: unknown;
	date: string;
	datetime: string;
	time: string;
	timestamp: string;
	json: string;
	uuid: string;
	unknown: unknown;
}

export interface BigIntTypeMap extends Omit<DefaultTypeMap, "integer"> {
	integer: bigint;
}

export type TypeMap = { readonly [sqliteType: string]: unknown };

export type Bindable = string | number | bigint | Uint8Array | null;

export interface DefaultParamTypeMap {
	integer: number | bigint;
	numeric: number | bigint;
	real: number | bigint;
	any: Bindable;
	unknown: Bindable;
}

export type ParamTypeMapOf<TM> = TM extends { readonly $params: infer P }
	? P
	: DefaultParamTypeMap;

export type TsTypeOf<TM, T extends string> = T extends {
	readonly shape: { readonly k: "ts"; readonly v: infer V };
}
	? T extends "json"
		? TsTypeOf<TM, "json">
		: V
	: T extends keyof TM
		? TM[T]
		: Affinity<T> extends infer A
			? A extends keyof TM
				? TM[A]
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
type ParamTs<TM, PM, T extends string> = T extends {
	readonly shape: { readonly k: "ts"; readonly v: infer V };
}
	? T extends "json"
		? ParamTs<TM, PM, "json">
		: V
	: T extends keyof TM
		? TM[T] | (T extends keyof PM ? PM[T] : never)
		: Affinity<T> extends infer A extends string
			? ParamTs<TM, PM, A>
			: never;
