import type {
	DefaultParamTypeMap,
	NodePostgresTypeMap,
} from "@typesql/core/postgres";

export type PgInterval = PgTypeMap["interval"];

/** node-postgres's defaults, with `bytea` as the `Buffer` it is. */
export interface PgTypeMap extends Omit<NodePostgresTypeMap, "bytea"> {
	$params: PgParamTypeMap;
	bytea: Buffer;
}

export interface PgParamTypeMap extends DefaultParamTypeMap {}
