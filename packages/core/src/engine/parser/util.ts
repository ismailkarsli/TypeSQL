import type { SqlError } from "../errors.js";
import type { Next } from "../lexer/next.js";
import type {
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	Tok,
	Toks,
	WordTok,
} from "../lexer/tokens.js";
import type { NotColId, TypeFuncNameKeyword } from "./keywords.js";

/**
 * Parser combinator conventions (index-based).
 *
 * The token tuple `T` is never sliced; every parse function takes the current index
 * `I` and returns `Ok<Node, J>` (J = index after the node) or an `SqlError` whose
 * position is the token index where parsing failed:
 *
 *   ParseX<T, I> extends infer R ? R extends Ok<infer N, infer J extends number> ? … : R : never
 *
 * `T[I]` is `undefined` past the end of the statement.
 * Index arithmetic uses the generated successor table (`Nx<I>` = I + 1).
 */

export type Ok<N, J extends number> = readonly [N, J];

/** I + 1 via the generated lookup table (plain indexed access: no conditional, no `keyof` check). */
export type Nx<I extends number> = Next[I];
export type Nx2<I extends number> = Nx<Nx<I>>;
export type Nx3<I extends number> = Nx<Nx2<I>>;
export type Nx4<I extends number> = Nx<Nx3<I>>;
export type Nx5<I extends number> = Nx<Nx4<I>>;

/** Error positioned at token index `I`. */
export type Fail<Message extends string, I extends number> = SqlError<
	Message,
	I
>;

/** Human-readable spelling of token `I`, for "at or near" messages. */
export type Near<T extends Toks, I extends number> = T[I] extends infer H
	? H extends WordTok<infer V>
		? V
		: H extends IdTok<infer V>
			? `"${V}"`
			: H extends OpTok<infer V>
				? V
				: H extends NumTok<infer V>
					? V
					: H extends StrTok<infer V>
						? `'${V}'`
						: H extends ParamTok<infer V>
							? `$${V}`
							: "end of input"
	: never;

export type SyntaxErrorAt<T extends Toks, I extends number> = Fail<
	`syntax error at or near ${Near<T, I>}`,
	I
>;
export type Expected<
	What extends string,
	T extends Toks,
	I extends number,
> = Fail<`syntax error: expected ${What} at or near ${Near<T, I>}`, I>;

// ─── Peeking ───

export type AtEnd<T extends Toks, I extends number> = T[I] extends Tok
	? false
	: true;

// ─── Consuming (result: next index, or `never`; only test with `extends never`) ───

export type EatWord<T extends Toks, I extends number, W extends string> =
	T[I] extends WordTok<infer V> ? (V extends W ? Nx<I> : never) : never;
export type EatOp<T extends Toks, I extends number, O extends string> =
	T[I] extends OpTok<infer V> ? (V extends O ? Nx<I> : never) : never;
/** Consume a run of words: `EatWords<T, I, ["with", "time", "zone"]>` → index after, or never. */
export type EatWords<
	T extends Toks,
	I extends number,
	Ws extends readonly string[],
> = Ws extends readonly [
	infer W extends string,
	...infer R extends readonly string[],
]
	? EatWord<T, I, W> extends never
		? never
		: EatWords<T, EatWord<T, I, W>, R>
	: I;
/** Skip word `W` if present (always succeeds). */
export type SkipWord<T extends Toks, I extends number, W extends string> =
	EatWord<T, I, W> extends never ? I : EatWord<T, I, W>;
export type SkipWords<
	T extends Toks,
	I extends number,
	Ws extends readonly string[],
> = EatWords<T, I, Ws> extends never ? I : EatWords<T, I, Ws>;

// ─── Identifiers ───

/**
 * `ColId`: an identifier, or a keyword usable as a table, column or alias name (not reserved,
 * not a type/function-name keyword like `left`, `join`, `is`): `[name, next]` or `null`.
 *
 * NOTE: helpers tested with `X extends [infer A, infer B]` must fail with `null`, never
 * with `never`: `never extends [infer A, infer B]` takes the *true* branch.
 */
export type Ident<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? [V, Nx<I>]
		: T[I] extends WordTok<infer V>
			? V extends NotColId
				? null
				: [V, Nx<I>]
			: null;

/** `ColLabel`: any word or quoted identifier (after `AS` or `.`, Postgres accepts every keyword): `[name, next]` or `null`. */
export type AnyLabel<T extends Toks, I extends number> =
	T[I] extends IdTok<infer V>
		? [V, Nx<I>]
		: T[I] extends WordTok<infer V>
			? [V, Nx<I>]
			: null;

/**
 * Qualified name `a`, `a.b`, `a.b.c` → `[parts, next]` (max 3 parts) or `null`: a `ColId`, then
 * labels (`t.from`, `public.select`).
 */
export type QualName<T extends Toks, I extends number> =
	Ident<T, I> extends [infer A extends string, infer I1 extends number]
		? QualParts<T, I1, [A]>
		: null;
/** The `.label`s after the first part: a `.` without a label after it is not consumed. */
type QualParts<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	EatOp<T, I, "."> extends never
		? [Acc, I]
		: AnyLabel<T, EatOp<T, I, ".">> extends [
					infer B extends string,
					infer J extends number,
				]
			? Acc extends readonly [unknown, unknown]
				? [[...Acc, B], J]
				: QualParts<T, J, [...Acc, B]>
			: [Acc, I];

/**
 * The name of a call at `I` (`func_name`): a qualified name, or a type/function-name keyword
 * followed by `(` (`left(s, 2)`; `left` alone is no name) → `[parts, next]` or `null`.
 */
export type FuncName<T extends Toks, I extends number> =
	T[I] extends WordTok<infer V extends TypeFuncNameKeyword>
		? T[Nx<I>] extends OpTok<"(">
			? [[V], Nx<I>]
			: null
		: QualName<T, I>;

/** `(a, b, c)` → `Ok<names, next>` or error. Token `I` must be `(`. */
export type ParenIdentList<T extends Toks, I extends number> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: IdentListLoop<T, EatOp<T, I, "(">, []>;
type IdentListLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatOp<T, J, ","> extends never
			? EatOp<T, J, ")"> extends never
				? Expected<'"," or ")"', T, J>
				: Ok<[...Acc, N], EatOp<T, J, ")">>
			: IdentListLoop<T, EatOp<T, J, ",">, [...Acc, N]>
		: Expected<"identifier", T, I>;

/**
 * Skip tokens up to and including the `)` matching an already-consumed `(`. Without one, the
 * end-of-input index, or with `OrFail` a syntax error there.
 */
export type SkipToCloseParen<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[] = [],
	OrFail extends boolean = false,
> =
	T[I] extends OpTok<"(">
		? SkipToCloseParen<T, Nx<I>, [...Depth, 0], OrFail>
		: T[I] extends OpTok<")">
			? Depth extends readonly [unknown, ...infer D2]
				? SkipToCloseParen<T, Nx<I>, D2, OrFail>
				: Nx<I>
			: T[I] extends Tok
				? SkipToCloseParen<T, Nx<I>, Depth, OrFail>
				: OrFail extends true
					? SyntaxErrorAt<T, I>
					: I;
