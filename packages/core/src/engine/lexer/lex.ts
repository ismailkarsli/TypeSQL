import type { SqlError } from "../errors.js";
import type { Digit, HexDigit, IdChar, IdStart, NonIdAscii, Upper, Ws } from "./chars.js";
import type { IdTok, NumTok, OpTok, ParamTok, StrTok, Tok, WordTok } from "./tokens.js";
import type { Next } from "./next.js";
import type { CheckEscapes, CheckUEscapes, DecodeU, UEscape } from "./unicode.js";

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
 * Dispatch on the first character, cheapest checks first: words, numbers, then punctuation
 * that needs no lookahead (`Punct1`) and `=`, `:`, `.` with one character of lookahead,
 * before comments, quotes and the general `LexOp` (which builds 2–4 character candidates).
 * The fast paths cut the lexer's instantiations by ~20% on the bench queries.
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
/** Punctuation that never starts a longer operator, a comment or a number: one token, no lookahead. */
type Punct1 = "(" | ")" | "," | ";" | "[" | "]" | "+" | "*" | "%" | "^";
/** Single-character operators and punctuation. */
type Op1 =
  | "(" | ")" | "," | ";" | "." | "[" | "]" | "+" | "-" | "*" | "/" | "%" | "^" | "<" | ">" | "=" | "~"
  | "!" | "@" | "#" | "&" | "|" | "?" | ":";

type LexStep<S extends string, Acc extends readonly Tok[], B extends number> =
  S extends `${infer C}${infer R}`
    ? C extends Ws ? LexChunk<SkipWs<R>, Acc, B>
    : C extends IdStart
      ? (R extends `${infer Q extends "'" | "&"}${infer R1}` // one check per word for E'', B'', X'', U&'', U&""
          ? (Q extends "'"
              ? (C extends "E" | "e" ? LexEString<R1, Acc, B>
                : C extends "B" | "b" | "X" | "x" ? LexString<TakeString<R1, "">, Acc, B>
                : LexWord<R, C, Acc, B>)
            : C extends "U" | "u"
              ? (R1 extends `'${infer R2}` ? LexUString<R2, Acc, B> : R1 extends `"${infer R2}` ? LexUIdent<R2, Acc, B> : LexWord<R, C, Acc, B>)
            : LexWord<R, C, Acc, B>)
          : LexWord<R, C, Acc, B>)
    : C extends Digit ? LexShortInt<S, R, C, Acc, B, []>
    : C extends Punct1 ? LexChunk<R, [...Acc, OpTok<C>], B>
    : C extends "=" ? (R extends `>${infer R2}` ? LexChunk<R2, [...Acc, OpTok<"=>">], B> : LexChunk<R, [...Acc, OpTok<"=">], B>)
    : C extends ":" ? (R extends `:${infer R2}` ? LexChunk<R2, [...Acc, OpTok<"::">], B> : R extends `=${infer R2}` ? LexChunk<R2, [...Acc, OpTok<":=">], B> : LexChunk<R, [...Acc, OpTok<":">], B>)
    : C extends "." ? (R extends `${Digit}${string}` ? LexNumber<S, Acc, B> : LexChunk<R, [...Acc, OpTok<".">], B>)
    : S extends `--${infer R1}` ? LexChunk<SkipLine<R1>, Acc, B>
    : S extends `/*${infer R1}`
      ? (SkipBlock<R1, [0]> extends infer R2 ? (R2 extends string ? LexChunk<R2, Acc, B> : Err<"unterminated /* comment", Acc>) : never)
    : C extends '"'
      ? (TakeQuoted<R, '"', ""> extends [infer V extends string, infer R2 extends string]
          ? (V extends "" ? Err<ZeroLength, Acc> : LexChunk<R2, [...Acc, IdTok<V>], B>)
          : Err<"unterminated quoted identifier", Acc>)
    : C extends "'" ? LexString<TakeString<R, "">, Acc, B>
    : C extends "$"
      ? (R extends `${infer D extends Digit}${infer R1}`
          ? (TakeDigits<R1, D> extends [infer V extends string, infer R2 extends string]
              ? (JunkAt<R2> extends infer J extends string ? Err<`trailing junk after parameter at or near "$${V}${J}"`, Acc> : LexChunk<R2, [...Acc, ParamTok<ToNum<V>>], B>)
              : never)
          : R extends `${infer Tag}$${infer R1}`
            ? (Tag extends `${IdStart}${string}` | ""
                ? (R1 extends `${infer Body}$${Tag}$${infer R2}` ? LexChunk<R2, [...Acc, StrTok<Body>], B> : Err<"unterminated dollar-quoted string", Acc>)
                : Err<`syntax error at or near "$"`, Acc>)
            : Err<`syntax error at or near "$"`, Acc>)
    : LexOp<C, R> extends [infer O extends string, infer R2 extends string] ? LexChunk<R2, [...Acc, OpTok<O>], B>
    : C extends NonIdAscii ? Err<`unexpected character "${C}"`, Acc>
    : TakeWord<R, C, true> extends [infer V extends string, infer R2 extends string, boolean]
      ? LexChunk<R2, [...Acc, WordTok<FoldAscii<V, "">>], B>
      : never
  : never;

/** A string literal token from `[value, rest]`, or "unterminated quoted string". */
type LexString<X, Acc extends readonly Tok[], B extends number> =
  X extends [infer V extends string, infer R2 extends string] ? LexChunk<R2, [...Acc, StrTok<V>], B> : Err<"unterminated quoted string", Acc>;

/** `E'...'`: backslash escapes (kept raw), `\u` / `\U` escapes validated. */
type LexEString<R1 extends string, Acc extends readonly Tok[], B extends number> =
  TakeEString<R1, ""> extends [infer V extends string, infer R2 extends string]
    ? (CheckEscapes<V> extends infer M extends string ? Err<M, Acc> : LexChunk<R2, [...Acc, StrTok<V>], B>)
    : Err<"unterminated quoted string", Acc>;

/** `U&'...' [UESCAPE 'c']`: the value stays raw; its escapes are validated (unicode.ts). */
type LexUString<R1 extends string, Acc extends readonly Tok[], B extends number> =
  TakeString<R1, ""> extends [infer V extends string, infer R2 extends string]
    ? UEscape<R2> extends infer U
      ? U extends [infer E extends string, infer R3 extends string]
        ? (CheckUEscapes<V, E> extends infer M extends string ? Err<M, Acc> : LexChunk<R3, [...Acc, StrTok<V>], B>)
        : Err<U & string, Acc>
      : never
    : Err<"unterminated quoted string", Acc>;

/** `U&"..." [UESCAPE 'c']`: a quoted identifier with its escapes decoded. */
type LexUIdent<R1 extends string, Acc extends readonly Tok[], B extends number> =
  TakeQuoted<R1, '"', ""> extends [infer V extends string, infer R2 extends string]
    ? V extends "" ? Err<ZeroLength, Acc>
    : UEscape<R2> extends infer U
      ? U extends [infer E extends string, infer R3 extends string]
        ? (CheckUEscapes<V, E> extends infer M extends string ? Err<M, Acc> : LexChunk<R3, [...Acc, IdTok<DecodeU<V, E>>], B>)
        : Err<U & string, Acc>
      : never
    : Err<"unterminated quoted identifier", Acc>;

type ZeroLength = 'zero-length delimited identifier at or near """"';

/**
 * Fast path for the common short integer (`LIMIT 20`, `= 1`): up to four digits followed by
 * whitespace or punctuation other than `.`. Anything else goes to `LexNumber`, from the start `S0`.
 */
type LexShortInt<S0 extends string, R extends string, V extends string, Acc extends readonly Tok[], B extends number, K extends readonly unknown[]> =
  R extends `${infer N}${infer R2}`
    ? N extends Digit ? (K extends readonly [0, 0, 0] ? LexNumber<S0, Acc, B> : LexShortInt<S0, R2, `${V}${N}`, Acc, B, [...K, 0]>)
    : N extends "." ? LexNumber<S0, Acc, B>
    : N extends NonIdAscii ? LexChunk<R, [...Acc, NumTok<V>], B>
    : LexNumber<S0, Acc, B>
    : LexChunk<R, [...Acc, NumTok<V>], B>;

/**
 * A number, then a check that no identifier character follows it (`123abc`, `1x`, `100_` are
 * "trailing junk", as in Postgres 15+).
 */
type LexNumber<S extends string, Acc extends readonly Tok[], B extends number> =
  TakeNumber<S> extends infer N
    ? N extends [infer V extends string, infer R2 extends string]
      ? (JunkAt<R2> extends infer J extends string ? Err<`trailing junk after numeric literal at or near "${V}${J}"`, Acc> : LexChunk<R2, [...Acc, NumTok<V>], B>)
      : Err<N & string, Acc>
    : never;

/** The first character of `R` when it would continue an identifier (a letter, `_` or a non-ASCII character), else `null`. */
type JunkAt<R extends string> =
  R extends `${infer C}${string}` ? (C extends IdStart ? C : C extends NonIdAscii | Digit | "$" ? null : C) : null;

/** An unquoted identifier or keyword starting with `C`, folded to lowercase. */
type LexWord<R extends string, C extends string, Acc extends readonly Tok[], B extends number> =
  TakeWord<R, C, false> extends [infer V extends string, infer R2 extends string, infer NonAscii extends boolean]
    ? LexChunk<R2, [...Acc, WordTok<NonAscii extends true ? FoldAscii<V, ""> : Lowercase<V>>], B>
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

type SkipWs<S extends string> = S extends `${infer C}${infer R}` ? (C extends Ws ? SkipWs<R> : S) : S;
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
    ? OddBackslashes<Body> extends true ? TakeEscaped<R, `${Acc}${Body}'`>
    : R extends `'${infer R2}` ? TakeEscaped<R2, `${Acc}${Body}'`>
    : [`${Acc}${Body}`, R]
    : null;
/** Does `S` end in an odd number of backslashes (so that a quote after it is escaped)? `\\` is an escaped backslash. */
type OddBackslashes<S extends string> = S extends `${infer P}\\` ? (OddBackslashes<P> extends true ? false : true) : false;

/**
 * A `'...'` literal and its continuations: Postgres joins string literals separated by whitespace
 * that contains a newline (`'a'` newline `'b'` is `'ab'`). `[value, rest]` or `null`.
 */
type TakeString<S extends string, Acc extends string> =
  TakeQuoted<S, "'", ""> extends [infer V extends string, infer R extends string]
    ? Continuation<R> extends infer R1 extends string ? TakeString<R1, `${Acc}${V}`> : [`${Acc}${V}`, R]
    : null;
type TakeEString<S extends string, Acc extends string> =
  TakeEscaped<S, ""> extends [infer V extends string, infer R extends string]
    ? Continuation<R> extends infer R1 extends string ? TakeEString<R1, `${Acc}${V}`> : [`${Acc}${V}`, R]
    : null;
/** After a closing quote: the rest after the next opening quote when only whitespace with a newline is in between, else `null`. */
type Continuation<R extends string> =
  R extends `${infer W}'${infer R1}` ? (W extends `${string}\n${string}` ? (AllWs<W> extends true ? R1 : null) : null) : null;
type AllWs<W extends string> = W extends `${infer C}${infer R}` ? (C extends Ws ? AllWs<R> : false) : true;

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

/**
 * `0x…`, `0o…`, `0b…`, or `digits [ . [digits] ] [ e [+-] digits ]` (or `. digits …`), with
 * single `_` separators between digits, as Postgres 16+ scans them. `[value, rest]`, or the error
 * message for a prefix without digits or an exponent without digits.
 */
type TakeNumber<S extends string> =
  S extends `0${infer P extends "x" | "X" | "o" | "O" | "b" | "B"}${infer R}`
    ? (Lowercase<P> extends "x" ? TakeRadix<R, HexDigit, `0${P}`, "hexadecimal"> : Lowercase<P> extends "o" ? TakeRadix<R, OctDigit, `0${P}`, "octal"> : TakeRadix<R, "0" | "1", `0${P}`, "binary">)
    : TakeDecimal<S>;
type OctDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
type TakeRadix<S extends string, D extends string, Acc extends string, Kind extends string> =
  S extends `${infer C extends D}${infer R}` ? TakeRadix<R, D, `${Acc}${C}`, Kind>
  : S extends `_${infer C extends D}${infer R}` ? TakeRadix<R, D, `${Acc}_${C}`, Kind>
  : Acc extends `0${infer _P}${infer _D}${infer _R}` ? [Acc, S] // at least one digit after the prefix
  : `invalid ${Kind} integer at or near "${Acc}"`;
type TakeDecimal<S extends string> =
  DigitRun<S, ""> extends [infer Int extends string, infer R1 extends string]
    ? R1 extends `.${infer R2}`
      ? R2 extends `.${string}` ? [Int, R1] // `1..2`: the integer, then `..`
      : DigitRun<R2, ""> extends [infer Frac extends string, infer R3 extends string] ? TakeExponent<`${Int}.${Frac}`, R3> : never
      : TakeExponent<Int, R1>
    : never;
/**
 * Digits with single `_` separators between them, four at a time when possible (numbers can be
 * thousands of digits long). Characters are inferred unconstrained and tested afterwards: a
 * template built from `infer X extends Digit` parts is a 10^4-member union at declaration time.
 */
type DigitRun<S extends string, Acc extends string> =
  S extends `${infer A extends Digit}${infer R}`
    ? R extends `${infer B}${infer C}${infer D}${infer R2}` ? ([B | C | D] extends [Digit] ? DigitRun<R2, `${Acc}${A}${B}${C}${D}`> : DigitRun<R, `${Acc}${A}`>) : DigitRun<R, `${Acc}${A}`>
  : Acc extends "" ? [Acc, S]
  : S extends `_${infer A extends Digit}${infer R}` ? DigitRun<R, `${Acc}_${A}`>
  : [Acc, S];
type TakeExponent<V extends string, S extends string> =
  S extends `${infer E extends "e" | "E"}${infer R}`
    ? R extends `${infer Sign extends "+" | "-"}${infer R2}`
      ? (DigitRun<R2, ""> extends [infer X extends string, infer R3 extends string] ? (X extends "" ? `trailing junk after numeric literal at or near "${V}${E}${Sign}"` : [`${V}${E}${Sign}${X}`, R3]) : never)
      : (DigitRun<R, ""> extends [infer X extends string, infer R3 extends string] ? (X extends "" ? `trailing junk after numeric literal at or near "${V}${E}"` : [`${V}${E}${X}`, R3]) : never)
    : [V, S];

type ToNum<S extends string> = S extends `${infer N extends number}` ? N : never;
