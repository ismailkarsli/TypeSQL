import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type { NumTok, OpTok, WordTok } from "../lexer/tokens.js";
import type { ParseSelectStmt } from "./select.js";
import type { AtEnd, EatWord, Expected, Ident, Nx2, Ok } from "./util.js";

export type ParseCursorStmt<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "declare"
			? ParseDeclare<T, Next<I>>
			: W extends "fetch" | "move"
				? ParseFetch<T, Next<I>, W>
				: ParseClose<T, Next<I>>
		: never;

type ParseDeclare<T extends Toks, I extends number> =
	Ident<T, I> extends [infer N, infer J extends number]
		? CursorOptions<T, J, never> extends infer K extends number
			? EatWord<T, K, "cursor"> extends never
				? Expected<"CURSOR", T, K>
				: SkipHold<T, Next<K>> extends infer L extends number
					? EatWord<T, L, "for"> extends never
						? Expected<"FOR", T, L>
						: ParseSelectStmt<T, Next<L>> extends Ok<infer Q, infer J2>
							? Ok<{ t: "declare_cursor"; name: N; q: Q }, J2>
							: ParseSelectStmt<T, Next<L>>
					: SkipHold<T, Next<K>>
			: CursorOptions<T, J, never>
		: Expected<"cursor name", T, I>;

type CursorOptions<T extends Toks, I extends number, Seen extends string> =
	T[I] extends WordTok<
		infer W extends "binary" | "asensitive" | "insensitive" | "scroll"
	>
		? CursorOptions<T, Next<I>, Seen | W>
		: T[I] extends WordTok<"no">
			? T[Next<I>] extends WordTok<"scroll">
				? CursorOptions<T, Nx2<I>, Seen | "no scroll">
				: Expected<"SCROLL", T, Next<I>>
			: "asensitive" | "insensitive" extends Seen
				? SqlError<"cannot specify both ASENSITIVE and INSENSITIVE", null>
				: "scroll" | "no scroll" extends Seen
					? SqlError<"cannot specify both SCROLL and NO SCROLL", null>
					: I;

type SkipHold<T extends Toks, I extends number> =
	T[I] extends WordTok<"with" | "without">
		? T[Next<I>] extends WordTok<"hold">
			? Nx2<I>
			: Expected<"HOLD", T, Next<I>>
		: I;

type ParseFetch<T extends Toks, I extends number, K extends "fetch" | "move"> =
	Ident<T, I> extends [infer N, infer J extends number]
		? AtEnd<T, J> extends true
			? Ok<{ t: K; cursor: N }, J>
			: T[J] extends OpTok<";">
				? Ok<{ t: K; cursor: N }, J>
				: FetchFrom<T, FetchDirection<T, I>, K>
		: FetchFrom<T, FetchDirection<T, I>, K>;

type FetchFrom<T extends Toks, D, K extends "fetch" | "move"> = D extends number
	? (T[D] extends WordTok<"from" | "in"> ? Next<D> : D) extends infer J extends
			number
		? Ident<T, J> extends [infer N, infer J2 extends number]
			? Ok<{ t: K; cursor: N }, J2>
			: Expected<"cursor name", T, J>
		: never
	: D;

type FetchDirection<T extends Toks, I extends number> =
	T[I] extends WordTok<infer W>
		? W extends "next" | "prior" | "first" | "last" | "all"
			? Next<I>
			: W extends "absolute" | "relative"
				? SignedInt<T, Next<I>> extends infer J
					? J extends Next<I>
						? Expected<"integer", T, J>
						: J
					: never
				: W extends "forward" | "backward"
					? T[Next<I>] extends WordTok<"all">
						? Nx2<I>
						: SignedInt<T, Next<I>>
					: I
		: SignedInt<T, I>;

type SignedInt<T extends Toks, I extends number> = T[I] extends NumTok
	? Next<I>
	: T[I] extends OpTok<"+" | "-">
		? T[Next<I>] extends NumTok
			? Nx2<I>
			: Expected<"integer", T, Next<I>>
		: I;

type ParseClose<T extends Toks, I extends number> =
	T[I] extends WordTok<"all">
		? Ok<{ t: "close_cursor"; cursor: null }, Next<I>>
		: Ident<T, I> extends [infer N, infer J extends number]
			? Ok<{ t: "close_cursor"; cursor: N }, J>
			: Expected<"cursor name or ALL", T, I>;
