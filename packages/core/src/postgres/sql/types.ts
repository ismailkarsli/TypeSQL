import type { SqlPlugin } from "../../plugin.js";
import type { SqlApi } from "../../sql/api.js";
import type { PgEngine } from "../engine/engine.js";
import type { NormalizeSchema } from "../schema/normalize.js";

export interface Sql<DB, TM, Plugins extends readonly SqlPlugin[] = []>
	extends SqlApi<PgEngine, NormalizeSchema<DB>, TM, Plugins> {}
