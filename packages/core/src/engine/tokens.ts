/** A token of any dialect's lexer: its kind and value; dialects add fields. */
export type Tok = { readonly k: string; readonly v: unknown };
export type Toks = readonly Tok[];

/** A parse result: the node and the index of the next token. */
export type Ok<N, J extends number> = readonly [N, J];

export type AtEnd<T extends Toks, I extends number> = T[I] extends Tok
	? false
	: true;
