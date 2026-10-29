import type { WithClause } from "../ast.js";
import type { OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseDdl } from "./ddl.js";
import type { ParseDelete, ParseInsert, ParseUpdate } from "./dml.js";
import type { ParseMerge } from "./merge.js";
import type { ParseSelectAfterWith, ParseWith } from "./select.js";
import type { AtEnd, EatOp, Expected, Fail, Near, Nx, Ok } from "./util.js";
import type { ParseCursorStmt } from "./utility.js";

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
