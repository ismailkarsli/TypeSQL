import type { SqlError } from "../../../errors.js";
import type { Stmt, WithClause } from "../ast.js";
import type {
	ParseAlter,
	ParseCreate,
	ParseDrop,
	SkipStatement,
} from "./ddl.js";
import type { ParseDelete, ParseInsert, ParseUpdate } from "./dml.js";
import type { ParseSelectAfterWith, ParseWith } from "./select.js";
import type { AtEnd, IsOp, IsWord, Nx, Ok, SyntaxErr, Toks } from "./util.js";

export type ParseStatement<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W extends string;
}
	? W extends "select" | "values"
		? ParseSelectAfterWith<T, I, null>
		: W extends "with"
			? ParseWithStatement<T, Nx<I>>
			: W extends "insert" | "replace"
				? ParseInsert<T, I, null>
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
									: W extends NoopKeyword
										? SkipStatement<T, Nx<I>, W>
										: SyntaxErr<T, I>
	: SyntaxErr<T, I>;

type NoopKeyword =
	| "begin"
	| "commit"
	| "end"
	| "rollback"
	| "savepoint"
	| "release"
	| "pragma"
	| "vacuum"
	| "analyze"
	| "reindex"
	| "attach"
	| "detach"
	| "explain";

type ParseWithStatement<T extends Toks, I extends number> =
	ParseWith<T, I> extends infer W
		? W extends Ok<infer Wc extends WithClause, infer J extends number>
			? IsWord<T, J, "select" | "values"> extends true
				? ParseSelectAfterWith<T, J, Wc>
				: IsWord<T, J, "insert" | "replace"> extends true
					? ParseInsert<T, J, Wc>
					: IsWord<T, J, "update"> extends true
						? ParseUpdate<T, Nx<J>, Wc>
						: IsWord<T, J, "delete"> extends true
							? ParseDelete<T, Nx<J>, Wc>
							: SyntaxErr<T, J>
			: W
		: never;

type SkipSemis<T extends Toks, I extends number> =
	IsOp<T, I, ";"> extends true ? SkipSemis<T, Nx<I>> : I;

export type ParseProgram<T extends Toks> =
	SkipSemis<T, 0> extends infer I0 extends number
		? AtEnd<T, I0> extends true
			? SqlError<"the SQL text contains no statements", 0>
			: ParseStatement<T, I0> extends infer X
				? X extends Ok<infer S extends Stmt, infer J extends number>
					? AtEnd<T, J> extends true
						? S
						: IsOp<T, J, ";"> extends true
							? SkipSemis<T, J> extends infer J2 extends number
								? AtEnd<T, J2> extends true
									? S
									: SqlError<"only one statement is allowed", J2>
								: never
							: SyntaxErr<T, J>
					: X
				: never
		: never;

export type ParseScript<
	T extends Toks,
	I extends number = 0,
	Acc extends readonly Stmt[] = [],
> =
	SkipSemis<T, I> extends infer I0 extends number
		? AtEnd<T, I0> extends true
			? Acc
			: ParseStatement<T, I0> extends infer X
				? X extends Ok<infer S extends Stmt, infer J extends number>
					? AtEnd<T, J> extends true
						? [...Acc, S]
						: IsOp<T, J, ";"> extends true
							? ParseScript<T, J, [...Acc, S]>
							: SyntaxErr<T, J>
					: X
				: never
		: never;
