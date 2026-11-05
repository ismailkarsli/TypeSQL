import type { SqlError } from "../../../errors.js";
import type { Stmt, WithClause } from "../ast.js";
import type {
	ParseAlter,
	ParseCreate,
	ParseDrop,
	ParseRename,
	ParseTruncate,
	SkipStatement,
} from "./ddl.js";
import type { ParseDelete, ParseInsert, ParseUpdate } from "./dml.js";
import type { ParseSelectAfterWith, ParseWith } from "./select.js";
import type { AtEnd, IsOp, IsWord, Nx, Ok, SyntaxErr, Toks } from "./util.js";

export type ParseStatement<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W extends string;
}
	? W extends "select" | "values" | "table"
		? ParseSelectAfterWith<T, I, null>
		: W extends "with"
			? ParseWithStatement<T, Nx<I>>
			: W extends "insert" | "replace"
				? ParseInsert<T, I>
				: W extends "update"
					? ParseUpdate<T, Nx<I>, null>
					: W extends "delete"
						? ParseDelete<T, Nx<I>, null>
						: W extends "create"
							? ParseCreate<T, Nx<I>>
							: W extends "alter"
								? ParseAlter<T, Nx<I>>
								: W extends "drop"
									? ParseDrop<T, Nx<I>>
									: W extends "rename"
										? ParseRename<T, Nx<I>>
										: W extends "truncate"
											? ParseTruncate<T, Nx<I>>
											: W extends NoopKeyword
												? SkipStatement<T, Nx<I>, W>
												: SyntaxErr<T, I>
	: IsOp<T, I, "("> extends true
		? ParseSelectAfterWith<T, I, null>
		: SyntaxErr<T, I>;

type NoopKeyword =
	| "begin"
	| "start"
	| "commit"
	| "rollback"
	| "savepoint"
	| "release"
	| "set"
	| "use"
	| "lock"
	| "unlock"
	| "analyze"
	| "optimize"
	| "check"
	| "checksum"
	| "repair"
	| "flush"
	| "grant"
	| "revoke"
	| "show"
	| "describe"
	| "desc"
	| "explain"
	| "do"
	| "handler"
	| "kill"
	| "load"
	| "call"
	| "install"
	| "uninstall"
	| "xa"
	| "reset"
	| "purge"
	| "change"
	| "prepare"
	| "execute"
	| "deallocate"
	| "signal"
	| "resignal"
	| "get"
	| "binlog"
	| "cache"
	| "help"
	| "import"
	| "shutdown"
	| "restart"
	| "clone";

type ParseWithStatement<T extends Toks, I extends number> =
	ParseWith<T, I> extends Ok<
		infer Wc extends WithClause,
		infer J extends number
	>
		? IsWord<T, J, "select" | "values" | "table"> extends true
			? ParseSelectAfterWith<T, J, Wc>
			: IsOp<T, J, "("> extends true
				? ParseSelectAfterWith<T, J, Wc>
				: IsWord<T, J, "update"> extends true
					? ParseUpdate<T, Nx<J>, Wc>
					: IsWord<T, J, "delete"> extends true
						? ParseDelete<T, Nx<J>, Wc>
						: SyntaxErr<T, J>
		: ParseWith<T, I>;

type SkipSemis<T extends Toks, I extends number> =
	IsOp<T, I, ";"> extends true ? SkipSemis<T, Nx<I>> : I;

export type ParseProgram<T extends Toks> =
	SkipSemis<T, 0> extends infer I0 extends number
		? AtEnd<T, I0> extends true
			? SqlError<"Query was empty", 0>
			: ParseStatement<T, I0> extends Ok<
						infer S extends Stmt,
						infer J extends number
					>
				? AtEnd<T, J> extends true
					? S
					: IsOp<T, J, ";"> extends true
						? SkipSemis<T, J> extends infer J2 extends number
							? AtEnd<T, J2> extends true
								? S
								: SqlError<"only one statement is allowed", J2>
							: never
						: SyntaxErr<T, J>
				: ParseStatement<T, I0>
		: never;

export type ParseScript<
	T extends Toks,
	I extends number = 0,
	Acc extends readonly Stmt[] = [],
> =
	SkipSemis<T, I> extends infer I0 extends number
		? AtEnd<T, I0> extends true
			? Acc
			: ParseStatement<T, I0> extends Ok<
						infer S extends Stmt,
						infer J extends number
					>
				? AtEnd<T, J> extends true
					? [...Acc, S]
					: IsOp<T, J, ";"> extends true
						? ParseScript<T, J, [...Acc, S]>
						: SyntaxErr<T, J>
				: ParseStatement<T, I0>
		: never;
