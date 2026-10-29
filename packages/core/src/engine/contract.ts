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
export interface CallFn {
	readonly db: unknown;
	readonly tm: unknown;
	readonly keys: unknown;
	readonly q: string;
	readonly out: unknown;
}

export interface EngineTypes {
	readonly analysis: AnalysisFn;
	readonly toks: TokensFn;
	readonly row: RowFn;
	readonly param: ParamFn;
	readonly display: DisplayFn;
	readonly json: string;
	readonly call: CallFn;
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

export type TypeDisplayOf<
	E extends EngineTypes,
	T extends string,
> = (E["display"] & {
	readonly t: T;
})["out"];

export type CallOf<
	E extends EngineTypes,
	DB,
	TM,
	Keys,
	Q extends string,
> = (E["call"] & {
	readonly db: DB;
	readonly tm: TM;
	readonly keys: Keys;
	readonly q: Q;
})["out"];

export type CallEntry = {
	readonly m: unknown;
	readonly k: string;
	readonly g: unknown;
	readonly p: readonly unknown[];
	readonly q: unknown;
};
