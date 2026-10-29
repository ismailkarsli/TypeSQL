import type { Decimal, JsonValue } from "@prisma/client/runtime/client";
import type { DefaultParamTypeMap } from "@typesql/core/sqlite";

export interface PrismaSqliteTypeMap {
	integer: number;
	int: number;
	bigint: bigint;
	int8: bigint;
	real: number;
	numeric: number;
	decimal: Decimal;
	boolean: boolean;
	datetime: Date;
	timestamp: Date;
	date: Date;
	time: Date;
	text: string;
	blob: Uint8Array;
	jsonb: JsonValue;
	json: string;
	any: unknown;
	unknown: unknown;
	$params: DefaultParamTypeMap & {
		bigint: number;
		int8: number;
		decimal: number | string;
		boolean: number;
		datetime: string;
		timestamp: string;
		date: string;
		time: string;
	};
}
