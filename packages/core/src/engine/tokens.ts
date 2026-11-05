export type WordTok<V extends string = string> = {
	readonly k: "w";
	readonly v: V;
};
export type IdTok<V extends string = string> = {
	readonly k: "id";
	readonly v: V;
};
export type NumTok<V extends string = string> = {
	readonly k: "n";
	readonly v: V;
};
export type StrTok<V extends string = string> = {
	readonly k: "s";
	readonly v: V;
};
export type BitTok<V extends string = string> = StrTok<V> & {
	readonly bits: true;
};
export type ParamTok<N extends number = number> = {
	readonly k: "$";
	readonly v: N;
};
export type OpTok<V extends string = string> = {
	readonly k: "o";
	readonly v: V;
};

/** A MySQL user or system variable, `@name` or `@@name`. */
type VarTok<V extends string = string> = {
	readonly k: "v";
	readonly v: V;
};

export type Tok = WordTok | IdTok | NumTok | StrTok | ParamTok | OpTok | VarTok;
export type Toks = readonly Tok[];
