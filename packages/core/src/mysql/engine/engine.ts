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
import type { MariaDbFlag } from "./types.js";

export interface MySqlEngine extends EngineTypes {
	readonly analysis: MySqlAnalysis;
	readonly toks: MySqlTokens;
	readonly row: MySqlRow;
	readonly param: MySqlParam;
	readonly display: MySqlDisplay;
	readonly json: "json";
	readonly arrayNote: "";
	readonly quote: "`";
	readonly emptyRow: "() VALUES ()";
	readonly valuesDefault: true;
	readonly lexis: MySqlLexis;
}

/**
 * MySQL's and MariaDB's text rules, as `mysqlLexis`: strings take backslash
 * escapes, `--` starts a comment only before whitespace, `#` starts one too,
 * and block comments don't nest.
 */
export interface MySqlLexis extends Lexis {
	readonly extra: "`" | "#";
	readonly backslash: "'" | '"';
	readonly spacedDash: true;
	readonly nest: false;
	readonly dollar: false;
	readonly names: "`";
}

/** MariaDB: the same grammar, with its own types, functions and statements. */
export interface MariaDbEngine extends MySqlEngine {
	readonly analysis: MariaDbAnalysis;
}

interface MySqlAnalysis extends AnalysisFn {
	readonly out: Analysis<this["db"], this["q"]>;
}
interface MariaDbAnalysis extends AnalysisFn {
	readonly out: Analysis<this["db"] & MariaDbFlag, this["q"]>;
}
interface MySqlTokens extends TokensFn {
	readonly out: Lex<this["q"]>;
}
interface MySqlRow extends RowFn {
	readonly out: RowFrom<this["m"], this["tm"], this["db"]>;
}
interface MySqlParam extends ParamFn {
	readonly out: TsParamTypeOf<this["tm"], this["db"], this["t"]>;
}
interface MySqlDisplay extends DisplayFn {
	readonly out: ShapeBase<this["t"]>;
}
