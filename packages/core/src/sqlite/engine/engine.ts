import type { ShapeBase } from "../../schema.js";
import type {
	AnalysisFn,
	DisplayFn,
	EngineTypes,
	ParamFn,
	RowFn,
	TokensFn,
} from "../../sql/contract.js";
import type { Lexis } from "../../sql/lexis.js";
import type { TsParamTypeOf } from "../type-map/index.js";
import type { Analysis, RowFrom } from "./infer.js";
import type { Lex } from "./lexer.js";

export interface SqliteEngine extends EngineTypes {
	readonly analysis: SqliteAnalysis;
	readonly toks: SqliteTokens;
	readonly row: SqliteRow;
	readonly param: SqliteParam;
	readonly display: SqliteDisplay;
	readonly json: "json";
	readonly arrayNote: "";
	readonly quote: '"';
	readonly emptyRow: "DEFAULT VALUES";
	readonly valuesDefault: false;
	readonly lexis: SqliteLexis;
}

/**
 * SQLite's text rules, as `sqliteLexis`: names are quoted with "", `` and [],
 * strings take no backslash escapes, and block comments don't nest.
 */
export interface SqliteLexis extends Lexis {
	readonly extra: "`" | "[";
	readonly backslash: never;
	readonly spacedDash: false;
	readonly nest: false;
	readonly dollar: false;
	readonly names: '"' | "`" | "[";
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
	readonly out: ShapeBase<this["t"]>;
}
