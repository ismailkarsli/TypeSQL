import type { IsTest } from "../ast.js";
import type { IdTok, NumTok, OpTok, ParamTok, StrTok, Toks, WordTok } from "../lexer/tokens.js";
import type { NormalizeTypeName } from "../../schema/normalize.js";
import type { ReservedKeyword } from "./keywords.js";
import type { JsonFuncWord, ParseJsonFunc, SkipUniqueKeys } from "./json.js";
import type { IsSelectStart, ParseSelectStmt } from "./select.js";
import type { ParseTypeName } from "./typename.js";
import type { EatOp, EatWord, EatWords, Expected, Fail, Ident, Nx, Ok, QualName, SkipToCloseParen, SkipWord, SyntaxError } from "./util.js";
import type { ParseXmlFunc, XmlFuncKeyword, XmlIsDocument } from "./xml.js";

/**
 * Pratt expression parser with Postgres precedence (index-based token access).
 *
 *   1 OR | 2 AND | 3 NOT (prefix) | 4 IS ISNULL NOTNULL | 5 < > = <= >= <> |
 *   6 BETWEEN IN LIKE ILIKE SIMILAR | 7 other operators | 8 + - | 9 * / % | 10 ^ |
 *   11 unary + -, AT TIME ZONE, COLLATE | 12 :: [ ] .
 *
 * `ParseExpr<T, I, Min>` parses an expression starting at token `I` whose operators all
 * bind at least as tightly as `Min`. Result: `Ok<Expr, next>` or `SqlError`.
 */
export type ParseExpr<T extends Toks, I extends number, Min extends Prec = 0> =
  ParsePrefix<T, I> extends infer R
    ? R extends Ok<infer L, infer J extends number> ? ParseInfix<T, L, J, Min> : R
    : never;

export type Prec = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
/** `Geq[M]` is the set of precedences ≥ M. */
type Geq = {
  0: Prec;
  1: Exclude<Prec, 0>;
  2: Exclude<Prec, 0 | 1>;
  3: Exclude<Prec, 0 | 1 | 2>;
  4: Exclude<Prec, 0 | 1 | 2 | 3>;
  5: Exclude<Prec, 0 | 1 | 2 | 3 | 4>;
  6: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5>;
  7: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5 | 6>;
  8: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>;
  9: Exclude<Prec, 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>;
  10: 10 | 11 | 12 | 13;
  11: 11 | 12 | 13;
  12: 12 | 13;
  13: 13;
};
type Binds<Bp extends Prec, Min extends Prec> = Bp extends Geq[Min] ? true : false;
type NextPrec = { 0: 1; 1: 2; 2: 3; 3: 4; 4: 5; 5: 6; 6: 7; 7: 8; 8: 9; 9: 10; 10: 11; 11: 12; 12: 13; 13: 13 };

type ComparisonOp = "=" | "<" | ">" | "<=" | ">=" | "<>" | "!=";
/**
 * Operators that cannot be prefix operators (Postgres's MathOp tokens, `=>` and punctuation).
 * Any other operator can: `-x`, `+x` bind tightest; `@ x`, `@@ box`, `|/ x`, user-defined
 * `@#@ x` bind looser than the arithmetic operators (`%prec Op`: `@ a + b` is `@ (a + b)`).
 */
type NotPrefixOp = "*" | "/" | "%" | "^" | "<" | ">" | "=" | "<=" | ">=" | "<>" | "!=" | "=>" | ")" | "," | ";" | "]" | "." | ":" | "::" | ":=";
type Terminator = ")" | "," | ";" | "]" | ":";

// ───────────────────────────── infix loop ─────────────────────────────

type ParseInfix<T extends Toks, L, I extends number, Min extends Prec> =
  T[I] extends OpTok<infer O>
    ? O extends Terminator ? Ok<L, I>
    : O extends "::" ? (Binds<12, Min> extends true ? ParseCastSuffix<T, L, Nx<I>, Min> : Ok<L, I>)
    : O extends "[" ? (Binds<12, Min> extends true ? ParseSubscript<T, L, Nx<I>, Min> : Ok<L, I>)
    : O extends "." ? (L extends { readonly t: "row" | "sub" | "field" } ? ParseFieldAccess<T, L, Nx<I>, Min> : Ok<L, I>)
    : O extends ComparisonOp ? (Binds<5, Min> extends true ? ParseComparisonRhs<T, L, O, Nx<I>, Min> : Ok<L, I>)
    : O extends "+" | "-" ? BinRhs<T, L, O, 8, I, Min>
    : O extends "*" | "/" | "%" ? BinRhs<T, L, O, 9, I, Min>
    : O extends "^" ? BinRhs<T, L, O, 10, I, Min>
    : O extends "=>" | ":=" ? Ok<L, I>
    : BinRhs<T, L, O, 7, I, Min>
  : T[I] extends WordTok<infer W>
    ? W extends "and" ? (Binds<2, Min> extends true ? ParseChain<T, "and", 3, [L], Nx<I>, Min> : Ok<L, I>)
    : W extends "or" ? (Binds<1, Min> extends true ? ParseChain<T, "or", 2, [L], Nx<I>, Min> : Ok<L, I>)
    : W extends "is" ? (Binds<4, Min> extends true ? ParseIs<T, L, Nx<I>, Min> : Ok<L, I>)
    : W extends "isnull" ? (Binds<4, Min> extends true ? ParseInfix<T, IsTest_<L, "null", false>, Nx<I>, Min> : Ok<L, I>)
    : W extends "notnull" ? (Binds<4, Min> extends true ? ParseInfix<T, IsTest_<L, "null", true>, Nx<I>, Min> : Ok<L, I>)
    : W extends "not" ? (Binds<6, Min> extends true ? ParseNegated<T, L, Nx<I>, Min, I> : Ok<L, I>)
    : W extends "in" ? (Binds<6, Min> extends true ? ParseIn<T, L, Nx<I>, Min, false> : Ok<L, I>)
    : W extends "like" | "ilike" ? (Binds<6, Min> extends true ? ParseLike<T, L, Nx<I>, Min, W, false> : Ok<L, I>)
    : W extends "similar" ? (Binds<6, Min> extends true ? (EatWord<T, Nx<I>, "to"> extends never ? Expected<"TO", T, Nx<I>> : ParseLike<T, L, EatWord<T, Nx<I>, "to">, Min, "similar", false>) : Ok<L, I>)
    : W extends "between" ? (Binds<6, Min> extends true ? ParseBetween<T, L, Nx<I>, Min, false> : Ok<L, I>)
    : W extends "at" ? (Binds<11, Min> extends true ? ParseAtTimeZone<T, L, Nx<I>, Min> : Ok<L, I>)
    : W extends "collate" ? (Binds<11, Min> extends true ? ParseCollate<T, L, Nx<I>, Min> : Ok<L, I>)
    : W extends "operator" ? ParseOperatorSyntax<T, L, Nx<I>, Min, I>
    : Ok<L, I>
  : Ok<L, I>;

type IsTest_<E, What extends IsTest["what"], Not extends boolean> = { t: "is"; e: E; what: What; not: Not };

/**
 * `a AND b AND c ...` / `a OR b OR c ...`: the operands are collected and folded into a
 * *balanced* tree instead of the usual left-nested one. Both operators are associative
 * (same type and three-valued nullability for any grouping), and a balanced tree keeps
 * the AST depth at log2(n): left-nested chains of ~90 terms exceed TypeScript's
 * instantiation depth whenever the tree is matched or compared (ENGINE.md pitfall 12).
 * `P` is the operand precedence (one above the operator's).
 */
type ParseChain<T extends Toks, Op extends "and" | "or", P extends Prec, Items extends readonly unknown[], I extends number, Min extends Prec> =
  ParseExpr<T, I, P> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? T[J] extends WordTok<Op> ? ParseChain<T, Op, P, [...Items, E], Nx<J>, Min>
      : ParseInfix<T, Balance<[...Items, E], Op>, J, Min>
      : X
    : never;
/** Fold operands pairwise (`[a, b, c, d, e]` → `[ab, cd, e]` → `[abcd, e]` → `abcde`). */
type Balance<Items extends readonly unknown[], Op extends string> =
  Items extends readonly [infer Only] ? Only : Balance<PairUp<Items, Op, 0, []>, Op>;
type PairUp<Items extends readonly unknown[], Op extends string, I extends number, Acc extends readonly unknown[]> =
  Items[I] extends undefined ? Acc
  : Items[Nx<I>] extends undefined ? [...Acc, Items[I]]
  : PairUp<Items, Op, Nx<Nx<I>>, [...Acc, { t: "bin"; op: Op; l: Items[I]; r: Items[Nx<I>] }]>;

/** Generic binary operator at token `I`: parse the right operand at `NextPrec[Bp]` (left-assoc), then continue. */
type BinRhs<T extends Toks, L, O extends string, Bp extends Prec, I extends number, Min extends Prec> =
  Binds<Bp, Min> extends true
    ? ParseExpr<T, Nx<I>, NextPrec[Bp]> extends infer X
      ? X extends Ok<infer Rhs, infer J extends number> ? ParseInfix<T, { t: "bin"; op: O; l: L; r: Rhs }, J, Min> : X
      : never
    : Ok<L, I>;

/** `l <cmp> rhs` where rhs may be `ANY|SOME|ALL (subquery | array)`. `I` is after the operator. */
type ParseComparisonRhs<T extends Toks, L, O extends string, I extends number, Min extends Prec> =
  T[I] extends WordTok<infer Q extends "any" | "some" | "all">
    ? T[Nx<I>] extends OpTok<"("> ? ParseQuantified<T, L, O, Q extends "all" ? "all" : "any", Nx<Nx<I>>, Min> : SyntaxError<T, Nx<I>>
    : ParseExpr<T, I, 6> extends infer X
      ? X extends Ok<infer Rhs, infer J extends number> ? ParseInfix<T, { t: "bin"; op: O; l: L; r: Rhs }, J, Min> : X
      : never;

/** `I` is just inside the paren. */
type ParseQuantified<T extends Toks, L, O extends string, Q extends "any" | "all", I extends number, Min extends Prec> =
  IsSelectStart<T, I> extends true
    ? ParseSelectStmt<T, I> extends infer X
      ? X extends Ok<infer S, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J>
        : ParseInfix<T, { t: "quant"; l: L; op: O; q: Q; r: S }, EatOp<T, J, ")">, Min>
        : X
      : never
    : ParseExpr<T, I, 0> extends infer X
      ? X extends Ok<infer A, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J>
        : ParseInfix<T, { t: "quant"; l: L; op: O; q: Q; r: A }, EatOp<T, J, ")">, Min>
        : X
      : never;

type ParseCastSuffix<T extends Toks, L, I extends number, Min extends Prec> =
  ParseTypeName<T, I> extends infer X
    ? X extends Ok<infer Ty extends string, infer J extends number> ? ParseInfix<T, { t: "cast"; e: L; to: Ty }, J, Min> : X
    : never;

/** After `[`: `e[i]` or `e[lo:hi]`, `e[:hi]`, `e[lo:]`. */
type ParseSubscript<T extends Toks, L, I extends number, Min extends Prec> =
  EatOp<T, I, ":"> extends never
    ? ParseExpr<T, I, 0> extends infer X
      ? X extends Ok<infer Ix, infer J extends number>
        ? EatOp<T, J, "]"> extends never
          ? EatOp<T, J, ":"> extends never ? Expected<'"]"', T, J>
          : ParseSliceHi<T, L, Ix, EatOp<T, J, ":">, Min>
          : ParseInfix<T, { t: "idx"; e: L; i: Ix }, EatOp<T, J, "]">, Min>
        : X
      : never
    : ParseSliceHi<T, L, null, EatOp<T, I, ":">, Min>;
type ParseSliceHi<T extends Toks, L, Lo, I extends number, Min extends Prec> =
  EatOp<T, I, "]"> extends never
    ? ParseExpr<T, I, 0> extends infer X
      ? X extends Ok<infer Hi, infer J extends number>
        ? EatOp<T, J, "]"> extends never ? Expected<'"]"', T, J> : ParseInfix<T, { t: "slice"; e: L; lo: Lo; hi: Hi }, EatOp<T, J, "]">, Min>
        : X
      : never
    : ParseInfix<T, { t: "slice"; e: L; lo: Lo; hi: null }, EatOp<T, I, "]">, Min>;

/** `(e).name` or `(e).*` (name `"*"`). */
type ParseFieldAccess<T extends Toks, L, I extends number, Min extends Prec> =
  T[I] extends OpTok<"*"> ? ParseInfix<T, { t: "field"; e: L; name: "*" }, Nx<I>, Min>
  : Ident<T, I> extends [infer N extends string, infer J extends number] ? ParseInfix<T, { t: "field"; e: L; name: N }, J, Min> : Expected<"field name", T, I>;

/** After `IS`. */
type ParseIs<T extends Toks, L, I extends number, Min extends Prec> =
  EatWord<T, I, "not"> extends never ? ParseIsBody<T, L, I, Min, false> : ParseIsBody<T, L, EatWord<T, I, "not">, Min, true>;
type ParseIsBody<T extends Toks, L, I extends number, Min extends Prec, Not extends boolean> =
  T[I] extends WordTok<infer W>
    ? W extends "null" | "true" | "false" | "unknown" ? ParseInfix<T, IsTest_<L, W, Not>, Nx<I>, Min>
    : W extends "document" ? ParseInfix<T, XmlIsDocument<L, Not>, Nx<I>, Min>
    // `IS [NOT] JSON [VALUE | SCALAR | ARRAY | OBJECT] [WITH | WITHOUT UNIQUE [KEYS]]` (parser/json.ts)
    : W extends "json" ? ParseInfix<T, { t: "isjson"; e: L; not: Not }, SkipUniqueKeys<T, SkipWord<T, Nx<I>, "value" | "scalar" | "array" | "object">>, Min>
    : W extends "distinct"
      ? EatWord<T, Nx<I>, "from"> extends never ? Expected<"FROM", T, Nx<I>>
      : ParseExpr<T, EatWord<T, Nx<I>, "from">, 5> extends infer X
        ? X extends Ok<infer Rhs, infer J extends number> ? ParseInfix<T, { t: "isdistinct"; l: L; r: Rhs; not: Not }, J, Min> : X
        : never
    : Expected<"NULL, TRUE, FALSE, UNKNOWN or DISTINCT FROM", T, I>
    : Expected<"NULL, TRUE, FALSE, UNKNOWN or DISTINCT FROM", T, I>;

/** After `NOT` in infix position: `NOT IN`, `NOT LIKE`, `NOT ILIKE`, `NOT SIMILAR TO`, `NOT BETWEEN`. `I0` is the index of NOT. */
type ParseNegated<T extends Toks, L, I extends number, Min extends Prec, I0 extends number> =
  T[I] extends WordTok<infer W>
    ? W extends "in" ? ParseIn<T, L, Nx<I>, Min, true>
    : W extends "like" | "ilike" ? ParseLike<T, L, Nx<I>, Min, W, true>
    : W extends "similar" ? (EatWord<T, Nx<I>, "to"> extends never ? Expected<"TO", T, Nx<I>> : ParseLike<T, L, EatWord<T, Nx<I>, "to">, Min, "similar", true>)
    : W extends "between" ? ParseBetween<T, L, Nx<I>, Min, true>
    : Ok<L, I0>
    : Ok<L, I0>;

/** After `IN`: `(subquery)` or `(list)`. */
type ParseIn<T extends Toks, L, I extends number, Min extends Prec, Not extends boolean> =
  EatOp<T, I, "("> extends never ? Expected<'"("', T, I>
  : IsSelectStart<T, EatOp<T, I, "(">> extends true
    ? ParseSelectStmt<T, EatOp<T, I, "(">> extends infer X
      ? X extends Ok<infer S, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : ParseInfix<T, { t: "insub"; e: L; q: S; not: Not }, EatOp<T, J, ")">, Min>
        : X
      : never
    : ParseExprList<T, EatOp<T, I, "(">, []> extends infer X
      ? X extends Ok<infer List, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : ParseInfix<T, { t: "in"; e: L; list: List; not: Not }, EatOp<T, J, ")">, Min>
        : X
      : never;

type ParseLike<T extends Toks, L, I extends number, Min extends Prec, Kind extends "like" | "ilike" | "similar", Not extends boolean> =
  ParseExpr<T, I, 7> extends infer X
    ? X extends Ok<infer Pat, infer J extends number>
      ? EatWord<T, J, "escape"> extends never
        ? ParseInfix<T, { t: "like"; e: L; pat: Pat; kind: Kind; not: Not }, J, Min>
        : ParseExpr<T, EatWord<T, J, "escape">, 7> extends infer Y
          ? Y extends Ok<unknown, infer J2 extends number> ? ParseInfix<T, { t: "like"; e: L; pat: Pat; kind: Kind; not: Not }, J2, Min> : Y
          : never
      : X
    : never;

type ParseBetween<T extends Toks, L, I extends number, Min extends Prec, Not extends boolean> =
  ParseExpr<T, SkipWord<T, I, "symmetric" | "asymmetric">, 7> extends infer X
    ? X extends Ok<infer Lo, infer J extends number>
      ? EatWord<T, J, "and"> extends never ? Expected<"AND", T, J>
      : ParseExpr<T, EatWord<T, J, "and">, 7> extends infer Y
        ? Y extends Ok<infer Hi, infer J2 extends number> ? ParseInfix<T, { t: "between"; e: L; lo: Lo; hi: Hi; not: Not }, J2, Min> : Y
        : never
      : X
    : never;

type ParseAtTimeZone<T extends Toks, L, I extends number, Min extends Prec> =
  EatWords<T, I, ["time", "zone"]> extends never ? Expected<"TIME ZONE", T, I>
  : ParseExpr<T, EatWords<T, I, ["time", "zone"]>, 11> extends infer X
    ? X extends Ok<infer Z, infer J extends number> ? ParseInfix<T, { t: "attz"; e: L; zone: Z }, J, Min> : X
    : never;

type ParseCollate<T extends Toks, L, I extends number, Min extends Prec> =
  QualName<T, I> extends [infer Parts extends readonly string[], infer J extends number]
    ? ParseInfix<T, { t: "collate"; e: L; collation: LastOf<Parts> }, J, Min>
    : Expected<"collation name", T, I>;

/** `OPERATOR(schema.op)` — treated as a generic operator at precedence 7. */
type ParseOperatorSyntax<T extends Toks, L, I extends number, Min extends Prec, I0 extends number> =
  T[I] extends OpTok<"("> ? BinRhsAt<T, L, "operator", 7, SkipToCloseParen<T, Nx<I>>, Min, I0> : Ok<L, I0>;
/** Like BinRhs but the right operand starts at `I` (already past the operator). */
type BinRhsAt<T extends Toks, L, O extends string, Bp extends Prec, I extends number, Min extends Prec, I0 extends number> =
  Binds<Bp, Min> extends true
    ? ParseExpr<T, I, NextPrec[Bp]> extends infer X
      ? X extends Ok<infer Rhs, infer J extends number> ? ParseInfix<T, { t: "bin"; op: O; l: L; r: Rhs }, J, Min> : X
      : never
    : Ok<L, I0>;

// ───────────────────────────── prefix ─────────────────────────────

type ParsePrefix<T extends Toks, I extends number> =
  T[I] extends NumTok<infer V> ? Ok<{ t: "num"; v: V }, Nx<I>>
  : T[I] extends StrTok<infer V> ? Ok<{ t: "str"; v: V }, Nx<I>>
  : T[I] extends ParamTok<infer N> ? Ok<{ t: "param"; n: N }, Nx<I>>
  : T[I] extends OpTok<infer O>
    ? O extends "(" ? ParseParen<T, Nx<I>>
    : O extends "-" | "+" ? ParseUnary<T, O, Nx<I>>
    : O extends "*" ? Ok<{ t: "star"; tbl: null }, Nx<I>>
    : O extends "[" ? ParseArrayLiteral<T, Nx<I>>
    : O extends NotPrefixOp ? SyntaxError<T, I>
    : ParseUnary<T, O, Nx<I>>
  : T[I] extends IdTok ? ParseNameExpr<T, I>
  : T[I] extends WordTok<infer W>
    ? W extends "null" ? Ok<{ t: "null" }, Nx<I>>
    : W extends "true" ? Ok<{ t: "bool"; v: true }, Nx<I>>
    : W extends "false" ? Ok<{ t: "bool"; v: false }, Nx<I>>
    : W extends "default" ? Ok<{ t: "default" }, Nx<I>>
    : W extends "not" ? ParseUnary<T, "not", Nx<I>>
    : W extends "case" ? ParseCase<T, Nx<I>>
    : W extends "cast" ? ParseCast<T, Nx<I>>
    : W extends "exists" ? ParseExists<T, Nx<I>>
    : W extends "array" ? ParseArray<T, Nx<I>>
    : W extends "row" ? (EatOp<T, Nx<I>, "("> extends never ? ParseNameExpr<T, I> : ParseRow<T, EatOp<T, Nx<I>, "(">>)
    : W extends "extract" ? (EatOp<T, Nx<I>, "("> extends never ? ParseNameExpr<T, I> : ParseExtract<T, EatOp<T, Nx<I>, "(">>)
    : W extends "position" ? (EatOp<T, Nx<I>, "("> extends never ? ParseNameExpr<T, I> : ParsePosition<T, EatOp<T, Nx<I>, "(">>)
    : W extends "substring" ? (EatOp<T, Nx<I>, "("> extends never ? ParseNameExpr<T, I> : ParseSubstring<T, EatOp<T, Nx<I>, "(">>)
    : W extends "trim" ? (EatOp<T, Nx<I>, "("> extends never ? ParseNameExpr<T, I> : ParseTrim<T, EatOp<T, Nx<I>, "(">>)
    : W extends "overlay" ? (EatOp<T, Nx<I>, "("> extends never ? ParseNameExpr<T, I> : ParseOverlay<T, EatOp<T, Nx<I>, "(">>)
    : W extends SpecialValueFunction
      ? (T[Nx<I>] extends OpTok<"("> ? (T[Nx<Nx<I>>] extends NumTok ? SpecialValue<T, W, I> : ParseNameExpr<T, I>) : SpecialValue<T, W, I>)
    : W extends "interval" ? (T[Nx<I>] extends StrTok<infer V> ? Ok<{ t: "typed"; type: "interval"; v: V }, SkipIntervalQualifier<T, Nx<Nx<I>>>> : ParseNameExpr<T, I>)
    : W extends "operator" ? (T[Nx<I>] extends OpTok<"("> ? ParseUnary<T, "operator", SkipToCloseParen<T, Nx<Nx<I>>>> : ParseNameExpr<T, I>)
    : W extends XmlFuncKeyword ? (T[Nx<I>] extends OpTok<"("> ? ParseXmlFunc<T, W, Nx<Nx<I>>> : ParseNameExpr<T, I>)
    : W extends ReservedKeyword ? SyntaxError<T, I>
    : ParseNameExpr<T, I>
  : Fail<"syntax error at end of input", I>;

type SpecialValueFunction =
  | "current_date" | "current_timestamp" | "current_time" | "localtime" | "localtimestamp"
  | "current_user" | "current_role" | "session_user" | "current_catalog" | "current_schema" | "user" | "system_user";

/** `current_date`, `current_time(3)`, ...: a zero-argument call named after the keyword. `current_schema()` with parens is a regular call. */
type SpecialValue<T extends Toks, W extends string, I extends number> =
  Ok<{ t: "call"; name: W; args: []; distinct: false; filter: null; over: false; win: null; withinGroup: null }, SkipPrecision<T, Nx<I>>>;
type SkipPrecision<T extends Toks, I extends number> =
  T[I] extends OpTok<"("> ? (T[Nx<I>] extends NumTok ? (T[Nx<Nx<I>>] extends OpTok<")"> ? Nx<Nx<Nx<I>>> : I) : I) : I;
type IntervalField = "year" | "month" | "day" | "hour" | "minute" | "second";
type SkipIntervalQualifier<T extends Toks, I extends number> =
  T[I] extends WordTok<IntervalField>
    ? T[Nx<I>] extends WordTok<"to"> ? (T[Nx<Nx<I>>] extends WordTok<IntervalField> ? SkipPrecision<T, Nx<Nx<Nx<I>>>> : SkipPrecision<T, Nx<I>>)
    : SkipPrecision<T, Nx<I>>
  : SkipPrecision<T, I>;

type ParseUnary<T extends Toks, O extends string, I extends number> =
  ParseExpr<T, I, O extends "not" ? 3 : O extends "-" | "+" ? 11 : 8> extends infer X
    ? X extends Ok<infer E, infer J extends number> ? Ok<{ t: "un"; op: O; e: E }, J> : X
    : never;

/** After `(`: subquery, parenthesized expression, or row constructor. */
type ParseParen<T extends Toks, I extends number> =
  IsSelectStart<T, I> extends true
    ? ParseSelectStmt<T, I> extends infer X
      ? X extends Ok<infer S, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "sub"; q: S }, EatOp<T, J, ")">>
        : X
      : never
    : ParseExpr<T, I, 0> extends infer X
      ? X extends Ok<infer E, infer J extends number>
        ? EatOp<T, J, ")"> extends never
          ? EatOp<T, J, ","> extends never ? Expected<'")"', T, J>
          : ParseExprList<T, EatOp<T, J, ",">, [E]> extends infer Y
            ? Y extends Ok<infer Items, infer J2 extends number>
              ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2> : Ok<{ t: "row"; items: Items }, EatOp<T, J2, ")">>
              : Y
            : never
          : T[EatOp<T, J, ")">] extends OpTok<"."> ? ParseParenField<T, E, Nx<EatOp<T, J, ")">>>
          : Ok<E, EatOp<T, J, ")">>
        : X
      : never;
/** `(e).name` / `(e).*` after a parenthesized expression (the infix loop continues with the result). */
type ParseParenField<T extends Toks, E, I extends number> =
  T[I] extends OpTok<"*"> ? Ok<{ t: "field"; e: E; name: "*" }, Nx<I>>
  : Ident<T, I> extends [infer N extends string, infer J extends number] ? Ok<{ t: "field"; e: E; name: N }, J> : Expected<"field name", T, I>;

/** Identifier-led expression: column ref, `t.*`, function call, or typed literal. */
type ParseNameExpr<T extends Toks, I extends number> =
  QualName<T, I> extends [infer Parts extends readonly string[], infer J extends number]
    ? T[J] extends OpTok<"(">
      ? (T[I] extends WordTok<infer W extends JsonFuncWord> ? (T[Nx<I>] extends OpTok<"("> ? ParseJsonFunc<T, W, I> : ParseCall<T, LastOf<Parts>, Nx<J>>) : ParseCall<T, LastOf<Parts>, Nx<J>>)
    : T[J] extends OpTok<"."> ? (T[Nx<J>] extends OpTok<"*"> ? Ok<{ t: "star"; tbl: LastOf<Parts> }, Nx<Nx<J>>> : SyntaxError<T, Nx<J>>)
    : T[J] extends StrTok<infer V>
      ? Parts extends readonly [infer Ty extends string] ? Ok<{ t: "typed"; type: NormalizeTypeName<Ty>; v: V }, Nx<J>> : SyntaxError<T, J>
    : Ok<ColRefOf<Parts>, J>
    : SyntaxError<T, I>;

type LastOf<Parts extends readonly string[]> = Parts extends readonly [...string[], infer L extends string] ? L : never;
type ColRefOf<Parts extends readonly string[]> =
  Parts extends readonly [infer C extends string] ? { t: "col"; tbl: null; name: C }
  : Parts extends readonly [infer Tb extends string, infer C extends string] ? { t: "col"; tbl: Tb; name: C }
  : Parts extends readonly [string, infer Tb extends string, infer C extends string] ? { t: "col"; tbl: Tb; name: C }
  : never;

/** After `name(`. */
export type ParseCall<T extends Toks, Name extends string, I extends number> =
  T[I] extends OpTok<")"> ? ParseCallSuffix<T, Name, [], false, Nx<I>>
  : T[I] extends OpTok<"*"> ? (T[Nx<I>] extends OpTok<")"> ? ParseCallSuffix<T, Name, [{ t: "star"; tbl: null }], false, Nx<Nx<I>>> : SyntaxError<T, Nx<I>>)
  : EatWord<T, I, "distinct"> extends never
    ? ParseCallArgs<T, Name, SkipWord<T, I, "all">, false>
    : ParseCallArgs<T, Name, EatWord<T, I, "distinct">, true>;

type ParseCallArgs<T extends Toks, Name extends string, I extends number, Distinct extends boolean> =
  ParseExprList<T, SkipWord<T, I, "variadic">, []> extends infer X
    ? X extends Ok<infer Args, infer J extends number>
      ? SkipAggOrderBy<T, J> extends infer J2
        ? J2 extends number
          ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2> : ParseCallSuffix<T, Name, Args, Distinct, EatOp<T, J2, ")">>
          : J2
        : never
      : X
    : never;

/** `ORDER BY ...` inside an aggregate call: parsed and discarded. Returns next index or error. */
type SkipAggOrderBy<T extends Toks, I extends number> =
  EatWords<T, I, ["order", "by"]> extends never ? I
  : ParseOrderList<T, EatWords<T, I, ["order", "by"]>> extends infer X
    ? X extends Ok<unknown, infer J extends number> ? J : X
    : never;

/** `WITHIN GROUP (ORDER BY e)`, `FILTER (WHERE e)`, `OVER (...)` / `OVER name`. */
type ParseCallSuffix<T extends Toks, Name extends string, Args, Distinct extends boolean, I extends number> =
  ParseWithinGroup<T, I> extends infer W
    ? W extends Ok<infer WG, infer I1 extends number>
      ? ParseFilter<T, I1> extends infer F
        ? F extends Ok<infer Flt, infer I2 extends number>
          ? ParseOver<T, I2> extends infer O
            ? O extends Ok<infer Ov, infer I3 extends number>
              ? Ok<{ t: "call"; name: Name; args: Args; distinct: Distinct; filter: Flt; over: Ov extends null ? false : true; win: Ov; withinGroup: WG }, I3>
              : O
            : never
          : F
        : never
      : W
    : never;

type ParseWithinGroup<T extends Toks, I extends number> =
  EatWords<T, I, ["within", "group"]> extends never ? Ok<null, I>
  : EatOp<T, EatWords<T, I, ["within", "group"]>, "("> extends never ? Expected<'"("', T, EatWords<T, I, ["within", "group"]>>
  : EatWords<T, EatOp<T, EatWords<T, I, ["within", "group"]>, "(">, ["order", "by"]> extends never ? Expected<"ORDER BY", T, EatOp<T, EatWords<T, I, ["within", "group"]>, "(">>
  : ParseExpr<T, EatWords<T, EatOp<T, EatWords<T, I, ["within", "group"]>, "(">, ["order", "by"]>, 0> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? EatOp<T, SkipOrderTail<T, J>, ")"> extends never ? Expected<'")"', T, SkipOrderTail<T, J>> : Ok<E, EatOp<T, SkipOrderTail<T, J>, ")">>
      : X
    : never;

export type ParseFilter<T extends Toks, I extends number> =
  EatWord<T, I, "filter"> extends never ? Ok<null, I>
  : EatOp<T, EatWord<T, I, "filter">, "("> extends never ? Expected<'"("', T, EatWord<T, I, "filter">>
  : EatWord<T, EatOp<T, EatWord<T, I, "filter">, "(">, "where"> extends never ? Expected<"WHERE", T, EatOp<T, EatWord<T, I, "filter">, "(">>
  : ParseExpr<T, EatWord<T, EatOp<T, EatWord<T, I, "filter">, "(">, "where">, 0> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<E, EatOp<T, J, ")">>
      : X
    : never;

/** `OVER (spec)` or `OVER name` → `Ok<WindowSpec | null, next>`. */
export type ParseOver<T extends Toks, I extends number> =
  EatWord<T, I, "over"> extends never ? Ok<null, I>
  : T[EatWord<T, I, "over">] extends OpTok<"("> ? ParseWindowSpec<T, Nx<EatWord<T, I, "over">>>
  : T[EatWord<T, I, "over">] extends WordTok<infer W> | IdTok<infer W> ? Ok<{ name: W; partition: []; order: [] }, Nx<EatWord<T, I, "over">>>
  : Expected<"window specification", T, EatWord<T, I, "over">>;

/**
 * Window specification after `(`: `[existing_window] [PARTITION BY exprs] [ORDER BY items] [frame] )`.
 * The frame clause (`ROWS | RANGE | GROUPS ... [EXCLUDE ...]`) is parsed and discarded.
 */
export type ParseWindowSpec<T extends Toks, I extends number> =
  WindowBaseName<T, I> extends [infer Name extends string | null, infer I1 extends number]
    ? ParseWindowPartition<T, I1> extends infer P
      ? P extends Ok<infer Part, infer I2 extends number>
        ? ParseWindowOrder<T, I2> extends infer O
          ? O extends Ok<infer Ord, infer I3 extends number>
            ? SkipFrame<T, I3> extends infer I4
              ? I4 extends number
                ? EatOp<T, I4, ")"> extends never ? Expected<'")"', T, I4> : Ok<{ name: Name; partition: Part; order: Ord }, EatOp<T, I4, ")">>
                : I4
              : never
            : O
          : never
        : P
      : never
    : never;
type WindowBaseName<T extends Toks, I extends number> =
  T[I] extends IdTok<infer V> ? [V, Nx<I>]
  : T[I] extends WordTok<infer W> ? (W extends "partition" | "order" | "rows" | "range" | "groups" ? [null, I] : [W, Nx<I>])
  : [null, I];
type ParseWindowPartition<T extends Toks, I extends number> =
  EatWords<T, I, ["partition", "by"]> extends never ? Ok<[], I> : ParseExprList<T, EatWords<T, I, ["partition", "by"]>, []>;
type ParseWindowOrder<T extends Toks, I extends number> =
  EatWords<T, I, ["order", "by"]> extends never ? Ok<[], I> : ParseOrderList<T, EatWords<T, I, ["order", "by"]>>;
/** `[ROWS | RANGE | GROUPS] (BETWEEN bound AND bound | bound) [EXCLUDE ...]` → next index or error. */
type SkipFrame<T extends Toks, I extends number> =
  EatWord<T, I, "rows" | "range" | "groups"> extends never ? I
  : EatWord<T, EatWord<T, I, "rows" | "range" | "groups">, "between"> extends never
    ? ParseFrameBound<T, EatWord<T, I, "rows" | "range" | "groups">> extends infer J ? (J extends number ? SkipExclude<T, J> : J) : never
    : ParseFrameBound<T, EatWord<T, EatWord<T, I, "rows" | "range" | "groups">, "between">> extends infer J
      ? J extends number
        ? EatWord<T, J, "and"> extends never ? Expected<"AND", T, J>
        : ParseFrameBound<T, EatWord<T, J, "and">> extends infer J2 ? (J2 extends number ? SkipExclude<T, J2> : J2) : never
        : J
      : never;
/** `UNBOUNDED PRECEDING | UNBOUNDED FOLLOWING | CURRENT ROW | expr PRECEDING | expr FOLLOWING` → next index or error. */
type ParseFrameBound<T extends Toks, I extends number> =
  EatWords<T, I, ["unbounded", "preceding"]> extends never
    ? EatWords<T, I, ["unbounded", "following"]> extends never
      ? EatWords<T, I, ["current", "row"]> extends never
        ? ParseExpr<T, I, 0> extends infer X
          ? X extends Ok<unknown, infer J extends number>
            ? EatWord<T, J, "preceding" | "following"> extends never ? Expected<"PRECEDING or FOLLOWING", T, J> : EatWord<T, J, "preceding" | "following">
            : X
          : never
        : EatWords<T, I, ["current", "row"]>
      : EatWords<T, I, ["unbounded", "following"]>
    : EatWords<T, I, ["unbounded", "preceding"]>;
type SkipExclude<T extends Toks, I extends number> =
  EatWord<T, I, "exclude"> extends never ? I
  : EatWords<T, EatWord<T, I, "exclude">, ["current", "row"]> extends never
    ? EatWords<T, EatWord<T, I, "exclude">, ["no", "others"]> extends never
      ? EatWord<T, EatWord<T, I, "exclude">, "group" | "ties"> extends never ? Expected<"CURRENT ROW, GROUP, TIES or NO OTHERS", T, EatWord<T, I, "exclude">> : EatWord<T, EatWord<T, I, "exclude">, "group" | "ties">
      : EatWords<T, EatWord<T, I, "exclude">, ["no", "others"]>
    : EatWords<T, EatWord<T, I, "exclude">, ["current", "row"]>;

type ParseCase<T extends Toks, I extends number> =
  EatWord<T, I, "when"> extends never
    ? ParseExpr<T, I, 0> extends infer X
      ? X extends Ok<infer Operand, infer J extends number> ? ParseCaseWhens<T, Operand, J, []> : X
      : never
    : ParseCaseWhens<T, null, I, []>;
type ParseCaseWhens<T extends Toks, Operand, I extends number, Acc extends readonly unknown[]> =
  EatWord<T, I, "when"> extends never
    ? EatWord<T, I, "else"> extends never
      ? EatWord<T, I, "end"> extends never ? Expected<"WHEN, ELSE or END", T, I>
      : Ok<{ t: "case"; operand: Operand; whens: Acc; else: null }, EatWord<T, I, "end">>
      : ParseExpr<T, EatWord<T, I, "else">, 0> extends infer X
        ? X extends Ok<infer E, infer J extends number>
          ? EatWord<T, J, "end"> extends never ? Expected<"END", T, J> : Ok<{ t: "case"; operand: Operand; whens: Acc; else: E }, EatWord<T, J, "end">>
          : X
        : never
    : ParseExpr<T, EatWord<T, I, "when">, 0> extends infer X
      ? X extends Ok<infer W, infer J extends number>
        ? EatWord<T, J, "then"> extends never ? Expected<"THEN", T, J>
        : ParseExpr<T, EatWord<T, J, "then">, 0> extends infer Y
          ? Y extends Ok<infer Th, infer J2 extends number> ? ParseCaseWhens<T, Operand, J2, [...Acc, { when: W; then: Th }]> : Y
          : never
        : X
      : never;

type ParseCast<T extends Toks, I extends number> =
  EatOp<T, I, "("> extends never ? Expected<'"("', T, I>
  : ParseExpr<T, EatOp<T, I, "(">, 0> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? EatWord<T, J, "as"> extends never ? Expected<"AS", T, J>
      : ParseTypeName<T, EatWord<T, J, "as">> extends infer Y
        ? Y extends Ok<infer Ty extends string, infer J2 extends number>
          ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2> : Ok<{ t: "cast"; e: E; to: Ty }, EatOp<T, J2, ")">>
          : Y
        : never
      : X
    : never;

type ParseExists<T extends Toks, I extends number> =
  EatOp<T, I, "("> extends never ? Expected<'"("', T, I>
  : ParseSelectStmt<T, EatOp<T, I, "(">> extends infer X
    ? X extends Ok<infer S, infer J extends number>
      ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "exists"; q: S }, EatOp<T, J, ")">>
      : X
    : never;

/** After `ARRAY`: `[...]` or `(subquery)`. */
type ParseArray<T extends Toks, I extends number> =
  EatOp<T, I, "["> extends never
    ? EatOp<T, I, "("> extends never ? Expected<'"[" or "("', T, I>
    : ParseSelectStmt<T, EatOp<T, I, "(">> extends infer X
      ? X extends Ok<infer S, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "arraysub"; q: S }, EatOp<T, J, ")">>
        : X
      : never
    : ParseArrayLiteral<T, EatOp<T, I, "[">>;
/** After `[`. */
type ParseArrayLiteral<T extends Toks, I extends number> =
  EatOp<T, I, "]"> extends never
    ? ParseExprList<T, I, []> extends infer X
      ? X extends Ok<infer Items, infer J extends number>
        ? EatOp<T, J, "]"> extends never ? Expected<'"]"', T, J> : Ok<{ t: "array"; items: Items }, EatOp<T, J, "]">>
        : X
      : never
    : Ok<{ t: "array"; items: [] }, EatOp<T, I, "]">>;

/** After `ROW(`. */
type ParseRow<T extends Toks, I extends number> =
  EatOp<T, I, ")"> extends never
    ? ParseExprList<T, I, []> extends infer X
      ? X extends Ok<infer Items, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "row"; items: Items }, EatOp<T, J, ")">>
        : X
      : never
    : Ok<{ t: "row"; items: [] }, EatOp<T, I, ")">>;

/** After `EXTRACT(`. */
type ParseExtract<T extends Toks, I extends number> =
  T[I] extends WordTok<infer F> | StrTok<infer F>
    ? EatWord<T, Nx<I>, "from"> extends never ? Expected<"FROM", T, Nx<I>>
    : ParseExpr<T, EatWord<T, Nx<I>, "from">, 0> extends infer X
      ? X extends Ok<infer E, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "extract"; field: F; e: E }, EatOp<T, J, ")">>
        : X
      : never
    : Expected<"field FROM expression", T, I>;

/** After `POSITION(`: `sub IN str`. The first operand stops before `IN`. */
type ParsePosition<T extends Toks, I extends number> =
  ParseExpr<T, I, 7> extends infer X
    ? X extends Ok<infer Sub, infer J extends number>
      ? EatWord<T, J, "in"> extends never ? Expected<"IN", T, J>
      : ParseExpr<T, EatWord<T, J, "in">, 0> extends infer Y
        ? Y extends Ok<infer In, infer J2 extends number>
          ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2> : Ok<{ t: "position"; sub: Sub; in: In }, EatOp<T, J2, ")">>
          : Y
        : never
      : X
    : never;

/** After `SUBSTRING(`: `e FROM a FOR b`, `e FOR b`, `e SIMILAR p ESCAPE c`, or `e, a[, b]`. */
type ParseSubstring<T extends Toks, I extends number> =
  ParseExpr<T, I, 0> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? EatOp<T, J, ","> extends never
        ? ParseSubstringFromFor<T, E, J, null>
        : ParseExprList<T, EatOp<T, J, ",">, []> extends infer Y
          ? Y extends Ok<infer Rest, infer J2 extends number>
            ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2>
            : Ok<{ t: "substring"; e: E; from: Rest extends readonly [infer F, ...unknown[]] ? F : null; for: Rest extends readonly [unknown, infer G, ...unknown[]] ? G : null }, EatOp<T, J2, ")">>
            : Y
          : never
      : X
    : never;
type ParseSubstringFromFor<T extends Toks, E, I extends number, From> =
  EatWord<T, I, "from"> extends never
    ? EatWord<T, I, "for"> extends never
      ? EatWord<T, I, "similar"> extends never
        ? EatOp<T, I, ")"> extends never ? Expected<'")"', T, I> : Ok<{ t: "substring"; e: E; from: From; for: null }, EatOp<T, I, ")">>
        : ParseExpr<T, EatWord<T, I, "similar">, 0> extends infer X
          ? X extends Ok<unknown, infer J extends number>
            ? EatWord<T, J, "escape"> extends never ? Expected<"ESCAPE", T, J>
            : ParseExpr<T, EatWord<T, J, "escape">, 0> extends infer Y
              ? Y extends Ok<unknown, infer J2 extends number>
                ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2> : Ok<{ t: "substring"; e: E; from: null; for: null }, EatOp<T, J2, ")">>
                : Y
              : never
            : X
          : never
      : ParseExpr<T, EatWord<T, I, "for">, 0> extends infer X
        ? X extends Ok<infer For, infer J extends number>
          ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "substring"; e: E; from: From; for: For }, EatOp<T, J, ")">>
          : X
        : never
    : ParseExpr<T, EatWord<T, I, "from">, 0> extends infer X
      ? X extends Ok<infer Fr, infer J extends number> ? ParseSubstringFromFor<T, E, J, Fr> : X
      : never;

/** After `TRIM(`: `[BOTH|LEADING|TRAILING] [chars FROM] e` or `(e)` / `(e, chars)`. */
type ParseTrim<T extends Toks, I extends number> =
  T[I] extends WordTok<infer Side extends "both" | "leading" | "trailing"> ? ParseTrimBody<T, Nx<I>, Side> : ParseTrimBody<T, I, "both">;
type ParseTrimBody<T extends Toks, I extends number, Side extends string> =
  EatWord<T, I, "from"> extends never
    ? ParseExpr<T, I, 0> extends infer X
      ? X extends Ok<infer E1, infer J extends number>
        ? EatWord<T, J, "from"> extends never
          ? EatOp<T, J, ","> extends never
            ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "trim"; e: E1; chars: null; side: Side }, EatOp<T, J, ")">>
            : ParseExpr<T, EatOp<T, J, ",">, 0> extends infer Y
              ? Y extends Ok<infer C, infer J2 extends number>
                ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2> : Ok<{ t: "trim"; e: E1; chars: C; side: Side }, EatOp<T, J2, ")">>
                : Y
              : never
          : ParseExpr<T, EatWord<T, J, "from">, 0> extends infer Y
            ? Y extends Ok<infer E, infer J2 extends number>
              ? EatOp<T, J2, ")"> extends never ? Expected<'")"', T, J2> : Ok<{ t: "trim"; e: E; chars: E1; side: Side }, EatOp<T, J2, ")">>
              : Y
            : never
        : X
      : never
    : ParseExpr<T, EatWord<T, I, "from">, 0> extends infer X
      ? X extends Ok<infer E, infer J extends number>
        ? EatOp<T, J, ")"> extends never ? Expected<'")"', T, J> : Ok<{ t: "trim"; e: E; chars: null; side: Side }, EatOp<T, J, ")">>
        : X
      : never;

/** After `OVERLAY(`: `e PLACING p FROM a [FOR b]`. */
type ParseOverlay<T extends Toks, I extends number> =
  ParseExpr<T, I, 0> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? EatWord<T, J, "placing"> extends never ? Expected<"PLACING", T, J>
      : ParseExpr<T, EatWord<T, J, "placing">, 0> extends infer Y
        ? Y extends Ok<unknown, infer J2 extends number>
          ? EatWord<T, J2, "from"> extends never ? Expected<"FROM", T, J2>
          : ParseExpr<T, EatWord<T, J2, "from">, 0> extends infer Z
            ? Z extends Ok<unknown, infer J3 extends number>
              ? EatWord<T, J3, "for"> extends never
                ? EatOp<T, J3, ")"> extends never ? Expected<'")"', T, J3> : Ok<{ t: "overlay"; e: E }, EatOp<T, J3, ")">>
                : ParseExpr<T, EatWord<T, J3, "for">, 0> extends infer V
                  ? V extends Ok<unknown, infer J4 extends number>
                    ? EatOp<T, J4, ")"> extends never ? Expected<'")"', T, J4> : Ok<{ t: "overlay"; e: E }, EatOp<T, J4, ")">>
                    : V
                  : never
              : Z
            : never
          : Y
        : never
      : X
    : never;

// ───────────────────────────── lists ─────────────────────────────

/** Comma-separated expressions: `Ok<exprs, next>`. Stops before the first non-comma token. */
export type ParseExprList<T extends Toks, I extends number, Acc extends readonly unknown[]> =
  ParseExpr<T, I, 0> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? EatOp<T, J, ","> extends never ? Ok<[...Acc, E], J> : ParseExprList<T, EatOp<T, J, ",">, [...Acc, E]>
      : X
    : never;

/** `ORDER BY` items (after `ORDER BY`): expressions only; direction and NULLS ordering are discarded. */
export type ParseOrderList<T extends Toks, I extends number, Acc extends readonly unknown[] = []> =
  ParseExpr<T, I, 0> extends infer X
    ? X extends Ok<infer E, infer J extends number>
      ? EatOp<T, SkipOrderTail<T, J>, ","> extends never ? Ok<[...Acc, E], SkipOrderTail<T, J>> : ParseOrderList<T, EatOp<T, SkipOrderTail<T, J>, ",">, [...Acc, E]>
      : X
    : never;
/** `[ASC | DESC | USING op] [NULLS FIRST | LAST]` → next index. */
export type SkipOrderTail<T extends Toks, I extends number> =
  SkipNulls<T,
    EatWord<T, I, "asc" | "desc"> extends never
      ? (T[I] extends WordTok<"using"> ? (T[Nx<I>] extends OpTok ? Nx<Nx<I>> : I) : I)
      : EatWord<T, I, "asc" | "desc">
  >;
type SkipNulls<T extends Toks, I extends number> =
  EatWords<T, I, ["nulls", "first"]> extends never ? (EatWords<T, I, ["nulls", "last"]> extends never ? I : EatWords<T, I, ["nulls", "last"]>) : EatWords<T, I, ["nulls", "first"]>;
