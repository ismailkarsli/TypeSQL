import type {
	AnalysisFn,
	DisplayFn,
	EngineTypes,
	ParamFn,
	RowFn,
	TokensFn,
} from "../../sql/contract.js";
import type { Lexis } from "../../sql/lexis.js";
import type { JsonT } from "../schema/type-facts.js";
import type { TsParamTypeOf } from "../type-map/index.js";
import type { Analysis, RowFrom } from "./infer.js";
import type { Lex } from "./lexer/lex.js";
import type { StripShape } from "./shape.js";

export interface PgEngine extends EngineTypes {
	readonly analysis: PgAnalysis;
	readonly toks: PgTokens;
	readonly row: PgRow;
	readonly param: PgParam;
	readonly display: PgDisplay;
	readonly json: JsonT;
	readonly arrayNote: " (node-postgres sends a JS array as a Postgres array)";
	readonly quote: '"';
	readonly emptyRow: "DEFAULT VALUES";
	readonly valuesDefault: true;
	readonly lexis: PgLexis;
}

/**
 * PostgreSQL's text rules, as `postgres.lexis`: E'' strings take backslash
 * escapes, block comments nest, and $tag$ quotes a string up to the same tag.
 */
export interface PgLexis extends Lexis {
	readonly extra: never;
	readonly backslash: never;
	readonly spacedDash: false;
	readonly nest: true;
	readonly dollar: true;
	readonly names: '"';
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
