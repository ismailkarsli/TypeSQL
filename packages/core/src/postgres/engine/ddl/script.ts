import type { OpTok, Tok, Toks } from "../../../engine/tokens.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { DdlStmt, Stmt } from "../ast.js";
import type { Lex } from "../lexer/lex.js";
import type { ParseStatement } from "../parser/stmt.js";
import type { AtEnd, Nx, Ok, SyntaxErrorAt } from "../parser/util.js";
import type { ProjectStmt } from "../project/stmt.js";
import type { ApplyDdlNode } from "./apply.js";

type DdlKind = DdlStmt["t"];

export type ApplyDdlAll<DB, Q extends string> =
	Lex<Q> extends infer T
		? T extends Toks
			? ApplyLoop<DB, T, 0>
			: Plain<T>
		: never;

type ApplyLoop<DB, T extends Toks, I extends number> =
	AtEnd<T, I> extends true
		? DB
		: T[I] extends OpTok<";">
			? ApplyLoop<DB, T, Nx<I>>
			: ParseStatement<T, I> extends infer R
				? R extends Ok<infer S, infer J>
					? EndsAt<T, J> extends false
						? Plain<SyntaxErrorAt<T, J>>
						: ApplyOne<DB, S> extends infer DB2
							? DB2 extends AnyErr
								? RepositionFrom<DB2, T, I>
								: ApplyLoop<DB2, T, J>
							: never
					: Plain<R>
				: never;

type EndsAt<T extends Toks, J extends number> =
	T[J] extends OpTok<";"> ? true : AtEnd<T, J>;

type ApplyOne<DB, S> = S extends { readonly t: DdlKind }
	? ApplyDdlNode<DB, S>
	: S extends Stmt
		? ProjectStmt<S, DB, [], {}> extends infer C
			? C extends AnyErr
				? C
				: DB
			: never
		: SqlError<"unsupported statement", null>;

type Plain<E> = E extends SqlError<infer M, infer At> ? SqlError<M, At> : E;

type RepositionFrom<E, T extends Toks, Start extends number> =
	E extends SqlError<infer M, unknown>
		? SqlError<M, LocateFrom<M, T, Start>>
		: E;

type LocateFrom<
	M extends string,
	T extends Toks,
	Start extends number,
> = M extends `function ${infer Name}(${string}`
	? FindTok<T, Name, Start, Start>
	: M extends `${string}"${infer Name}"${string}`
		? FindTok<T, LastPart<Name>, Start, Start> extends infer F extends number
			? M extends `${string} specified more than once`
				? F extends Start
					? F
					: FindTok<T, LastPart<Name>, Nx<F>, F>
				: F
			: Start
		: M extends `cannot drop ${string} ${infer Name} because ${string}`
			? FindTok<T, Name, Start, Start>
			: Start;

type LastPart<N extends string> = N extends `${string}.${infer R}`
	? LastPart<R>
	: N;

type FindTok<
	T extends Toks,
	Name extends string,
	I extends number,
	Fallback,
> = T[I] extends { readonly k: "w" | "id" | "s"; readonly v: Name }
	? I
	: T[I] extends OpTok<";">
		? Fallback
		: T[I] extends Tok
			? FindTok<T, Name, Nx<I>, Fallback>
			: Fallback;
