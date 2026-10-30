import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { SqliteEngine } from "../engine/engine.js";

export interface Sql<DB, TM, Plugins extends readonly SqlPlugin[] = []>
	extends SqlApi<SqliteEngine, DB, TM, Plugins> {}
