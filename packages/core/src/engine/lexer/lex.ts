import type { SqlError } from "../errors.js";
import type { Digit, HexDigit, IdChar, IdStart, NonIdAscii, Upper, Ws } from "./chars.js";
import type { IdTok, NumTok, OpTok, ParamTok, StrTok, Tok, WordTok } from "./tokens.js";
import type { Next } from "./next.js";

type Nx<I extends number> = Next[I];

/**
 * Type-level lexer. `Lex<Q>` is a tuple of tokens or an `SqlError<message, tokenIndex>`
 * (the index of the token that could not be produced).
 *
 * Budget strategy: the main loop handles one token per iteration (whitespace and
 * comments are consumed in nested loops). After `ChunkSize` tokens the loop restarts so
 * the 1000-iteration tail-recursion cap is never hit; the outer loop concatenates chunks.
 * The budget is a numeric counter (`Nx`), not a tuple that is sliced each step: slicing
 * a 250-element tuple per token cost 42% of the lexer's check time.
 *
 * Helpers that can fail (`TakeQuoted`, `LexOp`, `SkipBlock`) return `null`, never
 * `never`: `never extends [infer A, infer B]` takes the true branch.
 */
export type Lex<Q extends string> = LexAll<Q, []>;

/** Tokens per chunk: restart the loop before the 1000-iteration tail-recursion cap. */
type ChunkSize = 250;

type LexAll<S extends string, Acc extends readonly Tok[]> =
  LexChunk<S, [], 0> extends infer R
    ? R extends ["done", infer T extends readonly Tok[]] ? [...Acc, ...T]
    : R extends ["more", infer T extends readonly Tok[], infer Rest extends string] ? LexAll<Rest, [...Acc, ...T]>
    : R extends ["err", infer M extends string, infer T extends readonly Tok[]] ? SqlError<M, [...Acc, ...T]["length"]>
    : never
    : never;

type LexChunk<S extends string, Acc extends readonly Tok[], B extends number> =
  S extends "" ? ["done", Acc]
  : B extends ChunkSize ? ["more", Acc, S]
  : LexStep<S, Acc, Nx<B>>;

/** Error marker carrying the chunk-local tokens so the outer loop can compute the token index. */
type Err<M extends string, Acc extends readonly Tok[]> = ["err", M, Acc];

/** Four-character operators. */
type Op4 = "!~~*";
/** Three-character operators. */
type Op3 = "->>" | "#>>" | "!~*" | "!~~" | "~~*" | "<->" | "||/" | "<<=" | ">>=" | "-|-" | "@-@" | "@@@" | "?-|" | "?||";
/** Two-character operators. */
type Op2 =
  | "::" | "->" | "#>" | "@>" | "<@" | "?|" | "?&" | "||" | "<=" | ">=" | "<>" | "!=" | "!~" | "~*" | "~~"
  | "#-" | "&&" | "@@" | "<<" | ">>" | ":=" | "=>" | "@?" | "|/" | "!!" | "&<" | "&>" | "?-" | "?#" | "##" | "<^" | ">^" | "~=";
/** Single-character operators and punctuation. */
type Op1 =
  | "(" | ")" | "," | ";" | "." | "[" | "]" | "+" | "-" | "*" | "/" | "%" | "^" | "<" | ">" | "=" | "~"
  | "!" | "@" | "#" | "&" | "|" | "?" | ":";

type LexStep<S extends string, Acc extends readonly Tok[], B extends number> =
  S extends `${infer C}${infer R}`
    ? C extends Ws ? LexChunk<SkipWs<R>, Acc, B>
    : C extends IdStart
      ? (S extends `${"E" | "e"}'${infer R1}`
          ? (TakeEscaped<R1, ""> extends [infer V extends string, infer R2 extends string]
              ? LexChunk<R2, [...Acc, StrTok<V>], B>
              : Err<"unterminated quoted string", Acc>)
        : S extends `${"B" | "b" | "X" | "x"}'${infer R1}`
          ? (TakeQuoted<R1, "'", ""> extends [infer V extends string, infer R2 extends string]
              ? LexChunk<R2, [...Acc, StrTok<V>], B>
              : Err<"unterminated quoted string", Acc>)
        : TakeWord<R, C, false> extends [infer V extends string, infer R2 extends string, infer NonAscii extends boolean]
          ? LexChunk<R2, [...Acc, WordTok<NonAscii extends true ? FoldAscii<V, ""> : Lowercase<V>>], B>
          : never)
    : C extends Digit
      ? (TakeNumber<S> extends [infer V extends string, infer R2 extends string]
          ? LexChunk<R2, [...Acc, NumTok<V>], B>
          : never)
    : S extends `--${infer R1}` ? LexChunk<SkipLine<R1>, Acc, B>
    : S extends `/*${infer R1}`
      ? (SkipBlock<R1, [0]> extends infer R2 ? (R2 extends string ? LexChunk<R2, Acc, B> : Err<"unterminated /* comment", Acc>) : never)
    : C extends '"'
      ? (TakeQuoted<R, '"', ""> extends [infer V extends string, infer R2 extends string]
          ? LexChunk<R2, [...Acc, IdTok<V>], B>
          : Err<"unterminated quoted identifier", Acc>)
    : C extends "'"
      ? (TakeQuoted<R, "'", ""> extends [infer V extends string, infer R2 extends string]
          ? LexChunk<R2, [...Acc, StrTok<V>], B>
          : Err<"unterminated quoted string", Acc>)
    : C extends "$"
      ? (R extends `${infer D extends Digit}${infer R1}`
          ? (TakeDigits<R1, D> extends [infer V extends string, infer R2 extends string]
              ? LexChunk<R2, [...Acc, ParamTok<ToNum<V>>], B>
              : never)
          : R extends `${infer Tag}$${infer R1}`
            ? (Tag extends `${IdStart}${string}` | ""
                ? (R1 extends `${infer Body}$${Tag}$${infer R2}` ? LexChunk<R2, [...Acc, StrTok<Body>], B> : Err<"unterminated dollar-quoted string", Acc>)
                : Err<`syntax error at or near "$"`, Acc>)
            : Err<`syntax error at or near "$"`, Acc>)
    : S extends `.${Digit}${string}`
      ? (TakeNumber<S> extends [infer V extends string, infer R2 extends string]
          ? LexChunk<R2, [...Acc, NumTok<V>], B>
          : never)
    : LexOp<C, R> extends [infer O extends string, infer R2 extends string] ? LexChunk<R2, [...Acc, OpTok<O>], B>
    : C extends NonIdAscii ? Err<`unexpected character "${C}"`, Acc>
    : TakeWord<R, C, true> extends [infer V extends string, infer R2 extends string, boolean]
      ? LexChunk<R2, [...Acc, WordTok<FoldAscii<V, "">>], B>
      : never
  : never;

/**
 * Longest-match operator: try 4, 3, 2, then 1 chars. (A union-constrained `infer`
 * only ever matches a single character, so the candidates are built explicitly.)
 * `null` when `C` does not start an operator.
 */
type LexOp<C extends string, R extends string> =
  R extends `${infer D}${infer E}${infer F}${infer R4}`
    ? `${C}${D}${E}${F}` extends Op4 ? [`${C}${D}${E}${F}`, R4]
    : `${C}${D}${E}` extends Op3 ? [`${C}${D}${E}`, `${F}${R4}`]
    : `${C}${D}` extends Op2 ? [`${C}${D}`, `${E}${F}${R4}`]
    : C extends Op1 ? [C, R]
    : null
  : R extends `${infer D}${infer E}${infer R3}`
    ? `${C}${D}${E}` extends Op3 ? [`${C}${D}${E}`, R3]
    : `${C}${D}` extends Op2 ? [`${C}${D}`, `${E}${R3}`]
    : C extends Op1 ? [C, R]
    : null
  : R extends `${infer D}${infer R2}`
    ? `${C}${D}` extends Op2 ? [`${C}${D}`, R2]
    : C extends Op1 ? [C, R]
    : null
  : C extends Op1 ? [C, R]
  : null;

type SkipWs<S extends string> = S extends `${Ws}${infer R}` ? SkipWs<R> : S;
type SkipLine<S extends string> = S extends `${infer _}\n${infer R}` ? R : "";

/**
 * Skip a (possibly nested) block comment. `S` is just after the opening `/*`; `Depth`
 * holds one entry per open comment. Each `/*` before the next `*\/` opens a level.
 * Result: the rest of the input, or `null` when unterminated.
 */
type SkipBlock<S extends string, Depth extends readonly unknown[]> =
  S extends `${infer Pre}*/${infer R}`
    ? CountOpens<Pre, Depth> extends readonly [unknown, ...infer D2]
      ? D2 extends readonly [] ? R : SkipBlock<R, D2>
      : never
    : null;
type CountOpens<S extends string, Depth extends readonly unknown[]> =
  S extends `${string}/*${infer R}` ? CountOpens<R, [...Depth, 0]> : Depth;

/** Consume up to the closing quote `Qc`, unescaping doubled quotes. `null` when unterminated. */
type TakeQuoted<S extends string, Qc extends string, Acc extends string> =
  S extends `${infer Body}${Qc}${infer R}`
    ? R extends `${Qc}${infer R2}` ? TakeQuoted<R2, Qc, `${Acc}${Body}${Qc}`> : [`${Acc}${Body}`, R]
    : null;

/** `E'...'` body: like `TakeQuoted` but a backslash-escaped quote does not terminate. Escapes are kept raw. */
type TakeEscaped<S extends string, Acc extends string> =
  S extends `${infer Body}'${infer R}`
    ? Body extends `${string}\\` ? TakeEscaped<R, `${Acc}${Body}'`>
    : R extends `'${infer R2}` ? TakeEscaped<R2, `${Acc}${Body}'`>
    : [`${Acc}${Body}`, R]
    : null;

/**
 * Identifier characters: ASCII `IdChar`, or any non-ASCII character. `NonAscii` records
 * whether a non-ASCII character was seen (then only ASCII letters are folded).
 * Result: `[word, rest, nonAscii]`.
 */
type TakeWord<S extends string, Acc extends string, NonAscii extends boolean> =
  S extends `${infer C}${infer R}`
    ? C extends IdChar ? TakeWord<R, `${Acc}${C}`, NonAscii>
    : C extends NonIdAscii ? [Acc, S, NonAscii]
    : TakeWord<R, `${Acc}${C}`, true>
    : [Acc, S, NonAscii];

/** Lowercase ASCII letters only (Postgres folding in UTF-8 databases). */
type FoldAscii<S extends string, Acc extends string> =
  S extends `${infer C}${infer R}` ? FoldAscii<R, `${Acc}${C extends Upper ? Lowercase<C> : C}`> : Acc;

type TakeDigits<S extends string, Acc extends string> =
  S extends `${infer C}${infer R}` ? (C extends Digit ? TakeDigits<R, `${Acc}${C}`> : [Acc, S]) : [Acc, S];

/** `0x…`, `0o…`, `0b…`, or `digits [ . digits ] [ e [+-] digits ]`; `_` separators are accepted. */
type TakeNumber<S extends string> =
  S extends `0${"x" | "X"}${infer R}` ? TakeRadix<R, HexDigit | "_", "0x">
  : S extends `0${"o" | "O"}${infer R}` ? TakeRadix<R, Digit | "_", "0o">
  : S extends `0${"b" | "B"}${infer R}` ? TakeRadix<R, "0" | "1" | "_", "0b">
  : TakeDecimal<S, "">;
type TakeRadix<S extends string, D extends string, Acc extends string> =
  S extends `${infer C}${infer R}` ? (C extends D ? TakeRadix<R, D, `${Acc}${C}`> : [Acc, S]) : [Acc, S];
type TakeDecimal<S extends string, Acc extends string> =
  S extends `${infer C extends Digit | "." | "_"}${infer R}` ? TakeDecimal<R, `${Acc}${C}`>
  : S extends `${infer E extends "e" | "E"}${infer Sign extends "+" | "-"}${infer D extends Digit}${infer R}` ? TakeDigits<R, `${Acc}${E}${Sign}${D}`>
  : S extends `${infer E extends "e" | "E"}${infer D extends Digit}${infer R}` ? TakeDigits<R, `${Acc}${E}${D}`>
  : [Acc, S];

type ToNum<S extends string> = S extends `${infer N extends number}` ? N : never;
