import type * as Shared from "../../engine/write.js";
import type { SqliteEngine } from "./engine.js";

export type {
	RelationName,
	TableName,
	TableOf,
} from "../../engine/write.js";

export type SetInput<DB, TM, T extends string> = Shared.SetInput<
	SqliteEngine,
	DB,
	TM,
	T
>;

export type InsertInput<DB, TM, T extends string> = Shared.InsertInput<
	SqliteEngine,
	DB,
	TM,
	T
>;
