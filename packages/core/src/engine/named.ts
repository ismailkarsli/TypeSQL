import type { SqlError } from "./errors.js";
import type { OpTok, ParamTok, Tok, Toks, WordTok } from "./lexer/tokens.js";
import type { Nx } from "./parser/util.js";
import type { Opaque, SplitFirst } from "./inline.js";

/**
 * Named parameter sugar: `:name` is rewritten to `$k` where `k` is the position of the
 * name's first appearance. Done on the token stream, so `::` casts, `:=` and colons inside
 * string literals are never touched.
 *
 * `RewriteNamed<T>` → `[tokens, names]` (`names` is `[]` when the statement uses `$n`).
 * Mixing `:name` and `$n` is an error.
 */
export type RewriteNamed<T extends Toks> =
  HasNamed<T, 0> extends true ? Rewrite<T, 0, [], [], HasPositional<T, 0>> : [T, []];

/** Walks are unrolled ×4 so statements of ~4000 tokens stay under the 1000-iteration cap. */
type HasNamed<T extends Toks, I extends number> =
  T[I] extends Tok
    ? NamedAt<T, I> extends true ? true
    : NamedAt<T, Nx<I>> extends true ? true
    : NamedAt<T, Nx<Nx<I>>> extends true ? true
    : NamedAt<T, Nx<Nx<Nx<I>>>> extends true ? true
    : HasNamed<T, Nx<Nx<Nx<Nx<I>>>>>
    : false;
type NamedAt<T extends Toks, I extends number> = T[I] extends OpTok<":"> ? (T[Nx<I>] extends WordTok ? true : false) : false;

type HasPositional<T extends Toks, I extends number> =
  T[I] extends Tok
    ? T[I] extends ParamTok ? true
    : T[Nx<I>] extends ParamTok ? true
    : T[Nx<Nx<I>>] extends ParamTok ? true
    : T[Nx<Nx<Nx<I>>>] extends ParamTok ? true
    : HasPositional<T, Nx<Nx<Nx<Nx<I>>>>>
    : false;

type Rewrite<T extends Toks, I extends number, Acc extends Tok[], Names extends string[], Mixed extends boolean> =
  Mixed extends true ? SqlError<"cannot mix named (:name) and positional ($n) parameters", I>
  : T[I] extends OpTok<":">
    ? T[Nx<I>] extends WordTok<infer Name>
      ? Rewrite<T, Nx<Nx<I>>, [...Acc, ParamTok<IndexOf<Names, Name>>], Name extends Names[number] ? Names : [...Names, Name], false>
      : Rewrite<T, Nx<I>, [...Acc, OpTok<":">], Names, false>
  : T[I] extends Tok ? Rewrite<T, Nx<I>, [...Acc, T[I]], Names, false>
  : [Acc, Names];

/** 1-based position of `Name` in `Names`, or `Names["length"] + 1` when absent. */
type IndexOf<Names extends string[], Name extends string, Acc extends unknown[] = []> =
  Names extends [infer H, ...infer R extends string[]]
    ? H extends Name ? [...Acc, 0]["length"] : IndexOf<R, Name, [...Acc, 0]>
    : [...Acc, 0]["length"];

/** Object type for named parameters given the positional tuple (`names[i]` ↔ `params[i]`). */
export type NamedParams<Names extends readonly string[], Params extends readonly unknown[], Acc = {}> =
  Names extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? Params extends readonly [infer P, ...infer PR extends readonly unknown[]]
      ? NamedParams<R, PR, Acc & { [K in H]: P }>
      : NamedParams<R, [], Acc & { [K in H]: unknown }>
    : { [K in keyof Acc]: Acc[K] };

// ───────────────────────────── string-level rewrite (call sites, fragments) ─────────────────────────────

/**
 * `RewriteNamedStr<Text>` → `[text with :name → $k, names]`, operating on the literal
 * itself (needed before fragment splicing). Quoted strings, quoted identifiers and comments
 * are copied verbatim (as the runtime does); `::` and `:=` are not parameters.
 */
export type RewriteNamedStr<Text extends string> =
  MayHaveName<Text> extends true ? NamedLoop<Text, "", []> : [Text, []];

/**
 * `true` when some `:` (not part of `::`) is followed by a name start, ignoring quotes and
 * comments: a cheap pre-check so that texts whose only colons are `::` casts skip the rewrite.
 */
type MayHaveName<S extends string> =
  S extends `${string}:${infer Rest}`
    ? Rest extends `${infer C}${infer R2}` ? (C extends ":" ? MayHaveName<R2> : C extends NStart ? true : MayHaveName<Rest>) : false
    : false;

type NamedLoop<T extends string, Acc extends string, Names extends string[]> =
  SplitFirst<T> extends [infer Code extends string, infer O extends string, infer Rest extends string]
    ? RewriteCode<Code, "", Names> extends [infer C extends string, infer N2 extends string[]]
      ? O extends "" ? [`${Acc}${C}`, N2]
      : Opaque<O, Rest> extends [infer Seg extends string, infer After extends string] ? NamedLoop<After, `${Acc}${C}${O}${Seg}`, N2> : never
      : never
    : never;

type NStart = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z"
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z" | "_";
type NChar = NStart | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** Rewrite `:name` occurrences in a quote-free code segment. */
type RewriteCode<S extends string, Acc extends string, Names extends string[]> =
  S extends `${infer Pre}:${infer Rest}`
    ? Rest extends `${infer C}${infer Rest2}`
      ? C extends ":" | "=" ? RewriteCode<Rest2, `${Acc}${Pre}:${C}`, Names>
      : C extends NStart
        ? TakeName<Rest2, C> extends [infer Name extends string, infer Rest3 extends string]
          ? RewriteCode<Rest3, `${Acc}${Pre}$${IndexOf<Names, Name>}`, Name extends Names[number] ? Names : [...Names, Name]>
          : never
        : RewriteCode<Rest, `${Acc}${Pre}:`, Names>
      : [`${Acc}${S}`, Names]
    : [`${Acc}${S}`, Names];
type TakeName<S extends string, Acc extends string> =
  S extends `${infer C}${infer R}` ? (C extends NChar ? TakeName<R, `${Acc}${C}`> : [Acc, S]) : [Acc, S];
