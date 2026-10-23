import type { Cte, CteCycle, CteSearch, Expr, FromItem, NamedWindow, SelectBody, SelectStmt, Target, WithClause } from "../ast.js";
import type { BindFrom, RenameCols } from "../binder/from.js";
import type {
  CheckCondition, CheckDistinctOnOrder, CheckDistinctOrder, CheckGroupBy, CheckOutputOrder, CheckWindowClause, CheckWindowRefs,
  ResolveSortKeys, TypeDisplay, WindowDefs,
} from "../binder/clauses.js";
import type { NarrowKeys, NarrowLevel } from "../binder/narrow.js";
import type { ExpandStar } from "../binder/resolve.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Nx } from "../parser/util.js";
import type { ColInfo, ColMap, Cols, ColsToMap, CteMap, Ctx, Info, MkCtx, NullableMap, Scope, ScopeLevel } from "../types.js";
import type { ObjShape, Shaped } from "../shape.js";
import type { CommonLit, LitToText } from "../typer/operators.js";
import type { TypeOf } from "../typer/typeof.js";
import type { ColumnName } from "./naming.js";
import type { ProjectStmt } from "./stmt.js";

/**
 * Project a SELECT statement to its ordered output columns.
 * `ProjectSelect<Q, DB, Outer, Ctes>` → `Cols` or `SqlError`.
 *
 * Nodes are discriminated on `t` and passed on field by field (never compared against the
 * recursive AST types, ENGINE.md pitfall 12).
 */
export type ProjectSelect<Q extends SelectStmt, DB, Outer extends Scope, Ctes extends CteMap> =
  ProjectSelectParts<Q["with"], Q["body"], Q["orderBy"], DB, Outer, Ctes, false>;

/**
 * `[WITH ...] body [ORDER BY ...]`. `Lit`: type untyped string-literal targets as `lit`
 * (operands of a set operation, where they take the type of the other branches).
 */
export type ProjectSelectParts<W extends WithClause | null, B extends SelectBody, Order extends readonly Expr[], DB, Outer extends Scope, Ctes extends CteMap, Lit extends boolean = false> =
  BindWith<W, DB, Outer, Ctes> extends infer C2
    ? C2 extends CteMap ? ProjectBody<B, DB, Outer, C2, Order, Lit> : C2
    : never;

// ───────────────────────────── WITH ─────────────────────────────

/**
 * Add the CTEs of a WITH clause to the CTE map. Each CTE sees the previous ones (and
 * shadows an outer CTE or table of the same name); a RECURSIVE CTE also sees itself.
 */
export type BindWith<W extends WithClause | null, DB, Outer extends Scope, Ctes extends CteMap> =
  W extends null ? Ctes : BindCtes<NonNullable<W>["ctes"], NonNullable<W>["recursive"], DB, Outer, Ctes, never, 0>;

type BindCtes<Cs extends readonly Cte[], Rec extends boolean, DB, Outer extends Scope, Ctes extends CteMap, Seen extends string, I extends number> =
  Cs[I] extends undefined ? Ctes
  : Cs[I]["name"] extends Seen ? SqlError<`WITH query name "${Cs[I]["name"]}" specified more than once`, null>
  : BindCte<Cs[I], Rec, DB, Outer, Ctes> extends infer M
    ? M extends ColMap ? BindCtes<Cs, Rec, DB, Outer, AddCte<Ctes, Cs[I]["name"], M>, Seen | Cs[I]["name"], Nx<I>> : M
    : never;

type AddCte<Ctes extends CteMap, N extends string, M extends ColMap> =
  N extends keyof Ctes ? Omit<Ctes, N> & { readonly [K in N]: M } : Ctes & { readonly [K in N]: M };

type BindCte<C extends Cte, Rec extends boolean, DB, Outer extends Scope, Ctes extends CteMap> =
  Rec extends true
    ? C["q"] extends { readonly t: "select"; readonly body: { readonly t: "setop" } }
      ? C extends { readonly search: null; readonly cycle: null }
        ? RecursiveCte<C["name"], C["cols"], C["q"]["with"], C["q"]["body"], C["q"]["orderBy"], DB, Outer, Ctes, null, null>
        : CheckExpandable<C["q"]["body"]> extends infer E
          ? E extends AnyErr ? E : RecursiveCte<C["name"], C["cols"], C["q"]["with"], C["q"]["body"], C["q"]["orderBy"], DB, Outer, Ctes, C["search"], C["cycle"]>
          : never
      : NotRecursive<C, ProjectCteBody<C, DB, Outer, Ctes>>
    : NotRecursive<C, ProjectCteBody<C, DB, Outer, Ctes>>;

type ProjectCteBody<C extends Cte, DB, Outer extends Scope, Ctes extends CteMap> =
  ProjectStmt<C["q"], DB, Outer, Ctes> extends infer R
    ? R extends Cols ? (ApplyCteCols<R, C["cols"], C["name"]> extends infer R2 ? (R2 extends Cols ? ColsToMap<R2> : R2) : never)
    : R extends null ? SqlError<`WITH query "${C["name"]}" does not have a RETURNING clause`, null>
    : R
    : never;

// ─── SEARCH / CYCLE ───

/**
 * `SEARCH ... SET seq` and `CYCLE ... SET mark [TO v DEFAULT d] USING path` add columns to a
 * recursive CTE (also visible to its recursive term): `seq` is `record[]` (DEPTH FIRST) or
 * `record` (BREADTH FIRST), `mark` is `bool` or the common type of `v` and `d`, `path` is
 * `record[]`; none is ever NULL. They need a recursive CTE whose two terms are plain SELECTs.
 */
type NotRecursive<C extends Cte, R> = C extends { readonly search: null; readonly cycle: null } ? R : SqlError<"WITH query is not recursive", null>;
/** The recursive term and the non-recursive term must both be plain SELECTs (not set operations). */
type CheckExpandable<B extends SelectBody> =
  B extends { readonly t: "setop" }
    ? IsSetLeaf<B["l"]> extends false ? SqlError<"with a SEARCH or CYCLE clause, the left side of the UNION must be a SELECT", null>
    : IsSetLeaf<B["r"]> extends false ? SqlError<"with a SEARCH or CYCLE clause, the right side of the UNION must be a SELECT", null>
    : true
    : true;
type IsSetLeaf<B> =
  B extends { readonly t: "setop" } ? false
  : B extends { readonly t: "paren"; readonly q: { readonly body: { readonly t: "setop" } } } ? false
  : true;
type CheckCteColList<Cols extends readonly string[], M extends ColMap, What extends string, Seen extends string> =
  Cols extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? H extends keyof M
      ? H extends Seen ? SqlError<`${What} column "${H}" specified more than once`, null> : CheckCteColList<R, M, What, Seen | H>
      : SqlError<`${What} column "${H}" not in WITH query column list`, null>
    : true;
/** The columns SEARCH and CYCLE add (`{}` without them), or an error. `M`: the CTE's columns. */
type SearchCycleCols<S, Y, M extends ColMap> =
  SearchCols<S, M> extends infer SC
    ? SC extends AnyErr ? SC
    : CycleCols<Y, S, M> extends infer YC
      ? YC extends AnyErr ? YC : SC & YC extends infer All ? { readonly [K in keyof All]: All[K] } : never
      : never
    : never;
type SearchCols<S, M extends ColMap> =
  S extends CteSearch
    ? CheckCteColList<S["cols"], M, "search", never> extends infer E
      ? E extends AnyErr ? E
      : S["set"] extends keyof M ? SqlError<`search sequence column name "${S["set"]}" already used in WITH query column list`, null>
      : { readonly [K in S["set"]]: Info<S["breadth"] extends true ? "record" : "record[]"> }
      : never
    : {};
type CycleCols<Y, S, M extends ColMap> =
  Y extends CteCycle
    ? CheckCteColList<Y["cols"], M, "cycle", never> extends infer E
      ? E extends AnyErr ? E
      : Y["set"] extends keyof M ? SqlError<`cycle mark column name "${Y["set"]}" already used in WITH query column list`, null>
      : Y["using"] extends keyof M ? SqlError<`cycle path column name "${Y["using"]}" already used in WITH query column list`, null>
      : Y["set"] extends Y["using"] ? SqlError<"cycle mark column name and cycle path column name are the same", null>
      : S extends CteSearch & { readonly set: Y["set"] } ? SqlError<"search sequence column name and cycle mark column name are the same", null>
      : S extends CteSearch & { readonly set: Y["using"] } ? SqlError<"search sequence column name and cycle path column name are the same", null>
      : CycleMarkType<Y["to"], Y["default"]> extends infer T
        ? T extends string ? { readonly [K in Y["set"]]: Info<T> } & { readonly [K in Y["using"]]: Info<"record[]"> } : T
        : never
      : never
    : {};
/** `TO v DEFAULT d`: their common type (string literals yield; two of them are text), which needs an equality operator. */
type CycleMarkType<To, Def> =
  To extends Expr
    ? Def extends Expr
      ? ConstType<To> extends infer A extends string
        ? ConstType<Def> extends infer B extends string
          ? CommonLit<A, B> extends infer T extends string
            ? T extends "unknown" ? (A | B extends "unknown" | "null" | "lit" ? "text" : SqlError<`CYCLE types ${TypeDisplay<A>} and ${TypeDisplay<B>} cannot be matched`, null>)
            : LitToText<T> extends "point" | "polygon" | "json" | "xml" ? SqlError<`could not identify an equality operator for type ${LitToText<T>}`, null>
            : LitToText<T>
            : never
          : never
        : never
      : "bool"
    : "bool";
type ConstType<E extends Expr> =
  E extends { readonly t: "str" } ? "lit"
  : TypeOf<E, MkCtx<unknown, [], {}, false>> extends infer T ? (T extends ColInfo ? T["type"] : "unknown") : never;

/** `WITH a(x, y) AS (...)`: rename positionally; more names than columns is an error. */
type ApplyCteCols<C extends Cols, Names extends readonly string[] | null, Name extends string> =
  Names extends readonly string[] ? RenameCols<C, Names, [], `WITH query "${Name}"`> : C;

/**
 * `WITH RECURSIVE t AS (non_recursive UNION [ALL] recursive)`: column types come from the
 * non-recursive term (as in Postgres); nullability is the union over both terms, iterated
 * to a fixpoint (a recursive term can feed a nullable column back into another one).
 */
type RecursiveCte<Name extends string, Names extends readonly string[] | null, W extends WithClause | null, B extends SelectBody, Order extends readonly Expr[], DB, Outer extends Scope, Ctes extends CteMap, S, Y> =
  B extends { readonly t: "setop" }
    ? ProjectBody<B["l"], DB, Outer, Ctes, [], false> extends infer C0
      ? C0 extends Cols
        ? ApplyCteCols<C0, Names, Name> extends infer C1
          ? C1 extends Cols
            ? S | Y extends null ? RecursiveFix<Name, Names, W, B, Order, DB, Outer, Ctes, ColsToMap<C1>, ColsToMap<C1>, [0], null>
            : SearchCycleCols<S, Y, ColsToMap<C1>> extends infer X
              ? X extends ColMap ? RecursiveFix<Name, Names, W, B, Order, DB, Outer, Ctes, ColsToMap<C1>, ColsToMap<C1>, [0], X> : X
              : never
            : C1
          : never
        : C0
      : never
    : never;
/** `X`: the SEARCH / CYCLE columns (or null), added to the self reference and the result. */
type RecursiveFix<Name extends string, Names extends readonly string[] | null, W extends WithClause | null, B extends SelectBody, Order extends readonly Expr[], DB, Outer extends Scope, Ctes extends CteMap, M0 extends ColMap, M extends ColMap, Iter extends readonly unknown[], X> =
  ProjectSelectParts<W, B, Order, DB, Outer, AddCte<Ctes, Name, X extends ColMap ? WithExtra<M, X> : M>> extends infer Full
    ? Full extends Cols
      ? ApplyCteCols<Full, Names, Name> extends infer F2
        ? F2 extends Cols
          ? FixStep<M0, ColsToMap<F2>> extends infer Next extends ColMap
            ? SameNullability<M, Next> extends true ? (X extends ColMap ? WithExtra<Next, X> : Next)
            : Iter["length"] extends 3 ? (X extends ColMap ? WithExtra<Next, X> : Next)
            : RecursiveFix<Name, Names, W, B, Order, DB, Outer, Ctes, M0, Next, [...Iter, 0], X>
            : never
          : F2
        : never
      : Full
    : never;
type WithExtra<M extends ColMap, X extends ColMap> = M & X extends infer All ? { readonly [K in keyof All]: All[K] } : never;
type FixStep<M0 extends ColMap, Full extends ColMap> = {
  readonly [K in keyof M0]: { readonly type: M0[K]["type"]; readonly nullable: M0[K]["nullable"] extends true ? true : K extends keyof Full ? Full[K]["nullable"] : false };
};
type SameNullability<A extends ColMap, B extends ColMap> = false extends { [K in keyof A]: K extends keyof B ? ([A[K]["nullable"]] extends [B[K]["nullable"]] ? true : false) : false }[keyof A] ? false : true;

// ───────────────────────────── bodies ─────────────────────────────

type ProjectBody<B extends SelectBody, DB, Outer extends Scope, Ctes extends CteMap, Order extends readonly Expr[], Lit extends boolean> =
  B extends { readonly t: "simple" }
    ? B extends { readonly into: unknown } ? SqlError<"SELECT ... INTO is not allowed here", null>
    : ProjectSimple<B["distinct"], B["targets"], B["from"], B["where"], B["groupBy"], B["having"], B["windows"], Order, DB, Outer, Ctes, Lit>
  : B extends { readonly t: "setop" }
    ? ProjectSetOp<B["l"], B["r"], B["op"], DB, Outer, Ctes> extends infer C
      ? C extends Cols ? (CheckOutputOrder<Order, C> extends infer O ? (O extends AnyErr ? O : C) : never) : C
      : never
  : B extends { readonly t: "values" } ? ProjectValues<B["rows"], DB, Outer, Ctes, Order>
  : B extends { readonly t: "paren" }
    ? Order extends readonly [] ? ProjectSelectParts<B["q"]["with"], B["q"]["body"], B["q"]["orderBy"], DB, Outer, Ctes, Lit>
    : B["q"]["orderBy"] extends readonly [] ? ProjectSelectParts<B["q"]["with"], B["q"]["body"], Order, DB, Outer, Ctes, Lit>
    : SqlError<"multiple ORDER BY clauses not allowed", null>
  : SqlError<"unsupported query body", null>;

// ─── set operations ───

type ProjectSetOp<L extends SelectBody, R extends SelectBody, Op extends string, DB, Outer extends Scope, Ctes extends CteMap> =
  ProjectBody<L, DB, Outer, Ctes, [], true> extends infer LC
    ? LC extends Cols
      ? ProjectBody<R, DB, Outer, Ctes, [], true> extends infer RC
        ? RC extends Cols ? AlignSetOp<LC, RC, Uppercase<Op>, [], 0> : RC
        : never
      : LC
    : never;

/**
 * Names come from the left branch; per position the type is the common type (untyped
 * string literals yield to the other branch, Postgres's `select_common_type`; no common
 * type is an error) and nullability is the union. Alignment stops at the first `*` entry
 * (its width is unknown).
 */
type AlignSetOp<L extends Cols, R extends Cols, Op extends string, Acc extends Cols, I extends number> =
  L[I] extends undefined
    ? (R[I] extends undefined | { readonly star: unknown } ? Acc : CountErr<Op>)
  : L[I] extends { readonly n: infer N extends string; readonly t: infer LT extends ColInfo }
    ? R[I] extends { readonly t: infer RT extends ColInfo }
      ? CommonLit<LT["type"], RT["type"]> extends infer T extends string
        ? T extends "unknown"
          ? (LT["type"] | RT["type"] extends "unknown" | "null" | "lit" ? AlignSetOp<L, R, Op, [...Acc, { readonly n: N; readonly t: Info<"unknown", true> }], Nx<I>>
            : LT["type"] extends "unknown" ? AlignSetOp<L, R, Op, [...Acc, { readonly n: N; readonly t: Info<"unknown", true> }], Nx<I>>
            : RT["type"] extends "unknown" ? AlignSetOp<L, R, Op, [...Acc, { readonly n: N; readonly t: Info<"unknown", true> }], Nx<I>>
            : SqlError<`${Op} types ${TypeDisplay<LT["type"]>} and ${TypeDisplay<RT["type"]>} cannot be matched`, null>)
          : AlignSetOp<L, R, Op, [...Acc, { readonly n: N; readonly t: Info<LitToText<T>, LT["nullable"] extends true ? true : RT["nullable"]> }], Nx<I>>
        : never
      : R[I] extends undefined ? CountErr<Op> : RestFrom<L, I, Acc>
    : RestFrom<L, I, Acc>;
type CountErr<Op extends string> = SqlError<`each ${Op} query must have the same number of columns`, null>;
type RestFrom<C extends Cols, I extends number, Acc extends Cols> = C[I] extends undefined ? Acc : RestFrom<C, Nx<I>, [...Acc, C[I]]>;

// ─── VALUES ───

/**
 * `VALUES (...), ...`: columns `column1`, `column2`, ...; per column the common type over
 * the rows (string literals yield, like in set operations) and nullable if any row is.
 * ORDER BY sees the columns (by name, position or in expressions).
 */
type ProjectValues<Rows extends readonly (readonly Expr[])[], DB, Outer extends Scope, Ctes extends CteMap, Order extends readonly Expr[]> =
  Rows[0] extends readonly Expr[]
    ? OperandRow<Rows[0], MkCtx<DB, Outer, Ctes, false>, [], 0> extends infer T0
      ? T0 extends readonly ColInfo[]
        ? MergeRows<Rows, T0, MkCtx<DB, Outer, Ctes, false>, 1> extends infer Ts
          ? Ts extends readonly ColInfo[]
            ? ValuesCols<Ts, 1, []> extends infer Cs extends Cols
              ? Order extends readonly []
                ? Cs
                : ResolveSortKeys<Order, "ORDER BY", ValuesTargets<Cs>, Cs, MkCtx<DB, [[{ readonly alias: "*VALUES*"; readonly cols: ColsToMap<Cs>; readonly skip: [] }], ...Outer], Ctes, false>> extends infer K
                  ? K extends AnyErr ? K : Cs
                  : never
              : never
            : Ts
          : never
        : T0
      : never
    : SqlError<"VALUES requires at least one row", null>;

/** Type a row in operand position (string literals are `lit`). */
type OperandRow<Row extends readonly Expr[], C extends Ctx, Acc extends readonly ColInfo[], I extends number> =
  Row[I] extends undefined ? Acc
  : (Row[I] extends { readonly t: "str" } ? Info<"lit"> : TypeOf<Row[I], C>) extends infer T
    ? T extends ColInfo ? OperandRow<Row, C, [...Acc, T], Nx<I>> : T
    : never;

type MergeRows<Rows extends readonly (readonly Expr[])[], Acc extends readonly ColInfo[], C extends Ctx, I extends number> =
  Rows[I] extends readonly Expr[]
    ? OperandRow<Rows[I], C, [], 0> extends infer Us
      ? Us extends readonly ColInfo[]
        ? Us["length"] extends Acc["length"]
          ? ZipCommon<Acc, Us, [], 0> extends infer Z ? (Z extends readonly ColInfo[] ? MergeRows<Rows, Z, C, Nx<I>> : Z) : never
          : SqlError<"VALUES lists must all be the same length", null>
        : Us
      : never
    : Acc;

type ZipCommon<A extends readonly ColInfo[], B extends readonly ColInfo[], Acc extends readonly ColInfo[], I extends number> =
  A[I] extends ColInfo
    ? B[I] extends ColInfo
      ? CommonLit<A[I]["type"], B[I]["type"]> extends infer T extends string
        ? T extends "unknown"
          ? (A[I]["type"] extends "unknown" ? ZipCommon<A, B, [...Acc, Info<"unknown", true>], Nx<I>>
            : B[I]["type"] extends "unknown" ? ZipCommon<A, B, [...Acc, Info<"unknown", true>], Nx<I>>
            : SqlError<`VALUES types ${TypeDisplay<A[I]["type"]>} and ${TypeDisplay<B[I]["type"]>} cannot be matched`, null>)
          : ZipCommon<A, B, [...Acc, Info<T, A[I]["nullable"] extends true ? true : B[I]["nullable"]>], Nx<I>>
        : never
      : Acc
    : Acc;

type ValuesCols<Ts extends readonly ColInfo[], I extends number, Acc extends Cols> =
  Ts extends readonly [infer T extends ColInfo, ...infer R extends readonly ColInfo[]]
    ? ValuesCols<R, Nx<I>, [...Acc, { readonly n: `column${I}`; readonly t: Info<LitToText<T["type"]>, T["nullable"]> }]>
    : Acc;
type ValuesTargets<Cs extends Cols> = { readonly [K in keyof Cs]: { readonly e: { readonly t: "col"; readonly tbl: null; readonly name: Cs[K] extends { readonly n: infer N } ? N : never }; readonly alias: null } };

// ─── simple select ───

/**
 * FROM → scope; WHERE narrows nullability (binder/narrow.ts); targets are projected in
 * the narrowed scope; then WHERE / HAVING / ORDER BY / GROUP BY / DISTINCT [ON] / WINDOW
 * are validated (binder/clauses.ts).
 */
type ProjectSimple<
  Distinct, Ts extends readonly Target[], From extends readonly FromItem[], Where extends Expr | null, GroupBy extends readonly Expr[] | null,
  Having extends Expr | null, Ws extends readonly NamedWindow[], Order extends readonly Expr[], DB, Outer extends Scope, Ctes extends CteMap, Lit extends boolean,
> =
  BindFrom<From, DB, Outer, Ctes> extends infer L
    ? L extends ScopeLevel
      ? (Where extends null ? L : NarrowLevel<L, NarrowKeys<Where>>) extends infer L2 extends ScopeLevel
        ? ProjectTargets<Ts, MkCtx<DB, [L2, ...Outer], Ctes, GroupBy extends null ? false : true>, [], 0, Lit> extends infer Cs
          ? Cs extends Cols
            ? CheckSimple<Distinct, Ts, Cs, Where, GroupBy, Having, Ws, Order, MkCtx<DB, [L, ...Outer], Ctes, GroupBy extends null ? false : true>, MkCtx<DB, [L2, ...Outer], Ctes, GroupBy extends null ? false : true>> extends infer R
              ? R extends AnyErr ? R : Cs
              : never
            : Cs
          : never
        : never
      : L
    : never;

type CheckSimple<
  Distinct, Ts extends readonly Target[], Cs extends Cols, Where extends Expr | null, GroupBy extends readonly Expr[] | null,
  Having extends Expr | null, Ws extends readonly NamedWindow[], Order extends readonly Expr[], C0 extends Ctx, C extends Ctx,
> =
  CheckCondition<"WHERE", Where, C0> extends infer W
    ? W extends AnyErr ? W
    : CheckCondition<"HAVING", Having, C> extends infer H
      ? H extends AnyErr ? H
      : ResolveSortKeys<Order, "ORDER BY", Ts, Cs, C> extends infer OK
        ? OK extends AnyErr ? OK
        : OK extends readonly unknown[]
          ? CheckGroupBy<GroupBy, Ts, Cs, C> extends infer G
            ? G extends AnyErr ? G
            : CheckDistinct<Distinct, OK, Ts, Cs, C> extends infer D
              ? D extends AnyErr ? D
              : CheckWindows<Ws, Ts, Order, C>
              : never
            : never
          : never
        : never
      : never
    : never;

type CheckDistinct<Distinct, OKeys extends readonly unknown[], Ts extends readonly Target[], Cs extends Cols, C extends Ctx> =
  Distinct extends readonly Expr[]
    ? ResolveSortKeys<Distinct, "DISTINCT ON", Ts, Cs, C> extends infer DK
      ? DK extends AnyErr ? DK
      : DK extends readonly unknown[] ? (OKeys extends readonly [] ? true : CheckDistinctOnOrder<DK, OKeys>) : never
      : never
  : Distinct extends true ? (OKeys extends readonly [] ? true : CheckDistinctOrder<OKeys, Ts, Cs>)
  : true;

type CheckWindows<Ws extends readonly NamedWindow[], Ts extends readonly Target[], Order extends readonly Expr[], C extends Ctx> =
  CheckWindowClause<Ws, C> extends infer Defs
    ? Defs extends WindowDefs
      ? CheckWindowRefs<TargetExprs<Ts>, Defs, C> extends infer R
        ? R extends AnyErr ? R : CheckWindowRefs<Order, Defs, C>
        : never
      : Defs
    : never;
type TargetExprs<Ts extends readonly Target[]> = { readonly [K in keyof Ts]: Ts[K]["e"] };

/** `(t).*` in a target list: the columns of a whole-row value (all nullable when the row is). */
type FieldStar<A> =
  A extends ColInfo
    ? A["type"] extends Shaped<"record", ObjShape<infer M extends ColMap>> ? (A["nullable"] extends true ? NullableMap<M> : M)
    : SqlError<"(e).* needs a whole-row value such as (t).*", null>
    : A;

/**
 * Targets → ordered columns, applying Postgres column naming. A `*` / `t.*` target is one
 * `{ star }` entry. `Lit`: an untyped string-literal target is typed `lit` (set operations).
 */
export type ProjectTargets<Ts extends readonly Target[], C extends Ctx, Acc extends Cols, I extends number = 0, Lit extends boolean = false> =
  Ts[I] extends undefined ? Acc
  : Ts[I]["e"] extends { readonly t: "star"; readonly tbl: infer Tbl extends string | null }
    ? ExpandStar<C["scope"], Tbl> extends infer M
      ? M extends ColMap ? ProjectTargets<Ts, C, [...Acc, { readonly star: M }], Nx<I>, Lit> : M
      : never
  : Ts[I]["e"] extends { readonly t: "field"; readonly name: "*" }
    ? FieldStar<TypeOf<Ts[I]["e"]["e"], C>> extends infer M
      ? M extends ColMap ? ProjectTargets<Ts, C, [...Acc, { readonly star: M }], Nx<I>, Lit> : M
      : never
    : (Lit extends true ? (Ts[I]["e"] extends { readonly t: "str" } ? Info<"lit"> : TypeOf<Ts[I]["e"], C>) : TypeOf<Ts[I]["e"], C>) extends infer Ty
      ? Ty extends ColInfo
        ? ColumnName<Ts[I]["e"], Ts[I]["alias"], C> extends infer N
          ? N extends string ? ProjectTargets<Ts, C, [...Acc, { readonly n: N; readonly t: Ty }], Nx<I>, Lit> : N
          : never
        : Ty
      : never;

