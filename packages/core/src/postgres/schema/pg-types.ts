import type { DefaultTypeMap } from "../type-map/index.js";

export type PgScalarName = keyof DefaultTypeMap;

export type PgTypeName = PgScalarName | `${string}[]` | (string & {});

declare module "../../schema.js" {
	interface ColumnTypes extends DefaultTypeMap {}
}
