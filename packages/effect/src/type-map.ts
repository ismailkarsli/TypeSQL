import type { DefaultTypeMap as MysqlTypeMap } from "@typesql/core/mysql";
import type {
	DefaultParamTypeMap,
	DefaultTypeMap,
} from "@typesql/core/postgres";

export interface EffectPgInterval {
	months: number;
	days: number;
	microseconds: bigint;
}

/** Types @effect/sql-pg has no codec for: a statement that returns one fails. */
type NoCodec =
	| "money"
	| "jsonpath"
	| "macaddr"
	| "macaddr8"
	| "bit"
	| "varbit"
	| "regtype"
	| "regproc"
	| "regconfig"
	| "point"
	| "line"
	| "lseg"
	| "box"
	| "path"
	| "polygon"
	| "circle"
	| "tsvector"
	| "tsquery"
	| "int4range"
	| "int8range"
	| "numrange"
	| "tsrange"
	| "tstzrange"
	| "daterange"
	| "xid"
	| "xid8"
	| "pg_lsn"
	| "pg_snapshot"
	| "txid_snapshot"
	| "aclitem"
	| "int2vector"
	| "oidvector"
	| "record";

/** What @effect/sql-pg returns with its default codecs. */
export interface EffectPgTypeMap
	extends Omit<
			DefaultTypeMap,
			"int8" | "date" | "time" | "interval" | "regclass" | "void" | NoCodec
		>,
		// biome-ignore lint/plugin: a value of a type without a codec is never read.
		Record<NoCodec, unknown> {
	$params: EffectPgParamTypeMap;
	int8: bigint;
	date: string;
	/** Microseconds since midnight. */
	time: bigint;
	interval: EffectPgInterval;
	regclass: number;
	void: string;
}

/** The driver binds a `bigint` as an `int8`, so a `time` parameter takes its text. */
export interface EffectPgParamTypeMap extends DefaultParamTypeMap {
	time: string;
}

/** @effect/sql-mysql2 sets `supportBigNumbers`, so a `BIGINT` past 2^53 is a string. */
export interface EffectMysqlTypeMap
	extends Omit<MysqlTypeMap, "bigint" | "bigint unsigned"> {
	bigint: number | string;
	"bigint unsigned": number | string;
}
