import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { PgEngine } from "../engine/engine.js";

export interface Sql<DB, TM, Plugins extends readonly SqlPlugin[] = []>
	extends SqlApi<PgEngine, DB, TM, Plugins> {}
