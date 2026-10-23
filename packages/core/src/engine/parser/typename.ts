import type { IdTok, NumTok, OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { NormalizeTypeName } from "../../schema/normalize.js";
import type { ParseExprList } from "./expr.js";
import type { EatOp, EatWord, EatWords, Expected, Ident, Nx, Nx2, Nx3, Nx4, Nx5, Ok } from "./util.js";

/**
 * Parse a SQL type name: `Ok<canonicalName, next>` or error.
 *
 *   int | integer | bigint | double precision | character varying(255) | numeric(10, 2)
 *   timestamp(3) with time zone | time without time zone | interval day to second
 *   "MyEnum" | myschema.mood | pg_catalog.int4 | text[] | int[][] | int array | int array[3]
 *
 * Type modifiers are skipped. Schema qualification is dropped (`myschema.mood` → `mood`).
 * Array suffixes become `T[]` (multi-dimensional arrays collapse to one level, as Postgres does).
 */
export type ParseTypeName<T extends Toks, I extends number> =
  ParseBaseType<T, I> extends infer R
    ? R extends Ok<infer Base extends string, infer J extends number>
      ? ParseArraySuffix<T, SkipModifier<T, J>, NormalizeTypeName<Base>>
      : R
    : never;

type ParseBaseType<T extends Toks, I extends number> =
  T[I] extends IdTok<infer V> ? QualifiedTail<T, V, Nx<I>>
  : T[I] extends WordTok<infer W>
    ? W extends "double" ? (EatWord<T, Nx<I>, "precision"> extends never ? Expected<"PRECISION", T, Nx<I>> : Ok<"float8", EatWord<T, Nx<I>, "precision">>)
    : W extends "national" ? (EatWord<T, Nx<I>, "character" | "char"> extends never ? Expected<"CHARACTER", T, Nx<I>> : ParseBaseType<T, Nx<I>>)
    : W extends "character" | "char" | "nchar" ? (EatWord<T, Nx<I>, "varying"> extends never ? Ok<"bpchar", Nx<I>> : Ok<"varchar", EatWord<T, Nx<I>, "varying">>)
    : W extends "bit" ? (EatWord<T, Nx<I>, "varying"> extends never ? Ok<"bit", Nx<I>> : Ok<"varbit", EatWord<T, Nx<I>, "varying">>)
    : W extends "timestamp" ? WithTz<T, SkipModifier<T, Nx<I>>, "timestamp", "timestamptz">
    : W extends "time" ? WithTz<T, SkipModifier<T, Nx<I>>, "time", "timetz">
    : W extends "interval" ? Ok<"interval", SkipIntervalFields<T, Nx<I>>>
    : W extends "float" ? FloatPrecision<T, Nx<I>>
    : W extends "setof" ? ParseBaseType<T, Nx<I>>
    : W extends ReservedTypeWord ? Expected<"type name", T, I>
    : QualifiedTail<T, W, Nx<I>>
  : Expected<"type name", T, I>;

/** `float` is float8; `float(p)` is float4 for p ≤ 24 and float8 for 25 ≤ p ≤ 53 (Postgres). The modifier is consumed here. */
type FloatPrecision<T extends Toks, I extends number> =
  T[I] extends OpTok<"(">
    ? T[Nx<I>] extends NumTok<infer P extends string>
      ? T[Nx2<I>] extends OpTok<")"> ? Ok<SmallFloat<P> extends true ? "float4" : "float8", Nx3<I>> : Expected<'")"', T, Nx2<I>>
      : Expected<"precision", T, Nx<I>>
    : Ok<"float8", I>;
type SmallFloat<P extends string> =
  P extends "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23" | "24" ? true : false;

type ReservedTypeWord = "select" | "from" | "where" | "and" | "or" | "not" | "as" | "null" | "true" | "false" | "case" | "when" | "then" | "else" | "end";

/** `schema.name` → name (drops the qualifier). */
type QualifiedTail<T extends Toks, First extends string, I extends number> =
  EatOp<T, I, "."> extends never ? Ok<First, I>
  : Ident<T, EatOp<T, I, ".">> extends [infer N extends string, infer J extends number] ? Ok<N, J> : Expected<"type name", T, EatOp<T, I, ".">>;

type WithTz<T extends Toks, I extends number, Plain extends string, Tz extends string> =
  EatWords<T, I, ["with", "time", "zone"]> extends never
    ? EatWords<T, I, ["without", "time", "zone"]> extends never ? Ok<Plain, I> : Ok<Plain, EatWords<T, I, ["without", "time", "zone"]>>
    : Ok<Tz, EatWords<T, I, ["with", "time", "zone"]>>;

type IntervalField = "year" | "month" | "day" | "hour" | "minute" | "second";
type SkipIntervalFields<T extends Toks, I extends number> =
  T[I] extends WordTok<IntervalField>
    ? EatWord<T, Nx<I>, "to"> extends never ? SkipModifier<T, Nx<I>>
    : T[EatWord<T, Nx<I>, "to">] extends WordTok<IntervalField> ? SkipModifier<T, Nx<EatWord<T, Nx<I>, "to">>> : SkipModifier<T, Nx<I>>
    : SkipModifier<T, I>;

/**
 * Skip `( n [, n] )` modifiers; other modifier lists (`numeric(3, -6)`, `widget(42, 13, 7)`) are
 * expression lists in Postgres's grammar (it checks their values later).
 */
type SkipModifier<T extends Toks, I extends number> =
  T[I] extends OpTok<"(">
    ? T[Nx<I>] extends NumTok
      ? T[Nx2<I>] extends OpTok<")"> ? Nx3<I>
      : T[Nx2<I>] extends OpTok<","> ? (T[Nx3<I>] extends NumTok ? (T[Nx4<I>] extends OpTok<")"> ? Nx5<I> : SkipModifierList<T, I>) : SkipModifierList<T, I>)
      : SkipModifierList<T, I>
      : SkipModifierList<T, I>
    : I;
type SkipModifierList<T extends Toks, I extends number> =
  ParseExprList<T, Nx<I>, []> extends Ok<unknown, infer J extends number> ? (T[J] extends OpTok<")"> ? Nx<J> : I) : I;

type ParseArraySuffix<T extends Toks, I extends number, Base extends string> =
  T[I] extends OpTok<"[">
    ? T[Nx<I>] extends OpTok<"]"> ? ParseArraySuffix<T, Nx2<I>, Arr<Base>>
    : T[Nx<I>] extends NumTok ? (T[Nx2<I>] extends OpTok<"]"> ? ParseArraySuffix<T, Nx3<I>, Arr<Base>> : Ok<Base, I>)
    : Ok<Base, I>
  : T[I] extends WordTok<"array">
    ? T[Nx<I>] extends OpTok<"["> ? (T[Nx2<I>] extends NumTok ? (T[Nx3<I>] extends OpTok<"]"> ? Ok<Arr<Base>, Nx4<I>> : Ok<Arr<Base>, Nx<I>>) : Ok<Arr<Base>, Nx<I>>)
    : Ok<Arr<Base>, Nx<I>>
  : Ok<Base, I>;
type Arr<Base extends string> = Base extends `${string}[]` ? Base : `${Base}[]`;
