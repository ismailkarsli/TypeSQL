import type { Decimal, JsonValue } from "@prisma/client/runtime/client";

export interface PrismaTypeMap {
	bool: boolean;
	int2: number;
	int4: number;
	int8: bigint;
	oid: bigint;
	float4: number;
	float8: number;
	numeric: Decimal;
	money: Decimal;
	text: string;
	varchar: string;
	bpchar: string;
	name: string;
	uuid: string;
	xml: string;
	inet: string;
	cidr: string;
	bit: string;
	varbit: string;
	bytea: Uint8Array;
	date: Date;
	time: Date;
	timetz: Date;
	timestamp: Date;
	timestamptz: Date;
	json: JsonValue;
	jsonb: JsonValue;
}
