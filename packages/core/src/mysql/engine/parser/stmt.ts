import type { Unlocated } from "../../../engine/family/diagnostics.js";
import type {
	IsOp,
	IsWord,
	SkipSemis,
	SkipStatement,
	SyntaxErr,
} from "../../../engine/family/parse.js";
import type { Next } from "../../../engine/next.js";
import type { AtEnd, Ok, Toks } from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type { Stmt, WithClause } from "../ast.js";
import type {
	ParseAlter,
	ParseCreate,
	ParseDrop,
	ParseRename,
	ParseTruncate,
} from "./ddl.js";
import type { ParseDelete, ParseInsert, ParseUpdate } from "./dml.js";
import type { ParseSelectAfterWith, ParseWith } from "./select.js";
import type { SyntaxWords } from "./util.js";

type StatementAt<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W extends string;
}
	? W extends "select" | "values" | "table"
		? ParseSelectAfterWith<T, I, null>
		: W extends "with"
			? ParseWithStatement<T, Next<I>>
			: W extends "insert" | "replace"
				? ParseInsert<T, I>
				: W extends "update"
					? ParseUpdate<T, Next<I>, null>
					: W extends "delete"
						? ParseDelete<T, Next<I>, null>
						: W extends "create"
							? ParseCreate<T, Next<I>>
							: W extends "alter"
								? ParseAlter<T, Next<I>>
								: W extends "drop"
									? ParseDrop<T, Next<I>>
									: W extends "rename"
										? ParseRename<T, Next<I>>
										: W extends "truncate"
											? ParseTruncate<T, Next<I>>
											: W extends NoopKeyword
												? SkipStatement<T, Next<I>, W>
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
					? ParseUpdate<T, Next<J>, Wc>
					: IsWord<T, J, "delete"> extends true
						? ParseDelete<T, Next<J>, Wc>
						: SyntaxErr<T, J>
		: ParseWith<T, I>;

export type ParseProgramAt<T extends Toks> =
	SkipSemis<T, 0> extends infer I0 extends number
		? AtEnd<T, I0> extends true
			? SqlError<"Query was empty", 0>
			: StatementAt<T, I0> extends Ok<
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
				: StatementAt<T, I0>
		: never;

export type ParseScript<
	T extends Toks,
	I extends number = 0,
	Acc extends readonly Stmt[] = [],
> =
	SkipSemis<T, I> extends infer I0 extends number
		? AtEnd<T, I0> extends true
			? Acc
			: StatementAt<T, I0> extends Ok<
						infer S extends Stmt,
						infer J extends number
					>
				? AtEnd<T, J> extends true
					? [...Acc, S]
					: IsOp<T, J, ";"> extends true
						? ParseScript<T, J, [...Acc, S]>
						: SyntaxErr<T, J>
				: StatementAt<T, I0>
		: never;

/** The statement at token `I`, as `Ok<Stmt, next index>` or the error. */
export type ParseStatement<T extends Toks, I extends number> = Unlocated<
	StatementAt<T, I>,
	SyntaxWords
>;

/** The one statement of `T`. */
export type ParseProgram<T extends Toks> = Unlocated<
	ParseProgramAt<T>,
	SyntaxWords
>;
