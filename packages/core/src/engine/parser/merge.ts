import type { Expr, MergeAction, MergeWhen, ReturningOpt, SetItem, TableRef, Target, TargetInd, WithClause } from "../ast.js";
import type { OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseDmlTarget, ParseOverriding, ParseReturningOpt, ParseSetList, ParenTargetList } from "./dml.js";
import type { ParseExpr, ParseExprList } from "./expr.js";
import type { ParseFromItem } from "./select.js";
import type { EatOp, EatWord, EatWords, Expected, Nx, Ok } from "./util.js";

/**
 * MERGE (PostgreSQL 15+, with PostgreSQL 17's BY SOURCE / BY TARGET and RETURNING). `I` is the
 * index after `MERGE`; `W` the already-parsed WITH clause or null.
 *
 *   MERGE INTO [ONLY] target [*] [[AS] alias]
 *     USING from_item ON cond
 *     when_clause [...]
 *     [RETURNING [WITH ({OLD | NEW} AS alias, ...)] target_list]
 *
 *   when_clause =
 *       WHEN MATCHED [AND cond] THEN { UPDATE SET ... | DELETE | DO NOTHING }
 *     | WHEN NOT MATCHED BY SOURCE [AND cond] THEN { UPDATE SET ... | DELETE | DO NOTHING }
 *     | WHEN NOT MATCHED [BY TARGET] [AND cond] THEN
 *         { INSERT [(target, ...)] [OVERRIDING {SYSTEM | USER} VALUE] VALUES (expr, ...) | INSERT DEFAULT VALUES | DO NOTHING }
 *
 * `from_item` is any FROM item, joins included (`USING a JOIN b ON … ON cond`).
 */
export type ParseMerge<T extends Toks, I extends number, W extends WithClause | null> =
  EatWord<T, I, "into"> extends never ? Expected<"INTO", T, I>
  : ParseDmlTarget<T, EatWord<T, I, "into">, never, true> extends infer Tg
    ? Tg extends Ok<[infer Ref extends TableRef, infer Alias extends string | null], infer I1 extends number>
      ? EatWord<T, I1, "using"> extends never ? Expected<"USING", T, I1>
      : ParseFromItem<T, EatWord<T, I1, "using">> extends infer Src
        ? Src extends Ok<infer Source, infer I2 extends number>
          ? EatWord<T, I2, "on"> extends never ? Expected<"ON", T, I2>
          : ParseExpr<T, EatWord<T, I2, "on">, 0> extends infer On
            ? On extends Ok<infer Cond extends Expr, infer I3 extends number>
              ? T[I3] extends WordTok<"when">
                ? ParseWhens<T, I3, []> extends infer Ws
                  ? Ws extends Ok<infer Whens extends readonly MergeWhen[], infer I4 extends number>
                    ? ParseReturningOpt<T, I4> extends infer Rt
                      ? Rt extends Ok<[infer Ret extends readonly Target[] | null, infer Opts extends readonly ReturningOpt[]], infer I5 extends number>
                        ? Ok<{ t: "merge"; with: W; table: Ref; alias: Alias; source: Source; on: Cond; whens: Whens; returning: Ret; retOpts: Opts }, I5>
                        : Rt
                      : never
                    : Ws
                  : never
                : Expected<"WHEN", T, I3>
              : On
            : never
          : Src
        : never
      : Tg
    : never;

/** `WHEN ... THEN action` repeated while the next token is `WHEN`. */
type ParseWhens<T extends Toks, I extends number, Acc extends readonly MergeWhen[]> =
  T[I] extends WordTok<"when">
    ? ParseWhen<T, Nx<I>> extends infer X
      ? X extends Ok<infer When extends MergeWhen, infer J extends number> ? ParseWhens<T, J, [...Acc, When]> : X
      : never
    : Ok<Acc, I>;

/** After `WHEN`. */
type ParseWhen<T extends Toks, I extends number> =
  EatWord<T, I, "matched"> extends never
    ? EatWords<T, I, ["not", "matched"]> extends never ? Expected<"MATCHED or NOT MATCHED", T, I>
    : EatWords<T, EatWords<T, I, ["not", "matched"]>, ["by", "source"]> extends never
      ? ParseWhenCond<T, SkipByTarget<T, EatWords<T, I, ["not", "matched"]>>, "target">
      : ParseWhenCond<T, EatWords<T, EatWords<T, I, ["not", "matched"]>, ["by", "source"]>, "source">
    : ParseWhenCond<T, EatWord<T, I, "matched">, "matched">;
type SkipByTarget<T extends Toks, I extends number> = EatWords<T, I, ["by", "target"]> extends never ? I : EatWords<T, I, ["by", "target"]>;

/** `[AND cond] THEN action` */
type ParseWhenCond<T extends Toks, I extends number, M extends MergeWhen["match"]> =
  EatWord<T, I, "and"> extends never ? ParseThen<T, I, M, null>
  : ParseExpr<T, EatWord<T, I, "and">, 0> extends infer X
    ? X extends Ok<infer Cond extends Expr, infer J extends number> ? ParseThen<T, J, M, Cond> : X
    : never;

type ParseThen<T extends Toks, I extends number, M extends MergeWhen["match"], Cond extends Expr | null> =
  EatWord<T, I, "then"> extends never ? Expected<"THEN", T, I>
  : ParseAction<T, EatWord<T, I, "then">, M> extends infer X
    ? X extends Ok<infer A extends MergeAction, infer J extends number> ? Ok<{ match: M; cond: Cond; action: A }, J> : X
    : never;

/** UPDATE / DELETE for MATCHED and NOT MATCHED BY SOURCE, INSERT for NOT MATCHED [BY TARGET], DO NOTHING for all. */
type ParseAction<T extends Toks, I extends number, M extends MergeWhen["match"]> =
  EatWords<T, I, ["do", "nothing"]> extends never
    ? M extends "target"
      ? EatWord<T, I, "insert"> extends never ? Expected<"INSERT or DO NOTHING", T, I> : ParseMergeInsert<T, EatWord<T, I, "insert">>
      : EatWord<T, I, "delete"> extends never
        ? EatWords<T, I, ["update", "set"]> extends never ? Expected<"UPDATE, DELETE or DO NOTHING", T, I>
        : ParseSetList<T, EatWords<T, I, ["update", "set"]>, []> extends infer X
          ? X extends Ok<infer Set extends readonly SetItem[], infer J extends number> ? Ok<{ t: "update"; set: Set }, J> : X
          : never
        : Ok<{ t: "delete" }, EatWord<T, I, "delete">>
    : Ok<{ t: "nothing" }, EatWords<T, I, ["do", "nothing"]>>;

/** After `INSERT`: `DEFAULT VALUES` | `[(targets)] [OVERRIDING … VALUE] VALUES (exprs)`. */
type ParseMergeInsert<T extends Toks, I extends number> =
  EatWords<T, I, ["default", "values"]> extends never
    ? (T[I] extends OpTok<"("> ? ParenTargetList<T, I> : Ok<[null, null], I>) extends infer Cl
      ? Cl extends Ok<[infer Cols extends readonly string[] | null, infer Ind extends readonly TargetInd[] | null], infer J extends number>
        ? ParseOverriding<T, J> extends infer Ov
          ? Ov extends Ok<unknown, infer J2 extends number>
            ? EatWord<T, J2, "values"> extends never ? Expected<"VALUES", T, J2>
            : EatOp<T, EatWord<T, J2, "values">, "("> extends never ? Expected<'"("', T, EatWord<T, J2, "values">>
            : ParseExprList<T, EatOp<T, EatWord<T, J2, "values">, "(">, []> extends infer X
              ? X extends Ok<infer Vals extends readonly Expr[], infer J3 extends number>
                ? EatOp<T, J3, ")"> extends never ? Expected<'")"', T, J3>
                : Ok<{ t: "insert"; columns: Cols; colInd: Ind; values: Vals }, EatOp<T, J3, ")">>
                : X
              : never
            : Ov
          : never
        : Cl
      : never
    : Ok<{ t: "insert"; columns: null; colInd: null; values: null }, EatWords<T, I, ["default", "values"]>>;
