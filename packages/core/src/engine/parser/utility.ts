import type { SqlError } from "../errors.js";
import type { NumTok, OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseSelectStmt } from "./select.js";
import type {
	AtEnd,
	EatWord,
	Expected,
	Fail,
	Ident,
	Nx,
	Nx2,
	Ok,
} from "./util.js";

/**
 * Cursor statements (index-based, see util.ts). `I` is the index of the first word.
 *
 *   DECLARE name [BINARY] [ASENSITIVE | INSENSITIVE] [[NO] SCROLL] CURSOR [{WITH | WITHOUT} HOLD] FOR query
 *   FETCH | MOVE [direction] [FROM | IN] name
 *   CLOSE name | ALL
 *
 * DECLARE keeps its query, which is checked like a SELECT (the statement itself returns no
 * rows). FETCH's rows come from a query declared in another statement, so it has no row type.
 */
export type ParseCursorStmt<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "declare"
			? ParseDeclare<T, Nx<I>>
			: W extends "fetch" | "move"
				? ParseFetch<T, Nx<I>, W>
				: ParseClose<T, Nx<I>>
		: never;

// ─── DECLARE ───

type ParseDeclare<T extends Toks, I extends number> =
	Ident<T, I> extends [infer N, infer J extends number]
		? CursorOptions<T, J, never> extends infer K
			? K extends number
				? EatWord<T, K, "cursor"> extends never
					? Expected<"CURSOR", T, K>
					: SkipHold<T, EatWord<T, K, "cursor">> extends infer L
						? L extends number
							? EatWord<T, L, "for"> extends never
								? Expected<"FOR", T, L>
								: ParseSelectStmt<T, EatWord<T, L, "for">> extends infer R
									? R extends Ok<infer Q, infer J2>
										? Ok<{ t: "declare_cursor"; name: N; q: Q }, J2>
										: R
									: never
							: L
						: never
				: K
			: never
		: Expected<"cursor name", T, I>;

/**
 * `BINARY`, `ASENSITIVE`, `INSENSITIVE`, `SCROLL`, `NO SCROLL`, in any order → index after
 * them, or an error: Postgres rejects a contradictory pair. `Seen`: the options so far.
 */
type CursorOptions<T extends Toks, I extends number, Seen extends string> =
	T[I] extends WordTok<
		infer W extends "binary" | "asensitive" | "insensitive" | "scroll"
	>
		? CursorOptions<T, Nx<I>, Seen | W>
		: T[I] extends WordTok<"no">
			? T[Nx<I>] extends WordTok<"scroll">
				? CursorOptions<T, Nx2<I>, Seen | "no scroll">
				: Expected<"SCROLL", T, Nx<I>>
			: "asensitive" | "insensitive" extends Seen
				? SqlError<"cannot specify both ASENSITIVE and INSENSITIVE", null>
				: "scroll" | "no scroll" extends Seen
					? SqlError<"cannot specify both SCROLL and NO SCROLL", null>
					: I;

type SkipHold<T extends Toks, I extends number> =
	T[I] extends WordTok<"with" | "without">
		? T[Nx<I>] extends WordTok<"hold">
			? Nx2<I>
			: Expected<"HOLD", T, Nx<I>>
		: I;

// ─── FETCH / MOVE ───

/**
 * After FETCH / MOVE. A lone name is the cursor, even when it spells a direction
 * (`FETCH next` fetches from a cursor named `next`, as in Postgres).
 */
type ParseFetch<T extends Toks, I extends number, K extends "fetch" | "move"> =
	Ident<T, I> extends [infer N, infer J extends number]
		? AtEnd<T, J> extends true
			? Ok<{ t: K; cursor: N }, J>
			: T[J] extends OpTok<";">
				? Ok<{ t: K; cursor: N }, J>
				: FetchFrom<T, FetchDirection<T, I>, K>
		: FetchFrom<T, FetchDirection<T, I>, K>;

/** `[FROM | IN] name` after the direction. */
type FetchFrom<T extends Toks, D, K extends "fetch" | "move"> = D extends number
	? (T[D] extends WordTok<"from" | "in"> ? Nx<D> : D) extends infer J extends
			number
		? Ident<T, J> extends [infer N, infer J2 extends number]
			? Ok<{ t: K; cursor: N }, J2>
			: Expected<"cursor name", T, J>
		: never
	: D;

/**
 * `NEXT | PRIOR | FIRST | LAST | ABSOLUTE n | RELATIVE n | n | ALL | FORWARD [n | ALL] | BACKWARD [n | ALL]`
 * (n a signed integer) → index after it (`I` without a direction), or an error.
 */
type FetchDirection<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "next" | "prior" | "first" | "last" | "all"
			? Nx<I>
			: W extends "absolute" | "relative"
				? SignedInt<T, Nx<I>> extends infer J
					? J extends Nx<I>
						? Expected<"integer", T, J>
						: J
					: never
				: W extends "forward" | "backward"
					? T[Nx<I>] extends WordTok<"all">
						? Nx2<I>
						: SignedInt<T, Nx<I>>
					: I
		: SignedInt<T, I>;

/** `[+ | -] integer` → index after it, `I` when there is none, or an error for a lone sign. */
type SignedInt<T extends Toks, I extends number> = T[I] extends NumTok
	? Nx<I>
	: T[I] extends OpTok<"+" | "-">
		? T[Nx<I>] extends NumTok
			? Nx2<I>
			: Expected<"integer", T, Nx<I>>
		: I;

// ─── CLOSE ───

type ParseClose<T extends Toks, I extends number> =
	T[I] extends WordTok<"all">
		? Ok<{ t: "close_cursor"; cursor: null }, Nx<I>>
		: Ident<T, I> extends [infer N, infer J extends number]
			? Ok<{ t: "close_cursor"; cursor: N }, J>
			: Expected<"cursor name or ALL", T, I>;
