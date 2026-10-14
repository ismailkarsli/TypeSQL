/**
 * Token shapes. One object type per token; the parser pattern-matches on `k`.
 *
 * - `w`  word: unquoted identifier or keyword, folded to lowercase (Postgres folding).
 *         The parser decides whether a word is a keyword or an identifier.
 * - `id` quoted identifier, case preserved, `""` unescaped to `"`.
 * - `n`  numeric literal, verbatim.
 * - `s`  string literal contents (`''` unescaped to `'`; E'' escapes kept raw).
 * - `$`  positional parameter `$n` with `v = n`.
 * - `o`  operator or punctuation, verbatim (longest match).
 *
 * Tokens do not carry positions; see `errors.ts` for how positions are recovered.
 */
export type WordTok<V extends string = string> = { readonly k: "w"; readonly v: V };
export type IdTok<V extends string = string> = { readonly k: "id"; readonly v: V };
export type NumTok<V extends string = string> = { readonly k: "n"; readonly v: V };
export type StrTok<V extends string = string> = { readonly k: "s"; readonly v: V };
export type ParamTok<N extends number = number> = { readonly k: "$"; readonly v: N };
export type OpTok<V extends string = string> = { readonly k: "o"; readonly v: V };

export type Tok = WordTok | IdTok | NumTok | StrTok | ParamTok | OpTok;
export type Toks = readonly Tok[];
