import type * as Shared from "../../sql/write.js";
import type { PgEngine } from "./engine.js";

export type {
	RelationName,
	TableName,
	TableOf,
} from "../../schema.js";

export type SetInput<DB, TM, T extends string> = Shared.SetInput<
	PgEngine,
	DB,
	TM,
	T
>;

export type InsertInput<DB, TM, T extends string> = Shared.InsertInput<
	PgEngine,
	DB,
	TM,
	T
>;
