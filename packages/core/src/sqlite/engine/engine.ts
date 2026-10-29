import type {
	AnalysisFn,
	CallFn,
	DisplayFn,
	EngineTypes,
	ParamFn,
	RowFn,
	TokensFn,
} from "../../engine/contract.js";
import type { TsParamTypeOf } from "../type-map/index.js";
import type { CallCached } from "./cache.js";
import type { Analysis, RowFrom } from "./infer.js";
import type { Lex } from "./lexer.js";

export interface SqliteEngine extends EngineTypes {
	readonly analysis: SqliteAnalysis;
	readonly toks: SqliteTokens;
	readonly row: SqliteRow;
	readonly param: SqliteParam;
	readonly display: SqliteDisplay;
	readonly json: "json";
	readonly call: SqliteCall;
}

interface SqliteAnalysis extends AnalysisFn {
	readonly out: Analysis<this["db"], this["q"]>;
}
interface SqliteTokens extends TokensFn {
	readonly out: Lex<this["q"]>;
}
interface SqliteRow extends RowFn {
	readonly out: RowFrom<this["m"], this["tm"], this["db"]>;
}
interface SqliteParam extends ParamFn {
	readonly out: TsParamTypeOf<this["tm"], this["db"], this["t"]>;
}
interface SqliteDisplay extends DisplayFn {
	readonly out: this["t"];
}
interface SqliteCall extends CallFn {
	readonly out: CallCached<this["db"], this["tm"], this["keys"], this["q"]>;
}
