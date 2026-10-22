import type { SqlError } from "./errors.js";
import type { Opaque, SplitFirst } from "./inline.js";

/**
 * Type-level fragment splicing. `Splice<Q, S>` substitutes every `{name}` slot in the
 * query literal `Q` with the text of `S[name]`, renumbering the fragment's `$n` to
 * follow the parameters already present (outer `$n` first, then fragments in order).
 *
 * Only `{identifier}` is a slot; `'{1,2}'` or `'{"a":1}'` inside literals are left alone.
 * A fragment whose text is not a literal (`sql.raw`, `sql.join` over a non-tuple array)
 * makes the result `string`, which `Validate` reports as a dynamic fragment.
 */
export type Splice<Q extends string, S> =
  string extends Q ? string : SpliceLoop<Q, S, MaxParamStr<Q>, "">;

type SpliceLoop<Q extends string, S, Off extends number, Acc extends string> =
  Q extends `${infer Pre}{${infer Name}}${infer Post}`
    ? IsSlotName<Name> extends true
      ? Name extends keyof S
        ? S[Name] extends { readonly text: infer FT extends string }
          ? string extends FT ? string
          : Renumber<FT, Off, ""> extends [infer NT extends string, infer NewOff extends number]
            ? SpliceLoop<Post, S, NewOff, `${Acc}${Pre}${NT}`>
            : never
          : string
        : SqlError<`unknown fragment slot {${Name}}`, null>
      : SpliceLoop<Post, S, Off, `${Acc}${Pre}{${Name}}`>
    : `${Acc}${Q}`;

/**
 * Carried value encodings of the slots, concatenated in the order `Splice` renumbers them
 * (each occurrence of a slot carries its fragment's values again). `C` maps slot name → tuple.
 */
export type SpliceCarried<Q extends string, C, Acc extends readonly unknown[] = []> =
  Q extends `${string}{${infer Name}}${infer Post}`
    ? IsSlotName<Name> extends true
      ? Name extends keyof C ? (C[Name] extends infer T extends readonly unknown[] ? SpliceCarried<Post, C, [...Acc, ...T]> : SpliceCarried<Post, C, Acc>) : Acc
      : SpliceCarried<Post, C, Acc>
    : Acc;

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type IdStart = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z"
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z" | "_";
type IdChar = IdStart | Digit;

type IsSlotName<N extends string> = N extends `${IdStart}${infer R}` ? AllIdChars<R> : false;
type AllIdChars<S extends string> = S extends "" ? true : S extends `${infer C}${infer R}` ? (C extends IdChar ? AllIdChars<R> : false) : false;

/** Slot names present in a query literal. */
export type SlotNames<Q extends string> =
  Q extends `${string}{${infer Name}}${infer Post}` ? (IsSlotName<Name> extends true ? Name | SlotNames<Post> : SlotNames<Post>) : never;

export type HasSlots<Q extends string> = [SlotNames<Q>] extends [never] ? false : true;

/**
 * Renumber `$n` placeholders in a fragment by `Off`: `[newText, highestNumberSeen]`.
 * (`$$`-quoted bodies and literals are not special-cased at the type level; fragments
 * with `$1` inside string literals are rare and the runtime handles them correctly.)
 */
type Renumber<T extends string, Off extends number, Acc extends string> =
  T extends `${infer Pre}$${infer D extends Digit}${infer Rest}`
    ? TakeDigits<Rest, D> extends [infer N extends string, infer R2 extends string]
      ? Add<ToNum<N>, Off> extends infer M extends number
        ? RenumberNext<R2, Off, `${Acc}${Pre}$${M}`, M>
        : never
      : never
    : [`${Acc}${T}`, Off];
type RenumberNext<T extends string, Off extends number, Acc extends string, Max extends number> =
  Renumber<T, Off, Acc> extends [infer Txt extends string, infer M2 extends number] ? [Txt, Gt<M2, Max> extends true ? M2 : Max] : never;

type TakeDigits<S extends string, Acc extends string> =
  S extends `${infer C extends Digit}${infer R}` ? TakeDigits<R, `${Acc}${C}`> : [Acc, S];
type ToNum<S extends string> = S extends `${infer N extends number}` ? N : never;

/**
 * Highest `$n` in a literal (0 if none), outside quoted strings, quoted identifiers and
 * comments (like the runtime's `maxParam`).
 */
export type MaxParamStr<T extends string, Max extends number = 0> =
  T extends `${string}$${string}` ? MaxLoop<T, Max> : Max;
type MaxLoop<T extends string, Max extends number> =
  SplitFirst<T> extends [infer Code extends string, infer O extends string, infer Rest extends string]
    ? MaxIn<Code, Max> extends infer M extends number
      ? O extends "" ? M : Opaque<O, Rest> extends [string, infer After extends string] ? MaxLoop<After, M> : M
      : never
    : never;
type MaxIn<T extends string, Max extends number> =
  T extends `${string}$${infer D extends Digit}${infer Rest}`
    ? TakeDigits<Rest, D> extends [infer N extends string, infer R2 extends string]
      ? MaxIn<R2, Gt<ToNum<N>, Max> extends true ? ToNum<N> : Max>
      : never
    : Max;

type Tup<N extends number, A extends unknown[] = []> = A["length"] extends N ? A : Tup<N, [...A, 0]>;
type Add<A extends number, B extends number> = [...Tup<A>, ...Tup<B>]["length"] & number;
type Gt<A extends number, B extends number> = Tup<B> extends [...Tup<A>, ...unknown[]] ? false : true;

/** Tuple of `N` `unknown`s (untyped fragment parameters). */
export type UnknownTuple<N extends number, Acc extends unknown[] = []> = Acc["length"] extends N ? Acc : UnknownTuple<N, [...Acc, unknown]>;

/** First `N` elements of a tuple. */
export type Take<T extends readonly unknown[], N extends number, Acc extends unknown[] = []> =
  Acc["length"] extends N ? Acc : T extends readonly [infer H, ...infer R] ? Take<R, N, [...Acc, H]> : Acc;

/** Quoted identifier text for `sql.id(...)`: `"a"."b"` with embedded quotes doubled. */
export type QuotedIdent<Parts extends readonly string[]> =
  Parts extends readonly [infer P extends string] ? `"${Dq<P>}"`
  : Parts extends readonly [infer P extends string, ...infer R extends readonly string[]] ? `"${Dq<P>}".${QuotedIdent<R>}`
  : string;
type Dq<S extends string> = S extends `${infer A}"${infer B}` ? `${A}""${Dq<B>}` : S;

type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (u: infer I) => void ? I : never;
type LastOf<U> = UnionToIntersection<U extends unknown ? (x: U) => void : never> extends (x: infer L) => void ? L : never;
/**
 * Union → tuple, in TypeScript's internal member order (stable for a given program). Tail
 * recursive; O(n²) in the union size, so only for unions of list elements or columns.
 */
export type UnionList<U, Acc extends readonly unknown[] = []> =
  [U] extends [never] ? Acc : LastOf<U> extends infer L ? UnionList<Exclude<U, L>, [L, ...Acc]> : never;

/** Text of `sql.join([f1, f2], sep)` for tuple inputs; `string` for arrays. */
export type JoinedText<Items extends readonly { readonly text: string }[], Sep extends string, Off extends number = 0, Acc extends string = "", First extends boolean = true> =
  Items extends readonly [infer H, ...infer R extends readonly { readonly text: string }[]]
    ? H extends { readonly text: infer FT extends string }
      ? string extends FT ? string
      : Renumber<FT, Off, ""> extends [infer NT extends string, infer NewOff extends number]
        ? JoinedText<R, Sep, NewOff, First extends true ? NT : `${Acc}${Sep}${NT}`, false>
        : never
      : string
    : Items extends readonly [] ? Acc
    : number extends Items["length"] ? string
    : Acc;
