import type { Expr, FromItem, InsertSource, OnConflict, SelectStmt, SetItem, TableRef, Target, WithClause } from "../ast.js";
import type { OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseExpr, SkipOrderTail } from "./expr.js";
import type { IsSelectStart, ParseFromList, ParseFromOpt, ParseSelectStmt, ParseTargetList, ParseValues, ParseWhereOpt, RefOf } from "./select.js";
import type { ColIdIdent, EatOp, EatWord, EatWords, Expected, Fail, Ident, Nx, Ok, ParenIdentList, QualName, SkipWord } from "./util.js";

/**
 * DML parsers (index-based, see util.ts). Each receives the token tuple, the index
 * *after* the leading keyword (`INSERT` / `UPDATE` / `DELETE`) and the already-parsed
 * WITH clause (or null). Result: `Ok<InsertStmt | UpdateStmt | DeleteStmt, next>` or an
 * `SqlError` positioned at the offending token.
 *
 * Grammar covered:
 *
 *   INSERT INTO [ONLY] table [AS alias] [(col, ...)] [OVERRIDING {SYSTEM|USER} VALUE]
 *     { VALUES (...), ... | select | DEFAULT VALUES }
 *     [ON CONFLICT [(index_params) [WHERE pred] | ON CONSTRAINT name] DO { NOTHING | UPDATE SET ... [WHERE ...] }]
 *     [RETURNING target_list]
 *   UPDATE [ONLY] table [AS alias] SET { col = expr | col = DEFAULT | (a, b) = (e1, e2) | (a, b) = (select) } [, ...]
 *     [FROM from_list] [WHERE cond] [RETURNING target_list]
 *   DELETE FROM [ONLY] table [AS alias] [USING from_list] [WHERE cond] [RETURNING target_list]
 *
 * Not supported (explicit errors): `WHERE CURRENT OF cursor`, `DEFAULT VALUES` together
 * with a column list, indirection in SET targets (`col[1] = …`, `col.field = …`).
 * The ON CONFLICT conflict target (index columns, predicate, constraint name) is parsed
 * for syntax and discarded: the AST carries no field for it.
 */

// ───────────────────────────── INSERT ─────────────────────────────

export type ParseInsert<T extends Toks, I extends number, W extends WithClause | null> =
  EatWord<T, I, "into"> extends never ? Expected<"INTO", T, I>
  : ParseDmlTarget<T, EatWord<T, I, "into">, "values" | "overriding"> extends infer Tg
    ? Tg extends Ok<[infer Ref extends TableRef, infer Alias extends string | null], infer I1 extends number>
      ? ParseInsertColumns<T, I1> extends infer Cl
        ? Cl extends Ok<infer Cols extends readonly string[] | null, infer I2 extends number>
          ? ParseOverriding<T, I2> extends infer Ov
            ? Ov extends Ok<unknown, infer I3 extends number>
              ? ParseInsertSource<T, I3, Cols extends null ? false : true> extends infer Src
                ? Src extends Ok<infer Source extends InsertSource, infer I4 extends number>
                  ? ParseOnConflictOpt<T, I4> extends infer Oc
                    ? Oc extends Ok<infer Conf extends OnConflict | null, infer I5 extends number>
                      ? ParseReturningOpt<T, I5> extends infer Rt
                        ? Rt extends Ok<infer Ret extends readonly Target[] | null, infer I6 extends number>
                          ? Ok<{ t: "insert"; with: W; table: Ref; alias: Alias; columns: Cols; source: Source; onConflict: Conf; returning: Ret }, I6>
                          : Rt
                        : never
                      : Oc
                    : never
                  : Src
                : never
              : Ov
            : never
          : Cl
        : never
      : Tg
    : never;

/** `(col, ...)` unless the parenthesis opens a sub-select (`INSERT INTO t (SELECT ...)`). */
type ParseInsertColumns<T extends Toks, I extends number> =
  T[I] extends OpTok<"("> ? (IsSelectStart<T, Nx<I>> extends true ? Ok<null, I> : ParenIdentList<T, I>) : Ok<null, I>;

/** `OVERRIDING {SYSTEM | USER} VALUE` (accepted and ignored). */
type ParseOverriding<T extends Toks, I extends number> =
  EatWord<T, I, "overriding"> extends never ? Ok<null, I>
  : EatWord<T, EatWord<T, I, "overriding">, "system" | "user"> extends never ? Expected<"SYSTEM or USER", T, EatWord<T, I, "overriding">>
  : EatWord<T, EatWord<T, EatWord<T, I, "overriding">, "system" | "user">, "value"> extends never ? Expected<"VALUE", T, EatWord<T, EatWord<T, I, "overriding">, "system" | "user">>
  : Ok<null, EatWord<T, EatWord<T, EatWord<T, I, "overriding">, "system" | "user">, "value">>;

type ParseInsertSource<T extends Toks, I extends number, HasCols extends boolean> =
  T[I] extends WordTok<"values"> ? ParseValues<T, Nx<I>>
  : T[I] extends WordTok<"default">
    ? HasCols extends true ? Fail<"syntax error at or near default: DEFAULT VALUES cannot be combined with a column list", I>
    : EatWord<T, Nx<I>, "values"> extends never ? Expected<"VALUES", T, Nx<I>> : Ok<{ t: "default" }, EatWord<T, Nx<I>, "values">>
  : IsSelectStart<T, I> extends true
    ? ParseSelectStmt<T, I> extends infer X
      ? X extends Ok<infer Q extends SelectStmt, infer J extends number> ? Ok<{ t: "select"; q: Q }, J> : X
      : never
  : Expected<"VALUES, SELECT or DEFAULT VALUES", T, I>;

// ─── ON CONFLICT ───

type ParseOnConflictOpt<T extends Toks, I extends number> =
  EatWords<T, I, ["on", "conflict"]> extends never ? Ok<null, I>
  : ParseConflictTarget<T, EatWords<T, I, ["on", "conflict"]>> extends infer X
    ? X extends Ok<unknown, infer J extends number> ? ParseConflictAction<T, J> : X
    : never;

/** `(index_params) [WHERE predicate]` | `ON CONSTRAINT name` | nothing. Parsed and discarded. */
type ParseConflictTarget<T extends Toks, I extends number> =
  T[I] extends OpTok<"(">
    ? ParseIndexParams<T, Nx<I>> extends infer X
      ? X extends Ok<unknown, infer J extends number>
        ? EatWord<T, J, "where"> extends never ? Ok<null, J>
        : ParseExpr<T, EatWord<T, J, "where">, 0> extends infer P
          ? P extends Ok<unknown, infer J2 extends number> ? Ok<null, J2> : P
          : never
        : X
      : never
  : EatWords<T, I, ["on", "constraint"]> extends never ? Ok<null, I>
  : Ident<T, EatWords<T, I, ["on", "constraint"]>> extends [string, infer J extends number] ? Ok<null, J>
  : Expected<"constraint name", T, EatWords<T, I, ["on", "constraint"]>>;

/** `expr [opclass] [ASC|DESC] [NULLS FIRST|LAST], ...)` — `I` is just inside the paren. */
type ParseIndexParams<T extends Toks, I extends number> =
  ParseExpr<T, I, 0> extends infer X
    ? X extends Ok<unknown, infer J extends number>
      ? SkipOrderTail<T, SkipOpClass<T, J>> extends infer J2 extends number
        ? EatOp<T, J2, ","> extends never
          ? EatOp<T, J2, ")"> extends never ? Expected<'"," or ")"', T, J2> : Ok<null, EatOp<T, J2, ")">>
          : ParseIndexParams<T, EatOp<T, J2, ",">>
        : never
      : X
    : never;
type SkipOpClass<T extends Toks, I extends number> =
  T[I] extends WordTok<"asc" | "desc" | "nulls" | "where"> ? I : ColIdIdent<T, I> extends [string, infer J extends number] ? J : I;

type ParseConflictAction<T extends Toks, I extends number> =
  EatWord<T, I, "do"> extends never ? Expected<"DO", T, I>
  : EatWord<T, EatWord<T, I, "do">, "nothing"> extends never
    ? EatWords<T, EatWord<T, I, "do">, ["update", "set"]> extends never ? Expected<"NOTHING or UPDATE SET", T, EatWord<T, I, "do">>
    : ParseSetList<T, EatWords<T, EatWord<T, I, "do">, ["update", "set"]>, []> extends infer X
      ? X extends Ok<infer Set extends readonly SetItem[], infer J extends number>
        ? ParseWhereOpt<T, J> extends infer Wh
          ? Wh extends Ok<infer Where extends Expr | null, infer J2 extends number> ? Ok<{ t: "update"; set: Set; where: Where }, J2> : Wh
          : never
        : X
      : never
    : Ok<{ t: "nothing" }, EatWord<T, EatWord<T, I, "do">, "nothing">>;

// ───────────────────────────── UPDATE ─────────────────────────────

export type ParseUpdate<T extends Toks, I extends number, W extends WithClause | null> =
  ParseDmlTarget<T, I, "set"> extends infer Tg
    ? Tg extends Ok<[infer Ref extends TableRef, infer Alias extends string | null], infer I1 extends number>
      ? EatWord<T, I1, "set"> extends never ? Expected<"SET", T, I1>
      : ParseSetList<T, EatWord<T, I1, "set">, []> extends infer St
        ? St extends Ok<infer Set extends readonly SetItem[], infer I2 extends number>
          ? ParseFromOpt<T, I2> extends infer Fr
            ? Fr extends Ok<infer From extends readonly FromItem[], infer I3 extends number>
              ? ParseDmlWhere<T, I3> extends infer Wh
                ? Wh extends Ok<infer Where extends Expr | null, infer I4 extends number>
                  ? ParseReturningOpt<T, I4> extends infer Rt
                    ? Rt extends Ok<infer Ret extends readonly Target[] | null, infer I5 extends number>
                      ? Ok<{ t: "update"; with: W; table: Ref; alias: Alias; set: Set; from: From; where: Where; returning: Ret }, I5>
                      : Rt
                    : never
                  : Wh
                : never
              : Fr
            : never
          : St
        : never
      : Tg
    : never;

/** `item [, item ...]` after `SET`. */
type ParseSetList<T extends Toks, I extends number, Acc extends readonly SetItem[]> =
  ParseSetItem<T, I> extends infer X
    ? X extends Ok<infer Item extends SetItem, infer J extends number>
      ? EatOp<T, J, ","> extends never ? Ok<[...Acc, Item], J> : ParseSetList<T, EatOp<T, J, ",">, [...Acc, Item]>
      : X
    : never;

/** `col = expr` (expr may be `DEFAULT`) or `(a, b) = (e1, e2) | (select)`. */
type ParseSetItem<T extends Toks, I extends number> =
  T[I] extends OpTok<"(">
    ? ParenIdentList<T, I> extends infer L
      ? L extends Ok<infer Cols extends readonly string[], infer J extends number>
        ? EatOp<T, J, "="> extends never ? Expected<'"="', T, J>
        : ParseExpr<T, EatOp<T, J, "=">, 0> extends infer X
          ? X extends Ok<infer E extends Expr, infer J2 extends number> ? Ok<{ t: "setmulti"; cols: Cols; e: E }, J2> : X
          : never
        : L
      : never
  : Ident<T, I> extends [infer Col extends string, infer J extends number]
    ? EatOp<T, J, "="> extends never
      ? T[J] extends OpTok<"[" | "."> ? Fail<"subscripted or field assignment targets (col[i] = ..., col.f = ...) are not supported", J>
      : Expected<'"="', T, J>
    : ParseExpr<T, EatOp<T, J, "=">, 0> extends infer X
      ? X extends Ok<infer E extends Expr, infer J2 extends number> ? Ok<{ t: "set"; col: Col; e: E }, J2> : X
      : never
  : Expected<"column name", T, I>;

// ───────────────────────────── DELETE ─────────────────────────────

export type ParseDelete<T extends Toks, I extends number, W extends WithClause | null> =
  EatWord<T, I, "from"> extends never ? Expected<"FROM", T, I>
  : ParseDmlTarget<T, EatWord<T, I, "from">, never> extends infer Tg
    ? Tg extends Ok<[infer Ref extends TableRef, infer Alias extends string | null], infer I1 extends number>
      ? ParseUsingOpt<T, I1> extends infer Us
        ? Us extends Ok<infer Using extends readonly FromItem[], infer I2 extends number>
          ? ParseDmlWhere<T, I2> extends infer Wh
            ? Wh extends Ok<infer Where extends Expr | null, infer I3 extends number>
              ? ParseReturningOpt<T, I3> extends infer Rt
                ? Rt extends Ok<infer Ret extends readonly Target[] | null, infer I4 extends number>
                  ? Ok<{ t: "delete"; with: W; table: Ref; alias: Alias; using: Using; where: Where; returning: Ret }, I4>
                  : Rt
                : never
              : Wh
            : never
          : Us
        : never
      : Tg
    : never;

type ParseUsingOpt<T extends Toks, I extends number> =
  EatWord<T, I, "using"> extends never ? Ok<[], I> : ParseFromList<T, EatWord<T, I, "using">, []>;

// ───────────────────────────── shared ─────────────────────────────

/**
 * `[ONLY] qualified_name [AS alias | alias]` → `Ok<[ref, alias], next>`.
 * `Stop` lists unreserved words that follow the table name in this statement and must
 * not be taken as a bare alias (`UPDATE t SET`, `INSERT INTO t VALUES`).
 */
type ParseDmlTarget<T extends Toks, I extends number, Stop extends string> =
  QualName<T, SkipWord<T, I, "only">> extends [infer Parts extends readonly string[], infer J extends number]
    ? ParseDmlAlias<T, J, Stop> extends infer A
      ? A extends Ok<infer Alias extends string | null, infer J2 extends number> ? Ok<[RefOf<Parts>, Alias], J2> : A
      : never
    : Expected<"table name", T, SkipWord<T, I, "only">>;

type ParseDmlAlias<T extends Toks, I extends number, Stop extends string> =
  T[I] extends WordTok<"as">
    ? Ident<T, Nx<I>> extends [infer A extends string, infer J extends number] ? Ok<A, J> : Expected<"alias", T, Nx<I>>
  : ColIdIdent<T, I> extends [infer A extends string, infer J extends number] ? (A extends Stop ? Ok<null, I> : Ok<A, J>)
  : Ok<null, I>;

/** `WHERE cond`; `WHERE CURRENT OF cursor` is rejected explicitly. */
type ParseDmlWhere<T extends Toks, I extends number> =
  EatWords<T, I, ["where", "current", "of"]> extends never ? ParseWhereOpt<T, I> : Fail<"WHERE CURRENT OF cursor is not supported", EatWord<T, I, "where">>;

type ParseReturningOpt<T extends Toks, I extends number> =
  EatWord<T, I, "returning"> extends never ? Ok<null, I> : ParseTargetList<T, EatWord<T, I, "returning">, []>;
