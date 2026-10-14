import type { DeleteStmt, InsertStmt, SelectStmt, Stmt, UpdateStmt } from "./ast.js";
import type { AnyErr, ErrAt, ErrMsg, SqlError } from "./errors.js";
import type { Lex } from "./lexer/lex.js";
import type { Toks } from "./lexer/tokens.js";
import type { Nx } from "./parser/util.js";
import type { ParseProgram } from "./parser/stmt.js";
import type { ProjectStmt } from "./project/stmt.js";
import type { ParamsOfDml } from "./project/dml.js";
import type { Cols, ColsToMap, Simplify } from "./types.js";
import type { MaxParam, ParamMap, ParamsOfSelect, ParamsToMap } from "./typer/params.js";
import type { TsOf } from "../type-map/index.js";
import type { ApplyDdlAll } from "./ddl/apply.js";
import type { NamedParams, RewriteNamed } from "./named.js";
import type { WithHint } from "./suggest.js";

/**
 * Full pipeline for one statement. Cached by TypeScript per `(DB, Q)`, so the three
 * public projections (`RowOf`, `ParamsOf`, `Validate`) share one evaluation.
 *
 * Result: `{ kind, cols, params, max, names, stmt }` or `SqlError<Message, TokenIndex>`.
 * `names` lists `:name` parameters in order of first appearance (`[]` for `$n` statements).
 */
export type Analyze<DB, Q extends string> =
  Lex<Q> extends infer T0
    ? T0 extends Toks
      ? RewriteNamed<T0> extends infer RN
        ? RN extends [infer T extends Toks, infer Names extends readonly string[]]
          ? ParseProgram<T> extends infer S
            ? S extends Stmt
              ? ProjectStmt<S, DB, [], {}> extends infer C
                ? C extends Cols | null
                  ? {
                      readonly kind: S["t"];
                      readonly cols: C;
                      // the parameter pass re-types expressions; skip it when there are no `$n`
                      readonly params: MaxParam<T> extends 0 ? {} : ParamsToMap<ParamsOfStmt<S, DB>>;
                      readonly max: MaxParam<T>;
                      readonly names: Names;
                      readonly stmt: S;
                    }
                  : Reposition<C, T, DB>
                : never
              : Reposition<S, T, DB>
            : never
          : RN
        : never
      : T0
    : never;

type ParamsOfStmt<S extends Stmt, DB> =
  S extends SelectStmt ? ParamsOfSelect<S, DB, [], {}, never>
  : S extends InsertStmt | UpdateStmt | DeleteStmt ? ParamsOfDml<S, DB, {}, never>
  : never;

/**
 * Error positions are token indexes. Parser errors already carry the index of the
 * offending token. Semantic errors carry `null` and name the offending identifier in
 * the message (`column "nme" …`, `column u.nme …`, `relation "x" …`, `table "x"`); the
 * first occurrence of that identifier in the token stream is used. Unknown columns and
 * relations get a "Perhaps you meant …" hint when a close name exists (see suggest.ts).
 */
type Reposition<E, T extends Toks, DB = never> =
  E extends SqlError<infer M extends string, infer At>
    ? At extends null ? SqlError<WithHint<M, T, DB>, LocateIdent<M, T>> : SqlError<M, At>
    : E;

/**
 * Token index for a semantic error: the first quoted name in the message that occurs in the
 * statement (`null value in column "email" of relation "users"` → `users` when `email` is
 * absent), then `column t.c` forms, then the keyword of `each UNION query …` and
 * `UNION|CASE|VALUES|COALESCE types … cannot be matched`.
 */
type LocateIdent<M extends string, T extends Toks> =
  M extends `column ${string}.${infer Name} ${string}` ? FindTokOr<T, Name, LocateQuoted<M, T>>
  : M extends `each ${infer Op} query ${string}` ? FindTokOr<T, Lowercase<Op>, 0>
  : M extends `${infer Op} types ${string} cannot be matched` ? (Op extends `${string} ${string}` ? LocateQuoted<M, T> : FindTokOr<T, Lowercase<Op>, 0>)
  : LocateQuoted<M, T>;
type LocateQuoted<M extends string, T extends Toks> =
  M extends `${string}"${infer Name}"${infer Rest}` ? FindTokOr<T, Name, LocateQuoted<Rest, T>> : 0;
type FindTokOr<T extends Toks, Name extends string, Else extends number> = FindTok<T, Name, 0> extends infer I extends number ? (I extends -1 ? Else : I) : Else;
type FindTok<T extends Toks, Name extends string, I extends number> =
  T[I] extends { readonly k: string }
    ? IsTok<T, I, Name> extends true ? I
    : IsTok<T, Nx<I>, Name> extends true ? Nx<I>
    : IsTok<T, Nx<Nx<I>>, Name> extends true ? Nx<Nx<I>>
    : IsTok<T, Nx<Nx<Nx<I>>>, Name> extends true ? Nx<Nx<Nx<I>>>
    : FindTok<T, Name, Nx<Nx<Nx<Nx<I>>>>>
    : -1;
type IsTok<T extends Toks, I extends number, Name extends string> = T[I] extends { readonly k: "w" | "id"; readonly v: Name } ? true : false;

/** Row type of a statement (`never` for DML without RETURNING and for DDL). */
export type RowOf<DB, TM, Q extends string> =
  Analyze<DB, Q> extends { readonly cols: infer C }
    ? C extends Cols ? BuildRow<ColsToMap<C>, TM, DB> : never
    : never;

export type BuildRow<M extends { readonly [k: string]: { readonly type: string; readonly nullable: boolean } }, TM, DB> =
  Simplify<{ -readonly [K in keyof M]: TsOf<TM, DB, M[K]> }>;

/** Parameter tuple of a statement. Untyped params are `unknown`. */
export type ParamsOf<DB, TM, Q extends string> =
  Analyze<DB, Q> extends { readonly params: infer P extends ParamMap; readonly max: infer N extends number }
    ? BuildParams<P, N, TM, DB, 1, []>
    : [];

type BuildParams<P extends ParamMap, N extends number, TM, DB, I extends number, Acc extends unknown[]> =
  Acc["length"] extends N ? Acc
  : BuildParams<P, N, TM, DB, Inc<I>, [...Acc, I extends keyof P ? ParamTs<P[I], TM, DB> : unknown]>;
/**
 * A parameter used in several places has a union of `ColInfo`s; its TS type is the
 * intersection of each use's TS type. Intersect per `ColInfo` (not per TS union member,
 * which would turn a nullable `string | null` into `string & null` = `never`).
 */
type ParamTs<U, TM, DB> =
  (U extends { readonly type: string; readonly nullable: boolean } ? (u: TsOf<TM, DB, U>) => void : never) extends (u: infer X) => void ? X : never;
type Inc<I extends number> = Nx<I>;

/** Named parameter names of a statement in order of first appearance (`[]` when positional). */
export type NamesOf<DB, Q extends string> =
  Analyze<DB, Q> extends { readonly names: infer N extends readonly string[] } ? N : [];

/**
 * Argument list a call site must pass after the query: a single object for `:name`
 * statements, the positional tuple otherwise.
 */
export type ParamsArgs<DB, TM, Q extends string> =
  NamesOf<DB, Q> extends infer N extends readonly string[]
    ? N extends readonly [] ? ParamsOf<DB, TM, Q> : [params: NamedParams<N, ParamsOf<DB, TM, Q>>]
    : never;

/**
 * `Validate<DB, Q>` is `Q` when the statement is valid, otherwise the `SqlError`.
 * Used as `query: Q & Validate<DB, Q>` so the error lands on the string literal.
 */
export type Validate<DB, Q extends string> =
  Analyze<DB, Q> extends infer R ? (R extends AnyErr ? R : Q) : never;

/** Kind of statement: "select" | "insert" | ... */
export type KindOf<DB, Q extends string> = Analyze<DB, Q> extends { readonly kind: infer K } ? K : never;

/**
 * Apply a DDL script (one or more `;`-separated statements) to a schema: the new schema,
 * or `SqlError<message, tokenIndex>`. See engine/ddl/apply.ts.
 */
export type ApplyDdl<DB, Q extends string> = ApplyDdlAll<DB, Q>;

export type { AnyErr, ErrAt, ErrMsg, SqlError };
