import type { Digit, IdStart, NonIdAscii, Ws } from "../lexer/chars.js";
import type { Lex } from "../lexer/lex.js";
import type { IdTok, Toks, WordTok } from "../lexer/tokens.js";
import type { MaxParam } from "../typer/params.js";
import type { ColNode } from "./expr.js";
import type { NotBareLabel, NotColId } from "./keywords.js";
import type {
	ParseSelectTail,
	ParseSimpleAfterTargets,
	ParseTargetList,
	StarNode,
	TargetNode,
} from "./select.js";
import type { Nx, Ok } from "./util.js";

/**
 * Parse the projection separately from the FROM tail so repeated headers share their work.
 * Simple column targets bypass tokenization; computed targets use the expression parser.
 * Anything uncertain returns never, leaving the original pipeline to handle it and its errors.
 */
export type FastSelect<Q extends string> =
	TrimStart<Q> extends `${"SELECT" | "select"}${Ws}${infer Rest}`
		? SplitFrom<TrimStart<Rest>>
		: never;

type SplitFrom<S extends string> = S extends `${infer Cs}FROM${Ws}${infer Rest}`
	? Cs extends `${string}${Ws}`
		? SelectFrom<Cs, TrimStart<Rest>>
		: never
	: S extends `${infer Cs}from${Ws}${infer Rest}`
		? Cs extends `${string}${Ws}`
			? SelectFrom<Cs, TrimStart<Rest>>
			: never
		: never;
// A textual FROM inside a line comment is not a clause; let the full lexer locate it.
type SelectFrom<
	Cs extends string,
	Rest extends string,
> = Cs extends `${string}--${string}`
	? never
	: AllTargets<Cs> extends infer Ts
		? Ts extends readonly unknown[]
			? GeneralTail<Ts, Rest>
			: never
		: never;
type AllTargets<S extends string> =
	Targets<S> extends infer Ts
		? Ts extends readonly unknown[]
			? Ts
			: S extends `${string}$${string}`
				? null
				: Lex<S> extends infer T
					? T extends Toks
						? ParseTargetList<T, 0, []> extends Ok<infer Cs, infer J>
							? T[J] extends undefined
								? Cs
								: null
							: null
						: null
					: null
		: null;

type GeneralTail<
	Ts,
	Rest extends string,
> = Rest extends `${string}${"--" | "/*"}${string}`
	? WholeTail<Ts, Rest>
	: LastOrder<Rest> extends [
				infer Body extends string,
				infer Order extends string,
			]
		? SplitOrder<Ts, Body, Order> extends infer S
			? [S] extends [never]
				? WholeTail<Ts, Rest>
				: S
			: never
		: WholeTail<Ts, Rest>;

/** Split at the final ORDER BY, leaving nested query ordering in the body. */
type LastOrder<S extends string> = [OrderTail<S>] extends [never]
	? never
	: OrderTail<S> extends infer Tail extends string
		? S extends `${infer Body}ORDER BY${Tail}`
			? [Body, Tail]
			: S extends `${infer Body}order by${Tail}`
				? [Body, Tail]
				: never
		: never;
type OrderTail<S extends string> =
	S extends `${infer Before}ORDER BY${infer After}`
		? Before extends `${string}${Ws}`
			? After extends `${Ws}${string}`
				? [OrderTail<After>] extends [never]
					? After
					: OrderTail<After>
				: never
			: never
		: S extends `${infer Before}order by${infer After}`
			? Before extends `${string}${Ws}`
				? After extends `${Ws}${string}`
					? [OrderTail<After>] extends [never]
						? After
						: OrderTail<After>
					: never
				: never
			: never;

type SplitOrder<Ts, Body extends string, Order extends string> =
	Lex<`FROM ${Body}`> extends infer BT
		? BT extends Toks
			? ParseSimpleAfterTargets<BT, 0, false, Ts> extends Ok<infer B, infer J>
				? BT[J] extends undefined
					? Lex<`ORDER BY${Order}`> extends infer OT
						? OT extends Toks
							? ParseSelectTail<OT, B, null, 0> extends Ok<
									infer Stmt,
									infer End
								>
								? OT[End] extends undefined
									? { stmt: Stmt; max: MaxParam<[...BT, ...OT]> }
									: never
								: never
							: never
						: never
					: never
				: never
			: never
		: never;

type WholeTail<Ts, Rest extends string> =
	Lex<`FROM ${Rest}`> extends infer T
		? T extends Toks
			? ParseSimpleAfterTargets<T, 0, false, Ts> extends Ok<infer Body, infer J>
				? ParseSelectTail<T, Body, null, J> extends Ok<infer Stmt, infer End>
					? T[End] extends undefined
						? { stmt: Stmt; max: MaxParam<T> }
						: never
					: never
				: never
			: never
		: never;

type Targets<
	S extends string,
	Acc extends readonly unknown[] = [],
> = Acc["length"] extends 64
	? null
	: S extends `${infer H},${infer R}`
		? Target<H> extends infer T
			? [T] extends [never]
				? null
				: Targets<R, [...Acc, T]>
			: null
		: Target<S> extends infer T
			? [T] extends [never]
				? null
				: [...Acc, T]
			: null;
type Target<S extends string> =
	TrimStart<S> extends `*${infer R}`
		? TargetAlias<StarNode<null>, R>
		: ReadName<TrimStart<S>> extends [
					infer N extends string,
					infer R extends string,
				]
			? TrimStart<R> extends `.${infer R2}`
				? TrimStart<R2> extends `*${infer Tail}`
					? TargetAlias<StarNode<N>, Tail>
					: ReadLabel<TrimStart<R2>> extends [
								infer C extends string,
								infer Tail extends string,
							]
						? TargetAlias<ColNode<N, C>, Tail>
						: never
				: TargetAlias<ColNode<null, N>, R>
			: never;
type TargetAlias<E, S extends string> =
	TrimStart<S> extends infer R extends string
		? R extends ""
			? TargetNode<E, null>
			: R extends `${"AS" | "as"}${Ws}${infer Tail}`
				? ReadLabel<TrimStart<Tail>> extends [infer A, infer End extends string]
					? TrimStart<End> extends ""
						? TargetNode<E, A>
						: never
					: never
				: ReadRaw<R> extends [
							infer A extends string,
							infer End extends string,
							infer Quoted,
						]
					? TrimStart<End> extends ""
						? Quoted extends true
							? TargetNode<E, A>
							: A extends NotBareLabel
								? never
								: TargetNode<E, A>
						: never
					: never
		: never;

/** Isolated names share the lexer; the bounded fallback consumes ASCII prefixes only. */
type NameChar = IdStart | Digit | "$";
type ReadName<S extends string> =
	ReadRaw<S> extends [infer N extends string, infer R, infer Quoted]
		? Quoted extends true
			? [N, R]
			: N extends NotColId
				? null
				: [N, R]
		: null;
type ReadLabel<S extends string> =
	ReadRaw<S> extends [infer N, infer R, unknown] ? [N, R] : null;
type ReadRaw<S extends string> = S extends `${infer N} ${infer R}`
	? NameOnly<N> extends [infer Name, infer Quoted]
		? [Name, ` ${R}`, Quoted]
		: ReadRawChars<S>
	: NameOnly<S> extends [infer Name, infer Quoted]
		? [Name, "", Quoted]
		: ReadRawChars<S>;
type NameOnly<S extends string> = S extends `"${string}"`
	? SingleName<Lex<S>>
	: S extends `${string}${NonIdAscii}${string}`
		? null
		: SingleName<Lex<S>>;
type SingleName<T> = T extends readonly [IdTok<infer N>]
	? [N, true]
	: T extends readonly [WordTok<infer N>]
		? [N, false]
		: null;

type ReadRawChars<S extends string> = S extends `"${infer N}"${infer R}`
	? R extends `"${string}`
		? null
		: N extends ""
			? null
			: AllNameChars<N> extends true
				? [N, R, true]
				: null
	: S extends `${infer C extends IdStart}${infer R}`
		? NameTail<R, C>
		: null;
type AllNameChars<S extends string, B extends number = 0> = B extends 128
	? false
	: S extends ""
		? true
		: S extends `${NameChar}${infer R}`
			? AllNameChars<R, Nx<B>>
			: false;
type NameTail<
	S extends string,
	Acc extends string,
	B extends number = 0,
> = B extends 128
	? null
	: S extends `${infer A}${infer C2}${infer C}${infer D}${infer R}`
		? [A | C2 | C | D] extends [NameChar]
			? NameTail<R, `${Acc}${A}${C2}${C}${D}`, Nx<B>>
			: NameTailOne<S, Acc, B>
		: NameTailOne<S, Acc, B>;
type NameTailOne<
	S extends string,
	Acc extends string,
	B extends number,
> = S extends `${infer C extends NameChar}${infer R}`
	? NameTail<R, `${Acc}${C}`, Nx<B>>
	: [Lowercase<Acc>, S, false];

type TrimStart<
	S extends string,
	B extends unknown[] = [],
> = B["length"] extends 128
	? S
	: S extends `${Ws}${infer R}`
		? TrimStart<R, [...B, 0]>
		: S;
