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
import type { Lex } from "./lexer/lex.js";
import type { StripShape } from "./shape.js";

export interface PgEngine extends EngineTypes {
	readonly analysis: PgAnalysis;
	readonly toks: PgTokens;
	readonly row: PgRow;
	readonly param: PgParam;
	readonly display: PgDisplay;
	readonly json: "json" | "jsonb";
	readonly call: PgCall;
}

interface PgAnalysis extends AnalysisFn {
	readonly out: Analysis<this["db"], this["q"]>;
}
interface PgTokens extends TokensFn {
	readonly out: Lex<this["q"]>;
}
interface PgRow extends RowFn {
	readonly out: RowFrom<this["m"], this["tm"], this["db"]>;
}
interface PgParam extends ParamFn {
	readonly out: TsParamTypeOf<this["tm"], this["db"], this["t"]>;
}
interface PgDisplay extends DisplayFn {
	readonly out: StripShape<this["t"]>;
}
interface PgCall extends CallFn {
	readonly out: CallCached<this["db"], this["tm"], this["keys"], this["q"]>;
}
