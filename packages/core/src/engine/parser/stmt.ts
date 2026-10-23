import type { Stmt, WithClause } from "../ast.js";
import type { OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseDdl } from "./ddl.js";
import type { ParseDelete, ParseInsert, ParseUpdate } from "./dml.js";
import type { ParseSelectAfterWith, ParseWith } from "./select.js";
import type { ParseCursorStmt } from "./utility.js";
import type { AtEnd, EatOp, Expected, Fail, Near, Nx, Ok } from "./util.js";

/**
 * Parse one complete statement. An optional trailing `;` is allowed; any other
 * leftover tokens are a syntax error (no silent acceptance of unsupported syntax).
 * Result: `Stmt` or `SqlError<message, tokenIndex>`.
 */
export type ParseProgram<T extends Toks> =
  ParseStatement<T, 0> extends infer X
    ? X extends Ok<infer S extends Stmt, infer J extends number>
      ? AtEnd<T, J> extends true ? S
      : EatOp<T, J, ";"> extends never ? Fail<`syntax error at or near ${Near<T, J>}`, J>
      : AtEnd<T, EatOp<T, J, ";">> extends true ? S
      : Fail<`syntax error at or near ${Near<T, EatOp<T, J, ";">>}: only one statement is allowed`, EatOp<T, J, ";">>
      : X
    : never;

/** First words that start a DDL / utility statement. */
export type DdlKeyword =
  | "create" | "alter" | "drop" | "truncate" | "comment" | "grant" | "revoke" | "set" | "reset"
  | "begin" | "commit" | "rollback" | "start" | "savepoint" | "release" | "analyze" | "vacuum"
  | "reindex" | "cluster" | "refresh" | "lock" | "notify" | "listen" | "unlisten" | "discard"
  | "explain" | "show" | "do" | "call" | "security" | "import" | "copy" | "prepare" | "execute" | "deallocate" | "checkpoint" | "load"
  | "end" | "abort" | "reassign";

/** Dispatch on the first token. `Ok<Stmt, next>` or error. */
export type ParseStatement<T extends Toks, I extends number> =
  T[I] extends WordTok<infer W>
    ? W extends "select" | "values" | "table" ? ParseSelectAfterWith<T, I, null>
    : W extends "with" ? ParseWithStatement<T, Nx<I>>
    : W extends "insert" ? ParseInsert<T, Nx<I>, null>
    : W extends "update" ? ParseUpdate<T, Nx<I>, null>
    : W extends "delete" ? ParseDelete<T, Nx<I>, null>
    : W extends DdlKeyword ? ParseDdl<T, I>
    : W extends "declare" | "fetch" | "move" | "close" ? ParseCursorStmt<T, I>
    : Fail<`syntax error at or near ${Near<T, I>}`, I>
  : T[I] extends OpTok<"("> ? ParseSelectAfterWith<T, I, null>
  : Expected<"a SQL statement", T, I>;

type ParseWithStatement<T extends Toks, I extends number> =
  ParseWith<T, I> extends infer W
    ? W extends Ok<infer Wc extends WithClause, infer J extends number>
      ? T[J] extends WordTok<infer K>
        ? K extends "select" | "values" | "table" ? ParseSelectAfterWith<T, J, Wc>
        : K extends "insert" ? ParseInsert<T, Nx<J>, Wc>
        : K extends "update" ? ParseUpdate<T, Nx<J>, Wc>
        : K extends "delete" ? ParseDelete<T, Nx<J>, Wc>
        : Expected<"SELECT, INSERT, UPDATE or DELETE after WITH", T, J>
      : T[J] extends OpTok<"("> ? ParseSelectAfterWith<T, J, Wc>
      : Expected<"SELECT, INSERT, UPDATE or DELETE after WITH", T, J>
      : W
    : never;
