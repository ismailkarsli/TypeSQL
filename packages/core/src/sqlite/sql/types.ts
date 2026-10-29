import type { RowKeys } from "../../row-keys.js";
import type { SqlApi } from "../../sql/api.js";
import type { SqliteEngine } from "../engine/engine.js";

export interface Sql<DB, TM, Keys extends RowKeys = "preserve">
	extends SqlApi<SqliteEngine, DB, TM, Keys> {}
