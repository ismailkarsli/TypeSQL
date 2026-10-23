import type { ColInfo, Info } from "../types.js";
import type { AnyShaped, BaseOf, ShapedCommon, StripShape } from "../shape.js";
import type { LitCommon } from "../json.js";

/**
 * Operator typing. `BinOpType<Op, L, R>` → ColInfo, `UnOpType<Op, E>` → ColInfo.
 *
 * Every rule here was checked against PostgreSQL 17 (`select pg_typeof(...)`), see the
 * comments on the individual tables. Strict operators are nullable when either side is
 * nullable; JSON extraction operators are always nullable (missing key → NULL). Unknown
 * combinations yield `unknown` (nullable), which a cast fixes.
 *
 * Pseudo-types: `unknown` (untyped `$n`, unresolvable), `null` (the NULL literal), `lit` (an
 * untyped string literal in operand position, see `TypeOperand` in typeof.ts). Like
 * Postgres's `unknown` literal, `lit` takes the type of the other operand / branch and
 * defaults to `text`; it never leaves the typer (`LitToText`). A real `text` value does not
 * coerce: `jsonb || text` is `text`, `CASE ... 1 ELSE 'x'::text` has no common type.
 */

export type IntT = "int2" | "int4" | "int8";
export type FloatT = "float4" | "float8";
export type NumT = IntT | FloatT | "numeric";
export type StrT = "text" | "varchar" | "bpchar" | "char" | "name" | "citext";
export type JsonT = "json" | "jsonb";
export type TsT = "timestamp" | "timestamptz";
export type TimeT = "time" | "timetz";
export type DateTimeT = "date" | TimeT | TsT;
export type BitT = "bit" | "varbit";
/** Range or multirange type name (`int4range`, `tstzmultirange`, ...). */
export type RangeT = `${string}range`;
/** Pseudo-types that take the type of the other operand: NULL literal, untyped param. */
export type UnknownT = "unknown" | "null";
/** Untyped string literal (operand position only). */
export type LitT = "lit";
/** Resolve a leftover string-literal pseudo-type to `text` (Postgres's default for `unknown`). */
export type LitToText<T extends string> = T extends LitT ? "text" : T;

export type IsArr<T extends string> = T extends `${string}[]` ? true : false;
type Either<L extends boolean, R extends boolean> = L extends true ? true : R extends true ? true : false;

/**
 * Numeric promotion for arithmetic operators. Operator resolution prefers `float8`
 * (the numeric category's preferred type), so `numeric + float4` is `float8`:
 *   int2+int2 → int2, int2+int4 → int4, int4+int8 → int8, int4+numeric → numeric,
 *   int4+float4 → float8, float4*float4 → float4, numeric+float8 → float8.
 */
export type NumPromote<L extends string, R extends string> =
  "float8" extends L | R ? "float8"
  : "float4" extends L | R ? (L extends "float4" ? (R extends "float4" ? "float4" : "float8") : "float8")
  : "numeric" extends L | R ? "numeric"
  : "int8" extends L | R ? "int8"
  : "int4" extends L | R ? "int4"
  : "int2";

/**
 * Common numeric type for CASE / COALESCE / UNION / ARRAY (implicit cast chain
 * int2 → int4 → int8 → numeric → float4 → float8): `coalesce(1::float4, 2)` is `float4`,
 * `coalesce(1, 2.5)` is `numeric`.
 */
export type NumCommon<L extends string, R extends string> =
  "float8" extends L | R ? "float8"
  : "float4" extends L | R ? "float4"
  : "numeric" extends L | R ? "numeric"
  : "int8" extends L | R ? "int8"
  : "int4" extends L | R ? "int4"
  : "int2";

/** NULL and untyped string literals resolve like an untyped operand. */
type Norm<A extends string> = A extends "null" | LitT ? "unknown" : A;

export type BinOpType<Op extends string, L extends ColInfo, R extends ColInfo> =
  Info<BinOpResult<Op, Norm<L["type"]>, Norm<R["type"]>>, BinOpNullable<Op, L, R>>;

/** JSON extraction yields NULL for a missing key; `jsonb @@ jsonpath` yields NULL for a non-boolean result. */
type BinOpNullable<Op extends string, L extends ColInfo, R extends ColInfo> =
  Op extends "->" | "->>" | "#>" | "#>>" ? true
  : Op extends "@@" ? (L["type"] extends "jsonb" ? true : Either<L["nullable"], R["nullable"]>)
  : Either<L["nullable"], R["nullable"]>;

type BinOpResult<Op extends string, L extends string, R extends string> =
  Op extends "=" | "<" | ">" | "<=" | ">=" | "<>" | "!=" ? "bool"
  : Op extends "and" | "or" ? "bool"
  : Op extends "~" | "~*" | "!~" | "!~*" | "~~" | "~~*" | "!~~" | "!~~*" ? "bool"
  : Op extends "+" | "-" | "*" | "/" | "%" ? Arith<Op, L, R>
  : Op extends "||" ? Concat<L, R>
  : Op extends "->" | "#>" ? (L extends JsonT ? BaseOf<L> : "unknown")
  : Op extends "->>" | "#>>" ? "text"
  : Op extends "#-" ? "jsonb"
  : Op extends "@>" | "<@" | "?" | "?|" | "?&" | "@?" | "@@" | "-|-" | "~=" ? "bool"
  : Op extends "&&" ? (L extends "tsquery" ? "tsquery" : "bool")
  : Op extends "<->" ? (L extends "tsquery" ? "tsquery" : "float8")
  : Op extends "^" ? Pow<L, R>
  : Op extends "&" | "|" | "#" ? BitOp<L, R>
  : Op extends "<<" | ">>" ? Shift<L>
  : Op extends "overlaps" ? "bool"
  : Op extends "operator" ? "unknown"
  : "unknown";

/** `^`: float8 unless both operands are exact (int/numeric) and one is numeric. `2^3` → float8, `2.0^3` → numeric. */
type Pow<L extends string, R extends string> =
  L extends FloatT ? "float8" : R extends FloatT ? "float8"
  : "numeric" extends L | R ? "numeric"
  : L extends "unknown" ? (R extends "numeric" ? "numeric" : "float8")
  : "float8";

/** `& | #`: integer promotion, bit strings, inet. */
type BitOp<L extends string, R extends string> =
  L extends IntT ? (R extends IntT ? NumPromote<L, R> : R extends "unknown" ? L : "unknown")
  : L extends BitT ? L
  : L extends "inet" | "cidr" ? "inet"
  : L extends "unknown" ? (R extends IntT | BitT ? R : R extends "inet" | "cidr" ? "inet" : "unknown")
  : "unknown";

/** `<< >>`: shifts for integers and bit strings; "strictly left/right of" (bool) for ranges, inet, geometry. */
type Shift<L extends string> = L extends IntT | BitT ? L : "bool";

/**
 * Arithmetic (`+ - * / %`). Table verified against PG 17; rows not listed are errors in
 * Postgres and yield `unknown`. `unknown` operands resolve like an untyped literal: to the
 * only candidate operator for the other side (`ts + '1 day'` → ts) or `unknown` when
 * Postgres itself would report an ambiguity (`date + '1'`).
 */
type Arith<Op extends string, L extends string, R extends string> =
  L extends "unknown" ? (R extends "unknown" ? "unknown" : ArithUnknown<Op, R, "l">)
  : R extends "unknown" ? ArithUnknown<Op, L, "r">
  : L extends NumT
    ? R extends NumT ? NumPromote<L, R>
    : R extends "interval" ? (Op extends "*" ? "interval" : "unknown")
    : R extends "date" ? (Op extends "+" ? (L extends "int2" | "int4" ? "date" : "unknown") : "unknown")
    : R extends "money" ? (Op extends "*" ? "money" : "unknown")
    : "unknown"
  : L extends "date"
    ? R extends "int2" | "int4" ? (Op extends "+" | "-" ? "date" : "unknown")
    : R extends "date" ? (Op extends "-" ? "int4" : "unknown")
    : R extends "interval" ? (Op extends "+" | "-" ? "timestamp" : "unknown")
    : R extends "time" ? (Op extends "+" ? "timestamp" : "unknown")
    : R extends "timetz" ? (Op extends "+" ? "timestamptz" : "unknown")
    : R extends TsT ? (Op extends "-" ? "interval" : "unknown")
    : "unknown"
  : L extends TsT
    ? R extends TsT | "date" ? (Op extends "-" ? "interval" : "unknown")
    : R extends "interval" ? (Op extends "+" | "-" ? L : "unknown")
    : "unknown"
  : L extends "time"
    ? R extends "interval" ? (Op extends "+" | "-" ? "time" : "unknown")
    : R extends "time" ? (Op extends "-" ? "interval" : "unknown")
    : R extends "date" ? (Op extends "+" ? "timestamp" : "unknown")
    : "unknown"
  : L extends "timetz"
    ? R extends "interval" ? (Op extends "+" | "-" ? "timetz" : "unknown")
    : R extends "date" ? (Op extends "+" ? "timestamptz" : "unknown")
    : "unknown"
  : L extends "interval"
    ? R extends "interval" ? (Op extends "+" | "-" ? "interval" : "unknown")
    : R extends NumT ? (Op extends "*" | "/" ? "interval" : "unknown")
    : R extends "date" ? (Op extends "+" ? "timestamp" : "unknown")
    : R extends TsT | TimeT ? (Op extends "+" ? R : "unknown")
    : "unknown"
  : L extends "money"
    ? R extends "money" ? (Op extends "/" ? "float8" : Op extends "+" | "-" ? "money" : "unknown")
    : R extends NumT ? (Op extends "*" | "/" ? "money" : "unknown")
    : "unknown"
  : L extends "inet" | "cidr"
    ? R extends IntT ? (Op extends "+" | "-" ? "inet" : "unknown")
    : R extends "inet" | "cidr" ? (Op extends "-" ? "int8" : "unknown")
    : "unknown"
  : L extends "jsonb" ? (Op extends "-" ? (R extends StrT | IntT | "text[]" ? "jsonb" : "unknown") : "unknown")
  : L extends RangeT ? (R extends RangeT ? (Op extends "+" | "-" | "*" ? L : "unknown") : "unknown")
  : L extends "point" ? (R extends "point" ? "point" : "unknown")
  : "unknown";

/**
 * One side is an untyped literal / param. Postgres first assumes it has the other side's
 * type; if that operator exists it wins (`day - '2020-01-01'` → int4, `at - $1` → interval,
 * and so `at - '1 day'` is a Postgres error), otherwise the unique remaining candidate
 * (`at + '1 day'` → timestamptz) or `unknown` when ambiguous (`day + '1'`).
 */
type ArithUnknown<Op extends string, K extends string, Side extends "l" | "r"> =
  K extends NumT ? K
  : K extends "date" ? (Op extends "-" ? "int4" : "unknown")
  : K extends TsT | "time" ? (Op extends "-" ? "interval" : Op extends "+" ? K : "unknown")
  : K extends "timetz" ? (Side extends "r" ? (Op extends "+" | "-" ? "timetz" : "unknown") : Op extends "+" ? "timetz" : "unknown")
  : K extends "interval" ? "interval"
  : K extends "money" ? "money"
  : K extends "jsonb" ? (Side extends "r" ? (Op extends "-" ? "jsonb" : "unknown") : "unknown")
  : K extends RangeT ? (Op extends "+" | "-" | "*" ? K : "unknown")
  : K extends "point" ? "point"
  : K extends "inet" | "cidr" ? (Op extends "-" ? "int8" : Op extends "+" ? "inet" : "unknown")
  : "unknown";

/**
 * `||`: arrays absorb elements, `jsonb || jsonb` → jsonb, bytea/tsvector/tsquery/bit
 * strings concatenate within their type, everything else (`anynonarray || text`) → text.
 */
type Concat<L extends string, R extends string> =
  IsArr<L> extends true ? (L extends R ? L : StripShape<L>)
  : IsArr<R> extends true ? StripShape<R>
  : L extends "jsonb" ? (R extends "jsonb" | "unknown" ? "jsonb" : "text")
  : R extends "jsonb" ? (L extends "unknown" ? "jsonb" : "text")
  : L extends "bytea" ? (R extends "bytea" | "unknown" ? "bytea" : "text")
  : R extends "bytea" ? (L extends "unknown" ? "bytea" : "text")
  : L extends "tsvector" | "tsquery" ? L
  : R extends "tsvector" | "tsquery" ? R
  : L extends BitT ? (R extends BitT | "unknown" ? "varbit" : "text")
  : R extends BitT ? (L extends "unknown" ? "varbit" : "text")
  : "text";

export type UnOpType<Op extends string, E extends ColInfo> =
  Op extends "not" ? Info<"bool", E["nullable"]>
  : Op extends "-" | "+" ? Info<E["type"] extends NumT | "interval" | "money" | "point" ? E["type"] : E["type"] extends UnknownT ? "unknown" : "unknown", E["nullable"]>
  : Op extends "~" ? Info<E["type"] extends IntT | BitT ? E["type"] : E["type"] extends "inet" | "cidr" ? "inet" : "unknown", E["nullable"]>
  : Op extends "!!" ? Info<E["type"] extends "tsquery" ? "tsquery" : "unknown", E["nullable"]>
  : Op extends "@" ? Info<E["type"] extends NumT ? E["type"] : "unknown", E["nullable"]>
  : Op extends "|/" | "||/" ? Info<"float8", E["nullable"]>
  : Info<"unknown", true>;

/**
 * Common type of two branch types (CASE, COALESCE, GREATEST, ARRAY, ...), following
 * Postgres's UNION/CASE resolution: `unknown`/`null`/`lit` yield to the other side;
 * numerics follow the implicit cast chain (`NumCommon`); date < timestamp < timestamptz;
 * string types keep the first one (`coalesce(vc, label)` → varchar, verified on PG 17);
 * anything else that differs (int4 vs text, json vs jsonb) has no common type → `unknown`.
 * Structured values (shape.ts) of the same base type merge their shapes.
 * The result may be `lit` (all branches string literals): resolve it with `LitToText`.
 */
export type CommonLit<A extends string, B extends string> =
  A extends B ? ([B] extends [A] ? A : ShapedCommon<A, B>)
  : A extends UnknownT ? B
  : B extends UnknownT ? A
  : A extends LitT ? (B extends AnyShaped ? LitCommon<A, B> : B)
  : B extends LitT ? (A extends AnyShaped ? LitCommon<B, A> : A)
  : A extends NumT ? (B extends NumT ? NumCommon<A, B> : "unknown")
  : A extends StrT ? (B extends StrT ? A : "unknown")
  : A extends "timestamptz" ? (B extends TsT | "date" ? "timestamptz" : "unknown")
  : A extends "timestamp" ? (B extends "timestamptz" ? "timestamptz" : B extends "date" ? "timestamp" : "unknown")
  : A extends "date" ? (B extends TsT ? B : "unknown")
  : A extends "time" ? (B extends "timetz" | "interval" ? B : "unknown")
  : A extends "timetz" ? (B extends "time" ? "timetz" : "unknown")
  : A extends "interval" ? (B extends "time" ? "interval" : "unknown")
  : A extends "cidr" ? (B extends "inet" ? "inet" : "unknown")
  : A extends "inet" ? (B extends "cidr" ? "inet" : "unknown")
  : A extends `${infer AE}[]` ? (B extends `${infer BE}[]` ? (CommonLit<AE, BE> extends infer E extends string ? (E extends "unknown" ? "unknown" : `${LitToText<E>}[]`) : never) : "unknown")
  : ShapedCommon<A, B>;

/**
 * `CommonLit` for callers that type string literals as plain `text` (set operations,
 * VALUES, parameter siblings): `text` is treated as a literal and yields to the other side.
 */
export type CommonType<A extends string, B extends string> =
  LitToText<CommonLit<A extends "text" ? LitT : A, B extends "text" ? LitT : B>>;

/**
 * Numeric literal type, as Postgres assigns it: any `.`/exponent → numeric; otherwise the
 * smallest of int4 / int8 / numeric that holds the value (`2147483647` → int4,
 * `2147483648` → int8, `9223372036854775808` → numeric). A leading `-` is accepted so the
 * typer can fold `-2147483648` to int4 like Postgres does.
 */
export type NumLitType<V extends string> =
  V extends `${string}.${string}` | `${string}e${string}` | `${string}E${string}` ? "numeric"
  : V extends `-${infer D}` ? IntLitType<NoUnderscores<D>, "2147483648", "9223372036854775808">
  : IntLitType<NoUnderscores<V>, "2147483647", "9223372036854775807">;
/** `1_000_000` → `1000000` (digit separators do not count). */
type NoUnderscores<V extends string> = V extends `${infer A}_${infer B}` ? NoUnderscores<`${A}${B}`> : V;

type IntLitType<D extends string, Max4 extends string, Max8 extends string> =
  DigitCount<D, []> extends infer N
    ? N extends 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 ? "int4"
    : N extends 10 ? (LeqDigits<D, Max4> extends true ? "int4" : "int8")
    : N extends 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 ? "int8"
    : N extends 19 ? (LeqDigits<D, Max8> extends true ? "int8" : "numeric")
    : "numeric"
    : never;
/** Number of digits, capped at 20 (beyond 19 digits every literal is numeric; literals can be thousands of digits long). */
type DigitCount<V extends string, Acc extends unknown[]> = Acc["length"] extends 20 ? 20 : V extends `${string}${infer R}` ? DigitCount<R, [...Acc, 0]> : Acc["length"];

/** `A <= B` for two digit strings of equal length. */
type LeqDigits<A extends string, B extends string> =
  A extends `${infer AC}${infer AR}`
    ? B extends `${infer BC}${infer BR}` ? (AC extends BC ? LeqDigits<AR, BR> : DigitLt<AC, BC>) : true
    : true;
type DigitRank = { "0": []; "1": [0]; "2": [0, 0]; "3": [0, 0, 0]; "4": [0, 0, 0, 0]; "5": [0, 0, 0, 0, 0]; "6": [0, 0, 0, 0, 0, 0]; "7": [0, 0, 0, 0, 0, 0, 0]; "8": [0, 0, 0, 0, 0, 0, 0, 0]; "9": [0, 0, 0, 0, 0, 0, 0, 0, 0] };
type DigitLt<A extends string, B extends string> =
  A extends keyof DigitRank ? B extends keyof DigitRank ? (DigitRank[B] extends [...DigitRank[A], unknown, ...unknown[]] ? true : false) : false : false;
