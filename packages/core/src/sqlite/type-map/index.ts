import type { JsonAs, NullableTs, ParamMapOf, TsShaped } from "../../schema.js";
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

export interface BigIntTypeMap
	extends Omit<DefaultTypeMap, "integer" | "numeric"> {
	integer: bigint;
	// NUMERIC affinity (numeric, decimal, boolean, …) stores integral values as
	// INTEGER, which bigint mode reads as bigint; other values stay REAL.
	numeric: number | bigint;
}

// biome-ignore lint/plugin: a type map maps any SQL type name to any TypeScript type.
export type TypeMap = { readonly [sqliteType: string]: unknown };

export type Bindable = string | number | bigint | Uint8Array | null;

export interface DefaultParamTypeMap {
	integer: number | bigint;
	numeric: number | bigint;
	real: number | bigint;
	any: Bindable;
	unknown: Bindable;
}

export type ParamTypeMapOf<TM> = ParamMapOf<TM, DefaultParamTypeMap>;

type TsTypeOf<TM, T extends string> =
	T extends TsShaped<infer V>
		? T extends "json"
			? JsonAs<TsTypeOf<TM, "json">, V>
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
> = NullableTs<T, TsTypeOf<TM, T["type"]>>;

export type TsParamTypeOf<TM, _DB, T extends string> = ParamTs<
	TM,
	ParamTypeMapOf<TM>,
	T
>;
type ParamTs<TM, PM, T extends string> =
	T extends TsShaped<infer V>
		? T extends "json"
			? JsonAs<ParamTs<TM, PM, "json">, V>
			: V
		: T extends keyof TM
			? TM[T] | (T extends keyof PM ? PM[T] : never)
			: Affinity<T> extends infer A extends string
				? ParamTs<TM, PM, A>
				: never;
