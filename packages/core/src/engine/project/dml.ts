import type { Table } from "../../schema/column.js";
import type { Cte, DeleteStmt, Expr, InsertSource, InsertStmt, OnConflict, SelectStmt, SetItem, TableRef, Target, UpdateStmt, WithClause } from "../ast.js";
import type { BindFrom } from "../binder/from.js";
import type { ResolveWritableTable, TableCols } from "../binder/resolve.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { ColInfo, ColMap, Cols, CteMap, Ctx, Info, Scope, ScopeItem, ScopeLevel, MkCtx } from "../types.js";
import type { AddParam, ParamsOfExpr, ParamsOfFromItems, ParamsOfOpt, ParamsOfSelect, ParamsOfTargets } from "../typer/params.js";
import type { TypeOf } from "../typer/typeof.js";
import type { BindWith, ProjectSelect, ProjectTargets } from "./select.js";

/**
 * DML projection and validation.
 *
 * `ProjectDml<S, DB, Outer, Ctes>` → `Cols` (RETURNING), `null` (no RETURNING) or `SqlError`.
 *
 * Checks performed (messages follow Postgres):
 *   - the target is a writable table (`relation "x" does not exist`, `cannot insert into view "v"`);
 *     CTE names are not DML targets, exactly as in Postgres;
 *   - INSERT column list: columns exist, VALUES rows / SELECT width match the column count
 *     (`INSERT has more expressions than target columns` / `... more target columns than
 *     expressions`, `VALUES lists must all be the same length`);
 *   - every NOT NULL column without a default is assigned
 *     (`null value in column "c" of relation "t" violates not-null constraint`), also for a
 *     literal `NULL` assigned to a NOT NULL column and `DEFAULT` assigned to one without a
 *     default; `DEFAULT` anywhere but a VALUES item or a SET value is
 *     `DEFAULT is not allowed in this context`;
 *   - SET columns exist (`column "c" of relation "t" does not exist`), multi-column SET
 *     sources have the right width;
 *   - every expression (VALUES, SET, WHERE, ON CONFLICT, RETURNING) is typed and the first
 *     error propagates.
 *
 * Scopes: VALUES sees only the outer scope; UPDATE SET / WHERE / RETURNING see the target
 * (by alias or name) plus the FROM items; DELETE likewise with USING; ON CONFLICT DO UPDATE
 * sees the target plus `excluded` (so an unqualified column present in both is ambiguous,
 * as in Postgres). `RETURNING *` expands every item of the level (target + FROM/USING).
 *
 * Without a column list, `INSERT INTO t VALUES (...)` assigns the first N columns *in
 * declaration order*. That order is not observable at the type level (TypeScript 7
 * orders `keyof` unions alphabetically), so in that case the width check is still done
 * but positional typing is skipped: `$n` is `unknown` and the required-column check is
 * not performed.
 */
export type ProjectDml<S extends InsertStmt | UpdateStmt | DeleteStmt, DB, Outer extends Scope, Ctes extends CteMap> =
  BindWith<S["with"], DB, Outer, Ctes> extends infer C2
    ? C2 extends CteMap
      ? S extends { readonly t: "insert" } ? ProjectInsert<Extract<S, InsertStmt>, DB, Outer, C2>
      : S extends { readonly t: "update" } ? ProjectUpdate<Extract<S, UpdateStmt>, DB, Outer, C2>
      : S extends { readonly t: "delete" } ? ProjectDelete<Extract<S, DeleteStmt>, DB, Outer, C2>
      : never
      : C2
    : never;

// ───────────────────────────── target table ─────────────────────────────

/** Resolved DML target: the raw table (with `hasDefault`) and its scope item. */
type Target_<Tbl extends Table, Item extends ScopeItem> = { readonly tbl: Tbl; readonly item: Item };

/** `Target_` or `SqlError`. `Verb` rewrites the generic view error into Postgres wording. */
type ResolveTarget<DB, Ref extends TableRef, Alias extends string | null, Verb extends string> =
  ResolveWritableTable<DB, Ref> extends infer R
    ? R extends Table ? Target_<R, { readonly alias: Alias extends string ? Alias : Ref["name"]; readonly cols: TableCols<R>; readonly skip: [] }>
    : R extends SqlError<`cannot modify view "${infer V}"`, null> ? SqlError<`cannot ${Verb} view "${V}"`, null>
    : R
    : never;

type DmlCtx<DB, Level extends ScopeLevel, Outer extends Scope, Ctes extends CteMap> = MkCtx<DB, [Level, ...Outer], Ctes, false>;

/** `{ type, nullable }` of a table column (without `hasDefault`), or `null` for an unknown name. */
type ColInfoOf<Tbl extends Table, Col extends string> =
  Col extends keyof Tbl ? { readonly type: Tbl[Col]["type"]; readonly nullable: Tbl[Col]["nullable"] } : null;

// ───────────────────────────── INSERT ─────────────────────────────

type ProjectInsert<S extends InsertStmt, DB, Outer extends Scope, Ctes extends CteMap> =
  ResolveTarget<DB, S["table"], S["alias"], "insert into"> extends infer Tg
    ? Tg extends Target_<infer Tbl extends Table, infer Item extends ScopeItem>
      ? InsertTargetCols<S["columns"], S["source"], Tbl, S["table"]["name"], DB, Outer, Ctes> extends infer Cs
        ? Cs extends readonly string[] | null
          ? CheckInsertSource<S["source"], Cs, Tbl, S["table"]["name"], DB, Outer, Ctes> extends infer Chk
            ? Chk extends AnyErr ? Chk
            : CheckRequired<Tbl, Cs, S["table"]["name"]> extends infer Rq
              ? Rq extends AnyErr ? Rq
              : CheckOnConflict<S["onConflict"], Tbl, Item, S["table"]["name"], DB, Outer, Ctes> extends infer Oc
                ? Oc extends AnyErr ? Oc : ProjectReturning<S["returning"], [Item], DB, Outer, Ctes>
                : never
              : never
            : never
          : Cs
        : never
      : Tg
    : never;

/**
 * The assigned columns: the explicit list (validated and width-checked against the
 * source), `[]` for `DEFAULT VALUES`, `null` when there is no list (positional order
 * unknown; only "more expressions than columns" is checked), or `SqlError`.
 */
type InsertTargetCols<Columns extends readonly string[] | null, Source extends InsertSource, Tbl extends Table, Name extends string, DB, Outer extends Scope, Ctes extends CteMap> =
  SourceWidth<Source, DB, Outer, Ctes> extends infer W
    ? W extends AnyErr ? W
    : Columns extends readonly string[]
      ? CheckColsExist<Columns, Tbl, Name> extends infer E
        ? E extends AnyErr ? E
        : W extends readonly unknown[] ? WidthResult<WidthCheck<W, Columns>, Columns> : Columns
        : never
      : W extends readonly [] ? []
      : W extends readonly unknown[] ? (WidthCheck<W, UnionToTuple<keyof Tbl>> extends "more" ? SqlError<"INSERT has more expressions than target columns", null> : null)
      : null
    : never;

type WidthResult<R, Ok_> =
  R extends "eq" ? Ok_
  : R extends "more" ? SqlError<"INSERT has more expressions than target columns", null>
  : SqlError<"INSERT has more target columns than expressions", null>;

/**
 * Width of the source as a tuple (the first VALUES row, the SELECT's columns, `[]` for
 * DEFAULT VALUES), `null` when unknown (a `*` in the SELECT), or `SqlError`.
 */
type SourceWidth<Source extends InsertSource, DB, Outer extends Scope, Ctes extends CteMap> =
  Source extends { readonly t: "values"; readonly rows: readonly [infer First extends readonly Expr[], ...infer Rest extends readonly (readonly Expr[])[]] }
    ? SameLength<Rest, First> extends true ? First : SqlError<"VALUES lists must all be the same length", null>
  : Source extends { readonly t: "select"; readonly q: infer Q extends SelectStmt }
    ? ProjectSelect<Q, DB, Outer, Ctes> extends infer C ? (C extends Cols ? (HasStar<C> extends true ? null : C) : C) : never
  : Source extends { readonly t: "default" } ? []
  : SqlError<"INSERT source must be VALUES, a query or DEFAULT VALUES", null>;

type SameLength<Rows extends readonly (readonly unknown[])[], Ref extends readonly unknown[]> =
  Rows extends readonly [infer R extends readonly unknown[], ...infer Rest extends readonly (readonly unknown[])[]]
    ? WidthCheck<R, Ref> extends "eq" ? SameLength<Rest, Ref> : false
    : true;

/** Compare two widths: `"eq"`, `"more"` (A longer), `"fewer"` (B longer). */
type WidthCheck<A extends readonly unknown[], B extends readonly unknown[]> =
  A extends readonly [unknown, ...infer AR]
    ? B extends readonly [unknown, ...infer BR] ? WidthCheck<AR, BR> : "more"
    : B extends readonly [unknown, ...unknown[]] ? "fewer" : "eq";

type HasStar<C extends Cols> = C[number] extends infer E ? ((E extends { readonly star: ColMap } ? true : false) extends false ? false : true) : false;

type CheckColsExist<Columns extends readonly string[], Tbl extends Table, Name extends string> =
  Columns extends readonly [infer C extends string, ...infer R extends readonly string[]]
    ? C extends keyof Tbl ? CheckColsExist<R, Tbl, Name> : SqlError<`column "${C}" of relation "${Name}" does not exist`, null>
    : true;

/** Type every VALUES row (outer scope only) and reject literal NULL in NOT NULL columns. */
type CheckInsertSource<Source extends InsertSource, Cs extends readonly string[] | null, Tbl extends Table, Name extends string, DB, Outer extends Scope, Ctes extends CteMap> =
  Source extends { readonly t: "values"; readonly rows: infer Rows extends readonly (readonly Expr[])[] }
    ? CheckRows<Rows, Cs, Tbl, Name, MkCtx<DB, Outer, Ctes, false>>
    : true;

type CheckRows<Rows extends readonly (readonly Expr[])[], Cs extends readonly string[] | null, Tbl extends Table, Name extends string, C extends Ctx> =
  Rows extends readonly [infer R extends readonly Expr[], ...infer Rest extends readonly (readonly Expr[])[]]
    ? CheckValueItems<R, C> extends infer Ts
      ? Ts extends true
        ? CheckNullLiterals<R, Cs extends readonly string[] ? Cs : [], Tbl, Name> extends infer N
          ? N extends AnyErr ? N : CheckRows<Rest, Cs, Tbl, Name, C>
          : never
        : Ts
      : never
    : true;

/** Type each item of a VALUES row or multi-column SET source; a bare `DEFAULT` is allowed there and skipped. */
type CheckValueItems<Es extends readonly Expr[], C extends Ctx> =
  Es extends readonly [infer E extends Expr, ...infer R extends readonly Expr[]]
    ? E extends { readonly t: "default" } ? CheckValueItems<R, C>
    : TypeOf<E, C> extends infer T ? (T extends ColInfo ? CheckValueItems<R, C> : T) : never
    : true;

type CheckNullLiterals<Es extends readonly Expr[], Cs extends readonly string[], Tbl extends Table, Name extends string> =
  Es extends readonly [infer E extends Expr, ...infer ER extends readonly Expr[]]
    ? Cs extends readonly [infer Col extends string, ...infer CR extends readonly string[]]
      ? E extends { readonly t: "null" }
        ? NotNullCol<Tbl, Col> extends true ? SqlError<`null value in column "${Col}" of relation "${Name}" violates not-null constraint`, null> : CheckNullLiterals<ER, CR, Tbl, Name>
        : E extends { readonly t: "default" }
          ? RequiredCol<Tbl, Col> extends true ? SqlError<`null value in column "${Col}" of relation "${Name}" violates not-null constraint`, null> : CheckNullLiterals<ER, CR, Tbl, Name>
        : CheckNullLiterals<ER, CR, Tbl, Name>
      : true
    : true;

type NotNullCol<Tbl extends Table, Col extends string> = Col extends keyof Tbl ? (Tbl[Col]["nullable"] extends false ? true : false) : false;
/** NOT NULL without a default: `DEFAULT` stores NULL there, which Postgres rejects. */
type RequiredCol<Tbl extends Table, Col extends string> = Col extends keyof Tbl ? (Tbl[Col] extends { readonly nullable: false; readonly hasDefault: false } ? true : false) : false;

/** Every NOT NULL column without a default must be in `Cs` (skipped when `Cs` is unknown). */
type CheckRequired<Tbl extends Table, Cs extends readonly string[] | null, Name extends string> =
  Cs extends readonly string[]
    ? [MissingRequired<Tbl, Cs[number]>] extends [never] ? true
    : SqlError<`null value in column "${FirstOf<MissingRequired<Tbl, Cs[number]>> & string}" of relation "${Name}" violates not-null constraint`, null>
    : true;

type MissingRequired<Tbl extends Table, Given extends string> =
  { [K in keyof Tbl]: K extends Given ? never : Tbl[K] extends { readonly nullable: false; readonly hasDefault: false } ? K : never }[keyof Tbl];

// ─── ON CONFLICT ───

type ExcludedItem<Tbl extends Table> = { readonly alias: "excluded"; readonly cols: TableCols<Tbl>; readonly skip: [] };

type CheckOnConflict<Oc extends OnConflict | null, Tbl extends Table, Item extends ScopeItem, Name extends string, DB, Outer extends Scope, Ctes extends CteMap> =
  Oc extends { readonly t: "update"; readonly set: infer Set extends readonly SetItem[]; readonly where: infer Where extends Expr | null }
    ? CheckSet<Set, Tbl, Name, DmlCtx<DB, [Item, ExcludedItem<Tbl>], Outer, Ctes>> extends infer R
      ? R extends AnyErr ? R : CheckOptExpr<Where, DmlCtx<DB, [Item, ExcludedItem<Tbl>], Outer, Ctes>>
      : never
    : true;

// ───────────────────────────── SET ─────────────────────────────

type CheckSet<Set extends readonly SetItem[], Tbl extends Table, Name extends string, C extends Ctx> =
  Set extends readonly [infer S extends SetItem, ...infer R extends readonly SetItem[]]
    ? CheckSetItem<S, Tbl, Name, C> extends infer X ? (X extends AnyErr ? X : CheckSet<R, Tbl, Name, C>) : never
    : true;

type CheckSetItem<S extends SetItem, Tbl extends Table, Name extends string, C extends Ctx> =
  S extends { readonly t: "set"; readonly col: infer Col extends string; readonly e: infer E extends Expr }
    ? Col extends keyof Tbl
      ? E extends { readonly t: "null" }
        ? NotNullCol<Tbl, Col> extends true ? SqlError<`null value in column "${Col}" of relation "${Name}" violates not-null constraint`, null> : true
        : E extends { readonly t: "default" }
          ? RequiredCol<Tbl, Col> extends true ? SqlError<`null value in column "${Col}" of relation "${Name}" violates not-null constraint`, null> : true
        : CheckExpr<E, C>
      : SqlError<`column "${Col}" of relation "${Name}" does not exist`, null>
  : S extends { readonly t: "setmulti"; readonly cols: infer Cols extends readonly string[]; readonly e: infer E extends Expr }
    ? CheckColsExist<Cols, Tbl, Name> extends infer X ? (X extends AnyErr ? X : CheckMultiSource<E, Cols, C>) : never
  : true;

/** `(a, b) = (e1, e2)` / `= (SELECT ...)` / `(a) = e`: width must match, expressions typed. */
type CheckMultiSource<E extends Expr, Cols_ extends readonly string[], C extends Ctx> =
  E extends { readonly t: "sub"; readonly q: infer Q extends SelectStmt }
    ? ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
      ? R extends Cols ? (HasStar<R> extends true ? true : WidthCheck<R, Cols_> extends "eq" ? true : SqlError<"number of columns does not match number of values", null>) : R
      : never
  : E extends { readonly t: "row"; readonly items: infer Items extends readonly Expr[] }
    ? WidthCheck<Items, Cols_> extends "eq" ? CheckValueItems<Items, C> : SqlError<"number of columns does not match number of values", null>
  : WidthCheck<[E], Cols_> extends "eq" ? CheckExpr<E, C> : SqlError<"number of columns does not match number of values", null>;

type CheckExpr<E extends Expr, C extends Ctx> = TypeOf<E, C> extends infer T ? (T extends ColInfo ? true : T) : never;
type CheckOptExpr<E extends Expr | null, C extends Ctx> = E extends Expr ? CheckExpr<E, C> : true;

// ───────────────────────────── UPDATE / DELETE ─────────────────────────────

type ProjectUpdate<S extends UpdateStmt, DB, Outer extends Scope, Ctes extends CteMap> =
  ResolveTarget<DB, S["table"], S["alias"], "update"> extends infer Tg
    ? Tg extends Target_<infer Tbl extends Table, infer Item extends ScopeItem>
      ? BindFrom<S["from"], DB, Outer, Ctes> extends infer L
        ? L extends ScopeLevel
          ? CheckSet<S["set"], Tbl, S["table"]["name"], DmlCtx<DB, [Item, ...L], Outer, Ctes>> extends infer R
            ? R extends AnyErr ? R
            : CheckOptExpr<S["where"], DmlCtx<DB, [Item, ...L], Outer, Ctes>> extends infer Wc
              ? Wc extends AnyErr ? Wc : ProjectReturning<S["returning"], [Item, ...L], DB, Outer, Ctes>
              : never
            : never
          : L
        : never
      : Tg
    : never;

type ProjectDelete<S extends DeleteStmt, DB, Outer extends Scope, Ctes extends CteMap> =
  ResolveTarget<DB, S["table"], S["alias"], "delete from"> extends infer Tg
    ? Tg extends Target_<Table, infer Item extends ScopeItem>
      ? BindFrom<S["using"], DB, Outer, Ctes> extends infer L
        ? L extends ScopeLevel
          ? CheckOptExpr<S["where"], DmlCtx<DB, [Item, ...L], Outer, Ctes>> extends infer Wc
            ? Wc extends AnyErr ? Wc : ProjectReturning<S["returning"], [Item, ...L], DB, Outer, Ctes>
            : never
          : L
        : never
      : Tg
    : never;

type ProjectReturning<Ret extends readonly Target[] | null, Level extends ScopeLevel, DB, Outer extends Scope, Ctes extends CteMap> =
  Ret extends readonly Target[] ? ProjectTargets<Ret, DmlCtx<DB, Level, Outer, Ctes>, []> : null;

// ───────────────────────────── helpers ─────────────────────────────

type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (u: infer I) => void ? I : never;
/** One member of a union (the last in TypeScript's internal order). */
type FirstOf<U> = UnionToIntersection<U extends unknown ? (x: U) => void : never> extends (x: infer L) => void ? L : never;
/** Union → tuple (order is TypeScript's, i.e. alphabetical for string literals; only the length is relied upon). */
type UnionToTuple<U, Acc extends readonly unknown[] = []> = [U] extends [never] ? Acc : UnionToTuple<Exclude<U, FirstOf<U>>, [FirstOf<U>, ...Acc]>;

// ───────────────────────────── parameters ─────────────────────────────

/**
 * Parameter typing for DML. `VALUES ($1)` and `SET c = $1` give the column's type with the
 * column's nullability (so `null` is accepted only for nullable columns); bare `$n` targets
 * of an `INSERT ... SELECT` are typed positionally from the target columns; everything else
 * (WHERE, FROM/USING, ON CONFLICT, RETURNING, sub-selects) goes through the expression pass
 * with a scope that contains the target table. Parameters inside WITH bodies are collected
 * too. Only reached for statements that already passed `ProjectDml`.
 */
export type ParamsOfDml<S extends InsertStmt | UpdateStmt | DeleteStmt, DB, Ctes extends CteMap, M> =
  BindWith<S["with"], DB, [], Ctes> extends infer C2
    ? C2 extends CteMap
      ? ParamsOfWith<S["with"], DB, C2, M> extends infer M1
        ? S extends { readonly t: "insert" } ? ParamsOfInsert<Extract<S, InsertStmt>, DB, C2, M1>
        : S extends { readonly t: "update" } ? ParamsOfUpdate<Extract<S, UpdateStmt>, DB, C2, M1>
        : S extends { readonly t: "delete" } ? ParamsOfDelete<Extract<S, DeleteStmt>, DB, C2, M1>
        : M1
        : never
      : M
    : never;

/** Parameters inside the bodies of a WITH clause (SELECT and DML CTEs). */
export type ParamsOfWith<W extends WithClause | null, DB, Ctes extends CteMap, M> =
  W extends WithClause ? ParamsOfCteList<W["ctes"], DB, Ctes, M> : M;
type ParamsOfCteList<Cs extends readonly Cte[], DB, Ctes extends CteMap, M> =
  Cs extends readonly [{ readonly q: infer Q }, ...infer R extends readonly Cte[]]
    ? ParamsOfCteList<R, DB, Ctes,
        Q extends SelectStmt ? ParamsOfSelect<Q, DB, [], Ctes, M>
        : Q extends InsertStmt | UpdateStmt | DeleteStmt ? ParamsOfDml<Q, DB, Ctes, M>
        : M>
    : M;

type ParamsOfInsert<S extends InsertStmt, DB, Ctes extends CteMap, M> =
  ResolveTarget<DB, S["table"], S["alias"], "insert into"> extends infer Tg
    ? Tg extends Target_<infer Tbl extends Table, infer Item extends ScopeItem>
      ? InsertTargetCols<S["columns"], S["source"], Tbl, S["table"]["name"], DB, [], Ctes> extends infer Cs
        ? ParamsOfReturning<S["returning"], [Item], DB, Ctes,
            ParamsOfOnConflict<S["onConflict"], Tbl, Item, DB, Ctes,
              ParamsOfInsertSource<S["source"], Cs extends readonly string[] ? Cs : [], Tbl, DB, Ctes, M>>>
        : never
      : M
    : never;

type ParamsOfInsertSource<Source extends InsertSource, Cs extends readonly string[], Tbl extends Table, DB, Ctes extends CteMap, M> =
  Source extends { readonly t: "values"; readonly rows: infer Rows extends readonly (readonly Expr[])[] }
    ? ParamsOfRows<Rows, Cs, Tbl, MkCtx<DB, [], Ctes, false>, M>
  : Source extends { readonly t: "select"; readonly q: infer Q extends SelectStmt }
    ? ParamsOfSelectTargets<Q, Cs, Tbl, ParamsOfSelect<Q, DB, [], Ctes, M>>
  : M;

type ParamsOfRows<Rows extends readonly (readonly Expr[])[], Cs extends readonly string[], Tbl extends Table, C extends Ctx, M> =
  Rows extends readonly [infer R extends readonly Expr[], ...infer Rest extends readonly (readonly Expr[])[]]
    ? ParamsOfRows<Rest, Cs, Tbl, C, ParamsOfRowCols<R, Cs, Tbl, C, M>>
    : M;

/** Zip expressions with target columns: a bare `$n` takes the column's type, anything else recurses. */
type ParamsOfRowCols<Es extends readonly Expr[], Cs extends readonly string[], Tbl extends Table, C extends Ctx, M> =
  Es extends readonly [infer E extends Expr, ...infer ER extends readonly Expr[]]
    ? Cs extends readonly [infer Col extends string, ...infer CR extends readonly string[]]
      ? ParamsOfRowCols<ER, CR, Tbl, C, ParamsOfOpt<E, C, M, ColInfoOf<Tbl, Col>>>
      : ParamsOfRowCols<ER, [], Tbl, C, ParamsOfExpr<E, C, M>>
    : M;

/** `INSERT INTO t (a, b) SELECT $1, $2`: bare parameter targets take the target column types. */
type ParamsOfSelectTargets<Q extends SelectStmt, Cs extends readonly string[], Tbl extends Table, M> =
  Q["body"] extends { readonly t: "simple"; readonly targets: infer Ts extends readonly Target[] } ? ParamsOfTargetCols<Ts, Cs, Tbl, M> : M;
type ParamsOfTargetCols<Ts extends readonly Target[], Cs extends readonly string[], Tbl extends Table, M> =
  Ts extends readonly [infer T extends Target, ...infer TR extends readonly Target[]]
    ? Cs extends readonly [infer Col extends string, ...infer CR extends readonly string[]]
      ? ParamsOfTargetCols<TR, CR, Tbl, T["e"] extends { readonly t: "param"; readonly n: infer N extends number } ? (ColInfoOf<Tbl, Col> extends infer CI ? (CI extends ColInfo ? AddParam<M, N, CI> : M) : never) : M>
      : M
    : M;

type ParamsOfOnConflict<Oc extends OnConflict | null, Tbl extends Table, Item extends ScopeItem, DB, Ctes extends CteMap, M> =
  Oc extends { readonly t: "update"; readonly set: infer Set extends readonly SetItem[]; readonly where: infer Where extends Expr | null }
    ? ParamsOfOpt<Where, DmlCtx<DB, [Item, ExcludedItem<Tbl>], [], Ctes>, ParamsOfSet<Set, Tbl, DmlCtx<DB, [Item, ExcludedItem<Tbl>], [], Ctes>, M>, Info<"bool">>
    : M;

type ParamsOfSet<Set extends readonly SetItem[], Tbl extends Table, C extends Ctx, M> =
  Set extends readonly [infer S extends SetItem, ...infer R extends readonly SetItem[]]
    ? ParamsOfSet<R, Tbl, C,
        S extends { readonly t: "set"; readonly col: infer Col extends string; readonly e: infer E extends Expr } ? ParamsOfOpt<E, C, M, ColInfoOf<Tbl, Col>>
        : S extends { readonly t: "setmulti"; readonly cols: infer Cols_ extends readonly string[]; readonly e: infer E extends Expr }
          ? E extends { readonly t: "row"; readonly items: infer Items extends readonly Expr[] } ? ParamsOfRowCols<Items, Cols_, Tbl, C, M> : ParamsOfExpr<E, C, M>
        : M>
    : M;

type ParamsOfReturning<Ret extends readonly Target[] | null, Level extends ScopeLevel, DB, Ctes extends CteMap, M> =
  Ret extends readonly Target[] ? ParamsOfTargets<Ret, DmlCtx<DB, Level, [], Ctes>, M> : M;

type ParamsOfUpdate<S extends UpdateStmt, DB, Ctes extends CteMap, M> =
  ResolveTarget<DB, S["table"], S["alias"], "update"> extends infer Tg
    ? Tg extends Target_<infer Tbl extends Table, infer Item extends ScopeItem>
      ? BindFrom<S["from"], DB, [], Ctes> extends infer L
        ? L extends ScopeLevel
          ? ParamsOfReturning<S["returning"], [Item, ...L], DB, Ctes,
              ParamsOfOpt<S["where"], DmlCtx<DB, [Item, ...L], [], Ctes>,
                ParamsOfSet<S["set"], Tbl, DmlCtx<DB, [Item, ...L], [], Ctes>,
                  ParamsOfFromItems<S["from"], DmlCtx<DB, [Item, ...L], [], Ctes>, M>>, Info<"bool">>>
          : M
        : never
      : M
    : never;

type ParamsOfDelete<S extends DeleteStmt, DB, Ctes extends CteMap, M> =
  ResolveTarget<DB, S["table"], S["alias"], "delete from"> extends infer Tg
    ? Tg extends Target_<Table, infer Item extends ScopeItem>
      ? BindFrom<S["using"], DB, [], Ctes> extends infer L
        ? L extends ScopeLevel
          ? ParamsOfReturning<S["returning"], [Item, ...L], DB, Ctes,
              ParamsOfOpt<S["where"], DmlCtx<DB, [Item, ...L], [], Ctes>,
                ParamsOfFromItems<S["using"], DmlCtx<DB, [Item, ...L], [], Ctes>, M>, Info<"bool">>>
          : M
        : never
      : M
    : never;
