import type { Stmt, WithClause } from "../ast.js";
import type { OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseDdl } from "./ddl.js";
import type { ParseDelete, ParseInsert, ParseUpdate } from "./dml.js";
import type { ParseMerge } from "./merge.js";
import type { ParseSelectAfterWith, ParseWith } from "./select.js";
import type { AtEnd, EatOp, Expected, Fail, Near, Nx, Ok } from "./util.js";
import type { ParseCursorStmt } from "./utility.js";

/**
 * Parse one complete statement. An optional trailing `;` is allowed; any other
 * leftover tokens are a syntax error (no silent acceptance of unsupported syntax).
 * Result: `Stmt` or `SqlError<message, tokenIndex>`.
 */
export type ParseProgram<T extends Toks> =
	ParseStatement<T, 0> extends infer X
		? X extends Ok<infer S, infer J>
			? AtEnd<T, J> extends true
				? S
				: EatOp<T, J, ";"> extends never
					? Fail<`syntax error at or near ${Near<T, J>}`, J>
					: AtEnd<T, EatOp<T, J, ";">> extends true
						? S
						: Fail<
								`syntax error at or near ${Near<T, EatOp<T, J, ";">>}: only one statement is allowed`,
								EatOp<T, J, ";">
							>
			: X
		: never;

/** First words that start a DDL / utility statement. */
export type DdlKeyword =
	| "create"
	| "alter"
	| "drop"
	| "truncate"
	| "comment"
	| "grant"
	| "revoke"
	| "set"
	| "reset"
	| "begin"
	| "commit"
	| "rollback"
	| "start"
	| "savepoint"
	| "release"
	| "analyze"
	| "vacuum"
	| "reindex"
	| "cluster"
	| "refresh"
	| "lock"
	| "notify"
	| "listen"
	| "unlisten"
	| "discard"
	| "explain"
	| "show"
	| "do"
	| "call"
	| "security"
	| "import"
	| "copy"
	| "prepare"
	| "execute"
	| "deallocate"
	| "checkpoint"
	| "load"
	| "end"
	| "abort"
	| "reassign";

/**
 * Dispatch on the first token. `Ok<Stmt, next>` or error. `Into`: a top-level statement, where
 * `SELECT … INTO` creates a table; elsewhere (a WITH query) the INTO stays and is rejected.
 */
export type ParseStatement<
	T extends Toks,
	I extends number,
	Into extends boolean = true,
> =
	T[I] extends WordTok<infer W>
		? W extends "select" | "values" | "table"
			? SelectInto<ParseSelectAfterWith<T, I, null>, Into>
			: W extends "with"
				? ParseWithStatement<T, Nx<I>, Into>
				: W extends "insert"
					? ParseInsert<T, Nx<I>, null>
					: W extends "update"
						? ParseUpdate<T, Nx<I>, null>
						: W extends "delete"
							? ParseDelete<T, Nx<I>, null>
							: W extends "merge"
								? ParseMerge<T, Nx<I>, null>
								: W extends DdlKeyword
									? ParseDdl<T, I>
									: W extends "declare" | "fetch" | "move" | "close"
										? ParseCursorStmt<T, I>
										: Fail<`syntax error at or near ${Near<T, I>}`, I>
		: T[I] extends OpTok<"(">
			? SelectInto<ParseSelectAfterWith<T, I, null>, Into>
			: Expected<"a SQL statement", T, I>;

/**
 * `SELECT … INTO [TEMP | UNLOGGED | TABLE] name FROM …` creates a table, like CREATE TABLE AS
 * (which is what Postgres turns it into): the statement becomes `create_table_as`. Anywhere but
 * the top-level SELECT, the INTO clause is rejected when the query is projected.
 */
type SelectInto<R, Into extends boolean> = Into extends false
	? R
	: R extends readonly [{ readonly body: { readonly into: unknown } }, number]
		? R extends Ok<
				infer S extends { readonly body: { readonly into: unknown } },
				infer J
			>
			? Ok<
					{
						t: "create_table_as";
						ifNotExists: false;
						table: S["body"]["into"];
						cols: null;
						q: {
							[K in keyof S]: K extends "body" ? Omit<S["body"], "into"> : S[K];
						};
					},
					J
				>
			: R // type-mutate: equivalent never-false – an Ok tuple of that shape always matches Ok
		: R;

type ParseWithStatement<
	T extends Toks,
	I extends number,
	Into extends boolean,
> =
	ParseWith<T, I> extends infer W
		? W extends Ok<infer Wc extends WithClause, infer J>
			? T[J] extends WordTok<infer K>
				? K extends "select" | "values" | "table"
					? SelectInto<ParseSelectAfterWith<T, J, Wc>, Into>
					: K extends "insert"
						? ParseInsert<T, Nx<J>, Wc>
						: K extends "update"
							? ParseUpdate<T, Nx<J>, Wc>
							: K extends "delete"
								? ParseDelete<T, Nx<J>, Wc>
								: K extends "merge"
									? ParseMerge<T, Nx<J>, Wc>
									: Expected<
											"SELECT, INSERT, UPDATE, DELETE or MERGE after WITH",
											T,
											J
										>
				: T[J] extends OpTok<"(">
					? SelectInto<ParseSelectAfterWith<T, J, Wc>, Into>
					: Expected<"SELECT, INSERT, UPDATE, DELETE or MERGE after WITH", T, J>
			: W
		: never;
