import type { SqlError } from "../errors.js";
import type { Next } from "../sql/next.js";
import type {
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	Tok,
	Toks,
	WordTok,
} from "./tokens.js";

export type Ok<N, J extends number> = readonly [N, J];

export type Nx<I extends number> = Next[I];
export type Nx2<I extends number> = Nx<Nx<I>>;
export type Nx3<I extends number> = Nx<Nx2<I>>;

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

export type AtEnd<T extends Toks, I extends number> = T[I] extends Tok
	? false
	: true;

export type EatWord<T extends Toks, I extends number, W extends string> =
	T[I] extends WordTok<W> ? Nx<I> : never;
export type EatOp<T extends Toks, I extends number, O extends string> =
	T[I] extends OpTok<O> ? Nx<I> : never;
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
	LabelName<T[I]> extends infer V extends string ? [V, Nx<I>] : null;
type LabelName<H> = H extends IdTok<infer V> | WordTok<infer V> ? V : null;

export type SkipToCloseParen<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[] = [],
> =
	T[I] extends OpTok<"(">
		? SkipToCloseParen<T, Nx<I>, [...Depth, 0]>
		: T[I] extends OpTok<")">
			? Depth extends readonly [unknown, ...infer D2]
				? SkipToCloseParen<T, Nx<I>, D2>
				: Nx<I>
			: T[I] extends Tok
				? SkipToCloseParen<T, Nx<I>, Depth>
				: SyntaxErrorAt<T, I>;
