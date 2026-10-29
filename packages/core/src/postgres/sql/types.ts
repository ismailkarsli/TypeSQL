import type { RowKeys } from "../../row-keys.js";
import type { SqlApi } from "../../sql/api.js";
import type { PgEngine } from "../engine/engine.js";

export interface Sql<DB, TM, Keys extends RowKeys = "preserve">
	extends SqlApi<PgEngine, DB, TM, Keys> {}
