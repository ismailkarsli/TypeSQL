import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type { WithClause } from "../ast.js";
import type { OpTok, WordTok } from "../lexer/tokens.js";
import type { ParseDdl } from "./ddl.js";
import type { ParseDelete, ParseInsert, ParseUpdate } from "./dml.js";
import type { ParseMerge } from "./merge.js";
import type { ParseSelectAfterWith, ParseWith } from "./select.js";
import type { AtEnd, EatOp, Expected, Fail, Near, Ok } from "./util.js";
import type { ParseCursorStmt } from "./utility.js";

export type ParseProgram<T extends Toks> =
	ParseStatement<T, 0> extends infer X
		? X extends Ok<infer S, infer J>
			? AtEnd<T, J> extends true
				? S
				: EatOp<T, J, ";"> extends never
					? Fail<`syntax error at or near ${Near<T, J>}`, J>
					: AtEnd<T, Next<J>> extends true
						? S
						: Fail<
								`syntax error at or near ${Near<T, Next<J>>}: only one statement is allowed`,
								Next<J>
							>
			: X
		: never;

type DdlKeyword =
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
 * The statement at I, after the WITH clause `W` if any: a query or DML
 * statement, or (without WITH) DDL and cursor statements.
 */
export type ParseStatement<
	T extends Toks,
	I extends number,
	Into extends boolean = true,
	W extends WithClause | null = null,
> =
	T[I] extends WordTok<infer K>
		? K extends "select" | "values" | "table"
			? SelectInto<ParseSelectAfterWith<T, I, W>, Into>
			: K extends "insert"
				? ParseInsert<T, Next<I>, W>
				: K extends "update"
					? ParseUpdate<T, Next<I>, W>
					: K extends "delete"
						? ParseDelete<T, Next<I>, W>
						: K extends "merge"
							? ParseMerge<T, Next<I>, W>
							: W extends null
								? K extends "with"
									? ParseWith<T, Next<I>> extends infer X
										? X extends Ok<infer Wc extends WithClause, infer J>
											? ParseStatement<T, J, Into, Wc>
											: X
										: never
									: K extends DdlKeyword
										? ParseDdl<T, I>
										: K extends "declare" | "fetch" | "move" | "close"
											? ParseCursorStmt<T, I>
											: Fail<`syntax error at or near ${Near<T, I>}`, I>
								: AfterWith<T, I>
		: T[I] extends OpTok<"(">
			? SelectInto<ParseSelectAfterWith<T, I, W>, Into>
			: W extends null
				? Expected<"a SQL statement", T, I>
				: AfterWith<T, I>;
type AfterWith<T extends Toks, I extends number> = Expected<
	"SELECT, INSERT, UPDATE, DELETE or MERGE after WITH",
	T,
	I
>;

type SelectInto<R, Into extends boolean> = Into extends false
	? R
	: R extends Ok<
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
		: R;
