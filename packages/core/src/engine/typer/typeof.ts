import type { Call, CaseWhen, Expr, SelectStmt } from "../ast.js";
import type { ResolveColumn, WholeRow } from "../binder/resolve.js";
import type { SqlError } from "../errors.js";
import type { ProjectSelect } from "../project/select.js";
import type { ColInfo, Cols, Ctx, Info, ColMap } from "../types.js";
import type { BaseOf, ObjShape, Shaped } from "../shape.js";
import type { BuildObject, JsonArrow, JsonLitCast, LitType } from "../json.js";
import type { CallType } from "./catalog.js";
import type { BinOpType, CommonLit, LitToText, NumLitType, UnOpType } from "./operators.js";
import type { TypeXml } from "./xml.js";

/**
 * `TypeOf<E, Ctx>` → `{ type, nullable }` or `SqlError`.
 * Every rule evaluates its operands first and propagates the first error.
 *
 * Nullability rules (verified against PostgreSQL 17):
 *   IS [NOT] NULL/TRUE/FALSE/DISTINCT FROM, EXISTS, ARRAY[...], ROW(...) → never null
 *   scalar subquery, array subscript, NULLIF, JSON extraction → always nullable
 *   AND/OR/NOT, comparisons, LIKE, BETWEEN, IN, = ANY → nullable if any operand is
 *   CASE → nullable if any branch is or there is no ELSE
 *   COALESCE/GREATEST/LEAST → nullable only if all arguments are
 *   aggregates → see catalog.ts (`CallNullable`)
 *   `$n::T` → never null (the parameter itself is typed non-null `T`)
 *
 * String literals are `text` here, but in operand positions (operators, CASE branches,
 * ARRAY items, function arguments) they are typed `lit` (`TypeOperand`), Postgres's
 * untyped literal that takes the other side's type (`id + '1'` → int4, `data || '{}'` →
 * jsonb) while a real `text` value does not (`data || label` → text).
 */
export type TypeOf<E extends Expr, C extends Ctx> =
  E extends { readonly t: "col" } ? ResolveColumn<C["scope"], E["tbl"], E["name"]>
  : E extends { readonly t: "num" } ? Info<NumLitType<E["v"]>>
  : E extends { readonly t: "str" } ? Info<"text">
  : E extends { readonly t: "bool" } ? Info<"bool">
  : E extends { readonly t: "null" } ? Info<"null", true>
  : E extends { readonly t: "param" } ? Info<"unknown", true>
  : E extends { readonly t: "default" } ? SqlError<"DEFAULT is not allowed in this context", null>
  : E extends { readonly t: "typed" } ? Info<LitCast<E["type"], E["v"]>>
  : E extends { readonly t: "bin" } ? TypeBin<E["op"], E["l"], E["r"], C>
  : E extends { readonly t: "un" } ? TypeUn<E["op"], E["e"], C>
  : E extends { readonly t: "cast" }
    ? E["e"] extends { readonly t: "param" } ? Info<E["to"]>
    : E["e"] extends { readonly t: "str"; readonly v: infer V extends string } ? Info<LitCast<E["to"], V>>
    : TypeCast<E["to"], E["e"], C>
  : E extends { readonly t: "call" } ? TypeCall<Extract<E, Call>, C>
  : E extends { readonly t: "case" } ? TypeCase<E["operand"], E["whens"], E["else"], C>
  : E extends { readonly t: "is" } ? Check<TypeOf<E["e"], C>, Info<"bool">>
  : E extends { readonly t: "isdistinct" } ? Check2<TypeOf<E["l"], C>, TypeOf<E["r"], C>, Info<"bool">>
  : E extends { readonly t: "between" } ? TypeBetween<E["e"], E["lo"], E["hi"], C>
  : E extends { readonly t: "in" } ? TypeIn<E["e"], E["list"], C>
  : E extends { readonly t: "insub" } ? StrictBool<TypeOf<E["e"], C>, SubqueryOperand<E["e"], E["q"], C>>
  : E extends { readonly t: "like" } ? StrictBool<TypeOf<E["e"], C>, TypeOf<E["pat"], C>>
  : E extends { readonly t: "quant" } ? StrictBool<TypeOf<E["l"], C>, E["r"] extends { readonly t: "select" } ? SubqueryOperand<E["l"], E["r"], C> : E["r"] extends Expr ? TypeOf<E["r"], C> : never>
  : E extends { readonly t: "sub" } ? MakeNullable<FirstColOf<E["q"], C>>
  : E extends { readonly t: "exists" } ? (ProjectSelect<E["q"], C["db"], C["scope"], C["ctes"]> extends infer R ? (R extends Cols ? Info<"bool"> : R) : never)
  : E extends { readonly t: "array" } ? TypeArrayCtor<E["items"], C>
  : E extends { readonly t: "arraysub" } ? ArrayOf<FirstColOf<E["q"], C>>
  : E extends { readonly t: "row" } ? (TypeList<E["items"], C, []> extends infer Ls ? (Ls extends readonly ColInfo[] ? Info<"record"> : Ls) : never)
  : E extends { readonly t: "idx" } ? TypeIdx<E["e"], E["i"], C>
  : E extends { readonly t: "slice" } ? TypeSlice<E["e"], E["lo"], E["hi"], C>
  : E extends { readonly t: "extract" } ? WithType<TypeOf<E["e"], C>, "numeric">
  : E extends { readonly t: "position" } ? StrictOf<TypeOf<E["sub"], C>, TypeOf<E["in"], C>, "int4">
  : E extends { readonly t: "substring" } ? StringResult<TypeOf<E["e"], C>, TypeOpt<E["from"], C>, TypeOpt<E["for"], C>>
  : E extends { readonly t: "trim" } ? StringResult<TypeOf<E["e"], C>, TypeOpt<E["chars"], C>, null>
  : E extends { readonly t: "overlay" } ? StringResult<TypeOf<E["e"], C>, null, null>
  : E extends { readonly t: "attz" } ? TypeAtTz<TypeOf<E["e"], C>, TypeOf<E["zone"], C>>
  : E extends { readonly t: "collate" } ? TypeOf<E["e"], C>
  : E extends { readonly t: "field" } ? TypeField<TypeOf<E["e"], C>, E["name"]>
  : E extends { readonly t: "star" } ? (E["tbl"] extends string ? WholeRow<C["scope"], E["tbl"], `missing FROM-clause entry for table "${E["tbl"]}"`> : SqlError<"* is only allowed in a target list or count(*)", null>)
  : E extends { readonly t: "xml" } ? TypeXml<E, C>
  : SqlError<"unsupported expression", null>;

// ─── helpers ───

export type Or<A extends boolean, B extends boolean> = A extends true ? true : B extends true ? true : false;
export type AnyNullable<As extends readonly ColInfo[]> =
  As extends readonly [infer A extends ColInfo, ...infer R extends readonly ColInfo[]] ? (A["nullable"] extends true ? true : AnyNullable<R>) : false;
/** Literal-aware common type of a list (may be `lit`; see `CommonLit`). */
export type CommonOf<As extends readonly ColInfo[], Acc extends string> =
  As extends readonly [infer A extends ColInfo, ...infer R extends readonly ColInfo[]] ? CommonOf<R, CommonLit<Acc, A["type"]>> : Acc;

/** If `A` is a valid info, result is `R`; else propagate `A`. */
type Check<A, R> = A extends ColInfo ? R : A;
type Check2<A, B, R> = A extends ColInfo ? (B extends ColInfo ? R : B) : A;
type StrictBool<A, B> = A extends ColInfo ? (B extends ColInfo ? Info<"bool", Or<A["nullable"], B["nullable"]>> : B) : A;
type StrictOf<A, B, T extends string> = A extends ColInfo ? (B extends ColInfo ? Info<T, Or<A["nullable"], B["nullable"]>> : B) : A;
type WithType<A, T extends string> = A extends ColInfo ? Info<T, A["nullable"]> : A;
type MakeNullable<A> = A extends ColInfo ? Info<A["type"], true> : A;
type ArrayOf<A> = A extends ColInfo ? Info<A["type"] extends `${string}[]` ? A["type"] : `${A["type"]}[]`> : A;
/**
 * `(e).f`: a column of a whole-row value (nullable when the row or the column is); `unknown`
 * for other composite values. `(e).*` expands only in a target list.
 */
type TypeField<A, N extends string> =
  A extends ColInfo
    ? N extends "*" ? SqlError<"(e).* is only supported in a target list", null>
    : A["type"] extends Shaped<"record", ObjShape<infer M extends ColMap>>
      ? N extends keyof M ? Info<M[N]["type"], Or<A["nullable"], M[N]["nullable"]>> : SqlError<`column "${N}" not found in data type record`, null>
      : Info<"unknown", true>
    : A;
/** Type an optional sub-expression: info, null when absent, or an error. */
type TypeOpt<E extends Expr | null, C extends Ctx> = E extends Expr ? TypeOf<E, C> : null;
type NullableOpt<X> = X extends ColInfo ? X["nullable"] : false;

/** SUBSTRING / TRIM / OVERLAY: text, or bytea / bit for those inputs; strict over all operands. */
type StringResult<A, B, D> =
  A extends ColInfo
    ? B extends ColInfo | null
      ? D extends ColInfo | null
        ? Info<A["type"] extends "bytea" | "bit" | "varbit" ? A["type"] : "text", Or<A["nullable"], Or<NullableOpt<B>, NullableOpt<D>>>>
        : D
      : B
    : A;

type TypeBin<Op extends string, L extends Expr, R extends Expr, C extends Ctx> =
  TypeOperand<L, C> extends infer LT
    ? LT extends ColInfo
      ? TypeOperand<R, C> extends infer RT
        ? RT extends ColInfo ? (Op extends "->" | "#>" ? (JsonArrow<Op, LT, R, RT> extends infer J extends ColInfo ? J : BinOpType<Op, LT, RT>) : BinOpType<Op, LT, RT>) : RT
        : never
      : LT
    : never;
/** Unary; `-<numeric literal>` is folded like Postgres does (`-2147483648` is int4). */
type TypeUn<Op extends string, E extends Expr, C extends Ctx> =
  Op extends "-" | "+"
    ? E extends { readonly t: "num"; readonly v: infer V extends string } ? Info<NumLitType<Op extends "-" ? `-${V}` : V>>
    : TypeOf<E, C> extends infer T ? (T extends ColInfo ? UnOpType<Op, T> : T) : never
  : TypeOf<E, C> extends infer T ? (T extends ColInfo ? UnOpType<Op, T> : T) : never;
/** A cast between json and jsonb keeps the value's shape. */
type TypeCast<To extends string, E extends Expr, C extends Ctx> =
  TypeOf<E, C> extends infer T
    ? T extends ColInfo
      ? Info<To extends "json" | "jsonb" ? (T["type"] extends Shaped<"json" | "jsonb", infer S> ? Shaped<To, S> : To) : To, T["nullable"]>
      : T
    : never;
/** `'…'::T` / `T '…'`: a simple JSON literal cast to json(b) keeps its value (json.ts). */
type LitCast<To extends string, V extends string> = To extends "json" | "jsonb" ? (JsonLitCast<To, V> extends infer J extends string ? J : To) : To;
type TypeBetween<E extends Expr, Lo extends Expr, Hi extends Expr, C extends Ctx> =
  TypeOf<E, C> extends infer A
    ? A extends ColInfo
      ? TypeOf<Lo, C> extends infer B
        ? B extends ColInfo
          ? TypeOf<Hi, C> extends infer D ? (D extends ColInfo ? Info<"bool", Or<A["nullable"], Or<B["nullable"], D["nullable"]>>> : D) : never
          : B
        : never
      : A
    : never;
type TypeIn<E extends Expr, List extends readonly Expr[], C extends Ctx> =
  TypeOf<E, C> extends infer A
    ? A extends ColInfo ? (TypeList<List, C, []> extends infer Ls ? (Ls extends readonly ColInfo[] ? Info<"bool", Or<A["nullable"], AnyNullable<Ls>>> : Ls) : never) : A
    : never;
/** `ARRAY[...]`: array of the common element type (`ARRAY[1, 2.5]` → numeric[]; nested arrays stay one level). */
type TypeArrayCtor<Items extends readonly Expr[], C extends Ctx> =
  OperandList<Items, C, []> extends infer Ls
    ? Ls extends readonly ColInfo[] ? Info<ArrayTypeOf<LitToText<CommonOf<Ls, "unknown">>>> : Ls
    : never;
type ArrayTypeOf<T extends string> = T extends `${string}[]` ? T : T extends "unknown" | "null" ? "text[]" : `${T}[]`;
/** `e[i]`: element (or json for json subscripting), always nullable (out of range → NULL). */
type TypeIdx<E extends Expr, I extends Expr, C extends Ctx> =
  TypeOf<E, C> extends infer A
    ? A extends ColInfo
      ? TypeOf<I, C> extends infer B
        ? B extends ColInfo
          ? JsonArrow<"->", A, I, B> extends infer J extends ColInfo ? J
          : Info<A["type"] extends `${infer El}[]` ? El : A["type"] extends "json" | "jsonb" ? BaseOf<A["type"]> : "unknown", true>
          : B
        : never
      : A
    : never;
/** `e[lo:hi]`: same array type, nullable if the array is. */
type TypeSlice<E extends Expr, Lo extends Expr | null, Hi extends Expr | null, C extends Ctx> =
  TypeOf<E, C> extends infer A
    ? A extends ColInfo
      ? TypeOpt<Lo, C> extends infer B
        ? B extends ColInfo | null
          ? TypeOpt<Hi, C> extends infer D ? (D extends ColInfo | null ? Info<A["type"], A["nullable"]> : D) : never
          : B
        : never
      : A
    : never;
/** AT TIME ZONE flips timestamp ↔ timestamptz; time → timetz; timetz stays; date (→ timestamptz) → timestamp. */
type TypeAtTz<A, B> =
  A extends ColInfo
    ? B extends ColInfo
      ? Info<A["type"] extends "timestamptz" ? "timestamp" : A["type"] extends "timestamp" ? "timestamptz" : A["type"] extends "time" | "timetz" ? "timetz" : "timestamp", Or<A["nullable"], B["nullable"]>>
      : B
    : A;

/** Type a list of expressions: `readonly ColInfo[]` or the first error. */
export type TypeList<Es extends readonly Expr[], C extends Ctx, Acc extends readonly ColInfo[]> =
  Es extends readonly [infer E extends Expr, ...infer R extends readonly Expr[]]
    ? TypeOf<E, C> extends infer T ? (T extends ColInfo ? TypeList<R, C, [...Acc, T]> : T) : never
    : Acc;

/** An expression in operand position: a string literal is the untyped `lit` (see `CommonLit`). */
type TypeOperand<E extends Expr, C extends Ctx> = E extends { readonly t: "str" } ? Info<LitType<E["v"]>> : TypeOf<E, C>;
/** `TypeList` with operand typing (internal: the result may contain `lit`). */
type OperandList<Es extends readonly Expr[], C extends Ctx, Acc extends readonly ColInfo[]> =
  Es extends readonly [infer E extends Expr, ...infer R extends readonly Expr[]]
    ? TypeOperand<E, C> extends infer T ? (T extends ColInfo ? OperandList<R, C, [...Acc, T]> : T) : never
    : Acc;

/** First projected column of a subquery (scalar subqueries, `IN (SELECT ...)`, `ARRAY(SELECT ...)`). */
export type FirstColOf<Q extends SelectStmt, C extends Ctx, TooMany extends string = "subquery must return only one column"> =
  ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
    ? R extends Cols ? OnlyCol<R, TooMany> : R
    : never;

/**
 * Right side of `x IN (SELECT …)` / `x op ANY|ALL (SELECT …)`. A row constructor on the left
 * (`(a, b) IN (SELECT x, y …)`) needs a subquery of the same width; otherwise one column.
 */
type SubqueryOperand<L extends Expr, Q extends SelectStmt, C extends Ctx> =
  L extends { readonly t: "row"; readonly items: infer Items extends readonly unknown[] }
    ? ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
      ? R extends Cols
        ? HasStarEntry<R> extends true ? Info<"record">
        : R["length"] extends Items["length"] ? Info<"record">
        : IsLonger<R, Items> extends true ? SqlError<"subquery has too many columns", null> : SqlError<"subquery has too few columns", null>
        : R
      : never
    : FirstColOf<Q, C, "subquery has too many columns">;
type HasStarEntry<R extends Cols> = R extends readonly [infer H, ...infer Rest extends Cols] ? (H extends { readonly star: unknown } ? true : HasStarEntry<Rest>) : false;
type IsLonger<A extends readonly unknown[], B extends readonly unknown[]> = A extends readonly [unknown, ...infer AR] ? (B extends readonly [unknown, ...infer BR] ? IsLonger<AR, BR> : true) : false;

/**
 * The single column of a subquery. Postgres: scalar and ARRAY subqueries with ≠ 1 column fail
 * with "subquery must return only one column"; IN / ANY / ALL with "subquery has too many columns".
 */
type OnlyCol<R extends Cols, TooMany extends string> =
  R extends readonly [infer H]
    ? H extends { readonly t: infer T extends ColInfo } ? T
    : H extends { readonly star: infer M extends ColMap } ? StarCol<M, TooMany>
    : Info<"unknown", true>
  : R extends readonly [] ? SqlError<"subquery must return only one column", null>
  : SqlError<TooMany, null>;
type StarCol<M extends ColMap, TooMany extends string> =
  [keyof M] extends [never] ? SqlError<"subquery must return only one column", null>
  : IsUnion<keyof M> extends true ? SqlError<TooMany, null>
  : M[keyof M];
type IsUnion<U> = [U] extends [UnionToIntersection<U>] ? false : true;
type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (u: infer I) => void ? I : never;

// ─── CASE ───

/**
 * Common type of the branches (Postgres considers ELSE first, which matters for string
 * types: `CASE WHEN x THEN vc ELSE label END` → text); nullable if a branch is or there is
 * no ELSE.
 */
type TypeCase<Operand extends Expr | null, Whens extends readonly CaseWhen[], Else extends Expr | null, C extends Ctx> =
  (Operand extends Expr ? TypeOf<Operand, C> : Info<"bool">) extends infer OT
    ? OT extends ColInfo
      ? (Else extends Expr ? TypeOperand<Else, C> : Info<"null", true>) extends infer ET
        ? ET extends ColInfo
          ? TypeWhens<Whens, C, ET["type"], ET["nullable"]> extends infer W
            ? W extends readonly [infer T extends string, infer N extends boolean] ? Info<LitToText<T>, N> : W
            : never
          : ET
        : never
      : OT
    : never;
type TypeWhens<Whens extends readonly CaseWhen[], C extends Ctx, T extends string, N extends boolean> =
  Whens extends readonly [infer W extends CaseWhen, ...infer R extends readonly CaseWhen[]]
    ? TypeOf<W["when"], C> extends infer WT
      ? WT extends ColInfo
        ? TypeOperand<W["then"], C> extends infer TT ? (TT extends ColInfo ? TypeWhens<R, C, CommonLit<T, TT["type"]>, Or<N, TT["nullable"]>> : TT) : never
        : WT
      : never
    : readonly [T, N];

// ─── calls ───

type NonStarArgs<Args extends readonly Expr[]> = Args extends readonly [{ readonly t: "star"; readonly tbl: null }] ? [] : Args;

/** Type the arguments, then FILTER and WITHIN GROUP expressions (for errors and the ordered-set result type), then resolve. */
type TypeCall<E extends Call, C extends Ctx> =
  OperandList<NonStarArgs<E["args"]>, C, []> extends infer As
    ? As extends readonly ColInfo[]
      ? E["name"] extends "json_build_object" | "jsonb_build_object" ? BuildObject<E["name"] extends "jsonb_build_object" ? "jsonb" : "json", E["args"], As>
      : TypeOpt<E["filter"], C> extends infer F
        ? F extends ColInfo | null
          ? TypeOpt<E["withinGroup"], C> extends infer W
            ? W extends ColInfo | null
              ? CallType<E["name"], As, {
                  readonly grouped: C["grouped"];
                  readonly over: E["over"];
                  readonly filter: F extends ColInfo ? true : false;
                  readonly distinct: E["distinct"];
                  readonly hasStar: E["args"] extends readonly [{ readonly t: "star"; readonly tbl: null }] ? true : false;
                  readonly wg: W extends ColInfo ? W["type"] : "unknown";
                }, C["db"]>
              : W
            : never
          : F
        : never
      : As
    : never;
