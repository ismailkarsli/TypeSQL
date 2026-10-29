import type { DefaultParamTypeMap, DefaultTypeMap } from "@typesql/core";

export type PgInterval = PgTypeMap["interval"];

export interface PgTypeMap
	extends Omit<DefaultTypeMap, "bytea" | "interval" | "record" | "void"> {
	$params: PgParamTypeMap;
	bytea: Buffer;
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
	"aclitem[]": string;
	"char[]": string;
}

export interface PgParamTypeMap extends DefaultParamTypeMap {}
