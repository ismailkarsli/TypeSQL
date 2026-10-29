import type {
	DefaultParamTypeMap,
	DefaultTypeMap,
} from "@typesql/core/postgres";

export interface PostgresJsTypeMap
	extends Omit<
		DefaultTypeMap,
		"bytea" | "interval" | "point" | "circle" | "record" | "void"
	> {
	$params: PostgresJsParamTypeMap;
	bytea: Buffer;
	interval: string;
	point: string;
	circle: string;
	record: string;
	void: string;
}

export interface PostgresJsParamTypeMap
	extends Omit<DefaultParamTypeMap, "date" | "timestamp" | "timestamptz"> {
	date: Date | string | number;
	timestamp: Date | string | number;
	timestamptz: Date | string | number;
}

export interface PostgresJsBigIntTypeMap
	extends Omit<PostgresJsTypeMap, "int8"> {
	int8: bigint;
}
