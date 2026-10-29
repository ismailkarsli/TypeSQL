import type { RowKeys } from "../../row-keys.js";
import type * as Shared from "../../sql/call.js";
import type { PgEngine } from "../engine/engine.js";

export type { SplicedText } from "../../sql/call.js";

export type CallTypes<
	DB,
	TM,
	Keys extends RowKeys,
	Q extends string,
> = Shared.CallTypes<PgEngine, DB, TM, Keys, Q>;
