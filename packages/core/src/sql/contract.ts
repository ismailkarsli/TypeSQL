import type { Lexis } from "./lexis.js";

export interface AnalysisFn {
	readonly db: unknown;
	readonly q: string;
	readonly out: unknown;
}
export interface TokensFn {
	readonly q: string;
	readonly out: unknown;
}
export interface RowFn {
	readonly m: unknown;
	readonly tm: unknown;
	readonly db: unknown;
	readonly out: unknown;
}
export interface ParamFn {
	readonly tm: unknown;
	readonly db: unknown;
	readonly t: string;
	readonly out: unknown;
}
export interface DisplayFn {
	readonly t: string;
	readonly out: string;
}
/** The statement `sql()` returns. */
export interface StatementFn {
	readonly row: unknown;
	// Not `readonly unknown[]`, which would stay in the statement's type.
	readonly params: unknown;
	readonly text: string;
	readonly out: unknown;
}

export type StatementParams<P> = P extends readonly unknown[] ? P : never;

export interface EngineTypes {
	readonly analysis: AnalysisFn;
	readonly toks: TokensFn;
	readonly row: RowFn;
	readonly param: ParamFn;
	readonly display: DisplayFn;
	readonly json: string;
	/** Appended to the error for a JS array passed for a JSON parameter: why the driver can't bind it. */
	readonly arrayNote: string;
	/** The identifier quote `sql.id`, `sql.set` and `sql.values` write, as the runtime dialect's `quote`. */
	readonly quote: string;
	/** What `sql.values` writes for a row of defaults, as the runtime dialect's `emptyRow`. */
	readonly emptyRow: string;
	/** Whether `sql.values` may write `DEFAULT` for a column a row leaves out, as the runtime dialect's `valuesDefault`. */
	readonly valuesDefault: boolean;
	/** Its text rules, as the runtime dialect's `lexis`. */
	readonly lexis: Lexis;
}

export type AnalysisOf<
	E extends EngineTypes,
	DB,
	Q extends string,
> = (E["analysis"] & {
	readonly db: DB;
	readonly q: Q;
})["out"];

export type TokensOf<E extends EngineTypes, Q extends string> = (E["toks"] & {
	readonly q: Q;
})["out"];

export type RowTypeOf<E extends EngineTypes, M, TM, DB> = (E["row"] & {
	readonly m: M;
	readonly tm: TM;
	readonly db: DB;
})["out"];

export type TsParamTypeOf<
	E extends EngineTypes,
	TM,
	DB,
	T extends string,
> = (E["param"] & { readonly tm: TM; readonly db: DB; readonly t: T })["out"];

export type StatementOf<
	S extends StatementFn,
	Row,
	Params extends readonly unknown[],
	Text extends string,
> = (S & {
	readonly row: Row;
	readonly params: Params;
	readonly text: Text;
})["out"];

export type TypeDisplayOf<
	E extends EngineTypes,
	T extends string,
> = (E["display"] & {
	readonly t: T;
})["out"];
