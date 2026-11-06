import type { Next } from "../../../engine/next.js";
import type { Ok, Tok, Toks } from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type {
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	WordTok,
} from "../lexer/tokens.js";
import type { NotColId, TypeFuncNameKeyword } from "./keywords.js";

export type Ident<T extends Toks, I extends number> =
	IdentName<T[I]> extends infer V extends string ? [V, Next<I>] : null;

type IdentName<H> =
	H extends IdTok<infer V>
		? V
		: H extends WordTok<infer V>
			? V extends NotColId
				? null
				: V
			: null;

export type QualName<T extends Toks, I extends number> =
	Ident<T, I> extends [infer A extends string, infer I1 extends number]
		? QualParts<T, I1, [A]>
		: null;
type QualParts<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	EatOp<T, I, "."> extends never
		? [Acc, I]
		: AnyLabel<T, Next<I>> extends [
					infer B extends string,
					infer J extends number,
				]
			? Acc extends readonly [unknown, unknown]
				? [[...Acc, B], J]
				: QualParts<T, J, [...Acc, B]>
			: [Acc, I];

export type FuncName<T extends Toks, I extends number> =
	FuncKeyword<T[I]> extends infer V extends string
		? T[Next<I>] extends OpTok<"(">
			? [[V], Next<I>]
			: null
		: QualName<T, I>;
type FuncKeyword<H> =
	H extends WordTok<infer V extends TypeFuncNameKeyword> ? V : null;

export type SkipFirst<
	T extends Toks,
	I extends number,
	Alts extends readonly (readonly string[])[],
> = Alts extends readonly [
	infer W extends readonly string[],
	...infer R extends readonly (readonly string[])[],
]
	? EatWords<T, I, W> extends never
		? SkipFirst<T, I, R>
		: EatWords<T, I, W>
	: I;

export type Close<T extends Toks, I extends number, N, C extends string = ")"> =
	EatOp<T, I, C> extends never ? Expected<`"${C}"`, T, I> : Ok<N, Next<I>>;

export type ParenIdentList<T extends Toks, I extends number> =
	EatOp<T, I, "("> extends never
		? Expected<'"("', T, I>
		: IdentListLoop<T, Next<I>, []>;
type IdentListLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatOp<T, J, ","> extends never
			? EatOp<T, J, ")"> extends never
				? Expected<'"," or ")"', T, J>
				: Ok<[...Acc, N], Next<J>>
			: IdentListLoop<T, Next<J>, [...Acc, N]>
		: Expected<"identifier", T, I>;

export type { AtEnd, Ok } from "../../../engine/tokens.js";

export type Nx2<I extends number> = Next<Next<I>>;
export type Nx3<I extends number> = Next<Nx2<I>>;

export type Fail<Message extends string, I extends number> = SqlError<
	Message,
	I
>;

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

export type EatWord<
	T extends Toks,
	I extends number,
	W extends string,
> = T[I] extends { readonly k: "w"; readonly v: W } ? Next<I> : never;
export type EatOp<
	T extends Toks,
	I extends number,
	O extends string,
> = T[I] extends { readonly k: "o"; readonly v: O } ? Next<I> : never;
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
export type SkipWord<T extends Toks, I extends number, W extends string> =
	EatWord<T, I, W> extends never ? I : EatWord<T, I, W>;
export type SkipWords<
	T extends Toks,
	I extends number,
	Ws extends readonly string[],
> = EatWords<T, I, Ws> extends never ? I : EatWords<T, I, Ws>;

export type AnyLabel<T extends Toks, I extends number> =
	LabelName<T[I]> extends infer V extends string ? [V, Next<I>] : null;
type LabelName<H> = H extends IdTok<infer V> | WordTok<infer V> ? V : null;

export type SkipToCloseParen<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[] = [],
> =
	T[I] extends OpTok<"(">
		? SkipToCloseParen<T, Next<I>, [...Depth, 0]>
		: T[I] extends OpTok<")">
			? Depth extends readonly [unknown, ...infer D2]
				? SkipToCloseParen<T, Next<I>, D2>
				: Next<I>
			: T[I] extends Tok
				? SkipToCloseParen<T, Next<I>, Depth>
				: SyntaxErrorAt<T, I>;
