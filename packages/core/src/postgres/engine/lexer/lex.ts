import type {
	Digit,
	HexDigit,
	IdStart,
	NonIdAscii,
	Upper,
	Ws,
} from "../../../engine/chars.js";
import type {
	BitTok,
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	Tok,
	WordTok,
} from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type { Next } from "../../../sql/next.js";
import type {
	CheckEscapes,
	CheckUEscapes,
	DecodeU,
	UEscape,
} from "./unicode.js";

type Nx<I extends number> = Next[I];

export type Lex<Q extends string> = LexLines<Q, []>;

type LexLines<
	S extends string,
	Acc extends readonly unknown[],
	B extends number = 0,
> = B extends ChunkSize
	? LexCommas<S, Acc>
	: S extends `${infer Line}\n${infer Rest}`
		? CanSplitLine<Line, Rest> extends false
			? LexCommas<S, Acc>
			: LexCommas<Line, []> extends infer R
				? R extends readonly unknown[]
					? LexLines<Rest, [...Acc, ...R], Nx<B>>
					: LexCommas<S, Acc>
				: never
		: LexCommas<S, Acc>;

type LexCommas<
	S extends string,
	Acc extends readonly unknown[],
	B extends number = 0,
> = B extends ChunkSize
	? LexSpaces<S, Acc>
	: S extends `${infer Part},${infer Rest}`
		? Part extends `${string}--${string}`
			? LexSpaces<S, Acc>
			: LexSpaces<Part, []> extends infer R
				? R extends readonly unknown[]
					? LexCommas<Rest, [...Acc, ...R, OpTok<",">], Nx<B>>
					: LexSpaces<S, Acc>
				: never
		: LexSpaces<S, Acc>;

type LexSpaces<
	S extends string,
	Acc extends readonly unknown[],
	B extends number = 0,
> = B extends ChunkSize
	? LexAll<S, Acc>
	: S extends `${string}\n${string}`
		? LexAll<S, Acc>
		: S extends `${infer Part} ${infer Rest}`
			? Part extends `${string}${"--" | "U&" | "u&"}${string}`
				? LexAll<S, Acc>
				: LexAll<Part, []> extends infer R
					? R extends readonly unknown[]
						? LexSpaces<Rest, [...Acc, ...R], Nx<B>>
						: LexAll<S, Acc>
					: never
			: LexAll<S, Acc>;

type CanSplitLine<
	Line extends string,
	Rest extends string,
> = Line extends `${string}${"U&" | "u&"}${string}`
	? false
	: Line extends `${string}'${string}`
		? NextLineQuote<Rest> extends true
			? false
			: true
		: true;
type NextLineQuote<S extends string, B extends number = 0> = B extends ChunkSize
	? true
	: S extends `${Ws}${infer R}`
		? NextLineQuote<R, Nx<B>>
		: S extends `'${string}`
			? true
			: false;

type ChunkSize = 250;

type LexAll<S extends string, Acc extends readonly unknown[]> =
	LexChunk<S, [], 0> extends infer R
		? R extends ["done", infer T extends readonly unknown[]]
			? [...Acc, ...T]
			: R extends [
						"more",
						infer T extends readonly unknown[],
						infer Rest extends string,
					]
				? LexAll<Rest, [...Acc, ...T]>
				: R extends [
							"err",
							infer M extends string,
							infer T extends readonly unknown[],
						]
					? SqlError<M, [...Acc, ...T]["length"]>
					: never
		: never;

type LexChunk<
	S extends string,
	Acc extends readonly Tok[],
	B extends number,
> = S extends ""
	? ["done", Acc]
	: B extends ChunkSize
		? ["more", Acc, S]
		: LexStep<S, Acc, Nx<B>>;

type Err<M extends string, Acc extends readonly Tok[]> = ["err", M, Acc];

type Punct1 = "(" | ")" | "," | ";" | "[" | "]";
type OpChar =
	| "~"
	| "!"
	| "@"
	| "#"
	| "^"
	| "&"
	| "|"
	| "`"
	| "?"
	| "+"
	| "-"
	| "*"
	| "/"
	| "%"
	| "<"
	| ">"
	| "=";
type OpSpecial = "~" | "!" | "@" | "#" | "^" | "&" | "|" | "`" | "?" | "%";

type LexStep<
	S extends string,
	Acc extends readonly Tok[],
	B extends number,
> = S extends `${infer C}${infer R}`
	? C extends Ws
		? LexChunk<R, Acc, B>
		: C extends IdStart
			? R extends `${infer Q extends "'" | "&"}${infer R1}`
				? Q extends "'"
					? C extends "E" | "e"
						? LexEString<R1, Acc, B, S>
						: C extends "B" | "b" | "X" | "x"
							? LexBitString<
									TakeString<R1, "">,
									Acc,
									B,
									C extends "B" | "b" ? "binary" : "hexadecimal",
									S
								>
							: C extends "N" | "n"
								? LexChunk<R, [...Acc, WordTok<"nchar">], B>
								: LexWord<R, C, Acc, B>
					: C extends "U" | "u"
						? R1 extends `'${infer R2}`
							? LexUString<R2, Acc, B, S>
							: R1 extends `"${infer R2}`
								? LexUIdent<R2, Acc, B, S>
								: LexWord<R, C, Acc, B>
						: LexWord<R, C, Acc, B>
				: LexWord<R, C, Acc, B>
			: C extends Digit
				? LexShortInt<S, R, C, Acc, B, []>
				: C extends Punct1
					? LexChunk<R, [...Acc, OpTok<C>], B>
					: C extends OpChar
						? LexOperator<C, R, Acc, B>
						: C extends ":"
							? R extends `:${infer R2}`
								? LexChunk<R2, [...Acc, OpTok<"::">], B>
								: R extends `=${infer R2}`
									? LexChunk<R2, [...Acc, OpTok<":=">], B>
									: LexChunk<R, [...Acc, OpTok<":">], B>
							: C extends "."
								? R extends `${Digit}${string}`
									? LexNumber<S, Acc, B>
									: LexChunk<R, [...Acc, OpTok<".">], B>
								: C extends '"'
									? TakeQuoted<R, '"', ""> extends [
											infer V extends string,
											infer R2 extends string,
										]
										? V extends ""
											? Err<ZeroLength, Acc>
											: LexChunk<R2, [...Acc, IdTok<V>], B>
										: Err<
												`unterminated quoted identifier at or near "${S}"`,
												Acc
											>
									: C extends "'"
										? LexString<
												TakeString<R, "">,
												Acc,
												B,
												`unterminated quoted string at or near "${S}"`
											>
										: C extends "$"
											? R extends `${infer D extends Digit}${infer R1}`
												? TakeDigits<R1, D> extends [
														infer V extends string,
														infer R2 extends string,
													]
													? JunkAt<R2> extends infer J extends string
														? Err<
																`trailing junk after parameter at or near "$${V}${J}"`,
																Acc
															>
														: LexChunk<R2, [...Acc, ParamTok<ToNum<V>>], B>
													: never
												: R extends `${infer Tag}$${infer R1}`
													? Tag extends `${IdStart}${string}` | ""
														? R1 extends `${infer Body}$${Tag}$${infer R2}`
															? LexChunk<R2, [...Acc, StrTok<Body>], B>
															: Err<
																	`unterminated dollar-quoted string at or near "${S}"`,
																	Acc
																>
														: Err<`syntax error at or near "$"`, Acc>
													: Err<`syntax error at or near "$"`, Acc>
											: C extends NonIdAscii
												? Err<`syntax error at or near "${C}"`, Acc>
												: LexWord<R, C, Acc, B>
	: never;

type LexString<
	X,
	Acc extends readonly Tok[],
	B extends number,
	M extends string,
> = X extends [infer V extends string, infer R2 extends string]
	? LexChunk<R2, [...Acc, StrTok<V>], B>
	: Err<M, Acc>;

type LexBitString<
	X,
	Acc extends readonly Tok[],
	B extends number,
	Radix extends "binary" | "hexadecimal",
	S extends string,
> = X extends [infer V extends string, infer R2 extends string]
	? NotDigit<
			V,
			Radix extends "binary" ? "0" | "1" : HexDigit
		> extends infer D extends string
		? Err<`"${D}" is not a valid ${Radix} digit`, Acc>
		: LexChunk<R2, [...Acc, BitTok<V>], B>
	: Err<
			`unterminated ${Radix extends "binary" ? "bit" : "hexadecimal"} string literal at or near "${S}"`,
			Acc
		>;
type NotDigit<
	V extends string,
	D extends string,
> = V extends `${infer C}${infer R}`
	? C extends D
		? NotDigit<R, D>
		: C
	: null;

type LexEString<
	R1 extends string,
	Acc extends readonly Tok[],
	B extends number,
	S extends string,
> =
	TakeEString<R1, ""> extends [infer V extends string, infer R2 extends string]
		? CheckEscapes<V> extends infer M extends string
			? Err<M, Acc>
			: LexChunk<R2, [...Acc, StrTok<V>], B>
		: Err<`unterminated quoted string at or near "${S}"`, Acc>;

type LexUString<
	R1 extends string,
	Acc extends readonly Tok[],
	B extends number,
	S extends string,
> =
	TakeString<R1, ""> extends [infer V extends string, infer R2 extends string]
		? UEscape<R2> extends infer U
			? U extends [infer E extends string, infer R3 extends string]
				? CheckUEscapes<V, E> extends infer M extends string
					? Err<M, Acc>
					: LexChunk<R3, [...Acc, StrTok<V>], B>
				: Err<U & string, Acc>
			: never
		: Err<`unterminated quoted string at or near "${S}"`, Acc>;

type LexUIdent<
	R1 extends string,
	Acc extends readonly Tok[],
	B extends number,
	S extends string,
> =
	TakeQuoted<R1, '"', ""> extends [
		infer V extends string,
		infer R2 extends string,
	]
		? V extends ""
			? Err<'zero-length delimited identifier at or near "U&"""', Acc>
			: UEscape<R2> extends infer U
				? U extends [infer E extends string, infer R3 extends string]
					? CheckUEscapes<V, E> extends infer M extends string
						? Err<M, Acc>
						: LexChunk<R3, [...Acc, IdTok<DecodeU<V, E>>], B>
					: Err<U & string, Acc>
				: never
		: Err<`unterminated quoted identifier at or near "${S}"`, Acc>;

type ZeroLength = 'zero-length delimited identifier at or near """"';

type LexShortInt<
	S0 extends string,
	R extends string,
	V extends string,
	Acc extends readonly Tok[],
	B extends number,
	K extends readonly unknown[],
> = R extends `${infer N}${infer R2}`
	? N extends Digit
		? K extends readonly [0, 0, 0]
			? LexNumber<S0, Acc, B>
			: LexShortInt<S0, R2, `${V}${N}`, Acc, B, [...K, 0]>
		: N extends "."
			? LexNumber<S0, Acc, B>
			: N extends NonIdAscii
				? LexChunk<R, [...Acc, NumTok<V>], B>
				: LexNumber<S0, Acc, B>
	: LexChunk<R, [...Acc, NumTok<V>], B>;

type LexNumber<S extends string, Acc extends readonly Tok[], B extends number> =
	TakeNumber<S> extends infer N
		? N extends [infer V extends string, infer R2 extends string]
			? JunkAt<R2> extends infer J extends string
				? Err<`trailing junk after numeric literal at or near "${V}${J}"`, Acc>
				: LexChunk<R2, [...Acc, NumTok<V>], B>
			: Err<N & string, Acc>
		: never;

type JunkAt<R extends string> = R extends `${infer C}${infer R1}`
	? C extends NonIdAscii | Digit | "$"
		? null
		: `${C}${IdRun<R1>}`
	: null;
type IdRun<
	R extends string,
	Acc extends string = "",
> = R extends `${infer C}${infer R1}`
	? C extends NonIdAscii
		? Acc
		: IdRun<R1, `${Acc}${C}`>
	: Acc;

type LexWord<
	R extends string,
	C extends string,
	Acc extends readonly Tok[],
	B extends number,
> =
	TakeWord<R, C extends Upper ? Lowercase<C> : C> extends [
		infer V extends string,
		infer R2 extends string,
	]
		? LexChunk<R2, [...Acc, WordTok<V>], B>
		: never;

type LexOperator<
	C extends string,
	R extends string,
	Acc extends readonly Tok[],
	B extends number,
> = R extends `${infer N}${infer R1}`
	? N extends OpChar
		? C extends "-"
			? N extends "-"
				? LexChunk<SkipLine<R1>, Acc, B>
				: LexOpRun<C, R, Acc, B>
			: C extends "/"
				? N extends "*"
					? SkipBlock<R1, [0]> extends infer R2
						? R2 extends string
							? LexChunk<R2, Acc, B>
							: Err<`unterminated /* comment at or near "${C}${R}"`, Acc>
						: never
					: LexOpRun<C, R, Acc, B>
				: LexOpRun<C, R, Acc, B>
		: LexChunk<R, [...Acc, OpTok<C>], B>
	: LexChunk<R, [...Acc, OpTok<C>], B>;
type LexOpRun<
	C extends string,
	R extends string,
	Acc extends readonly Tok[],
	B extends number,
> =
	OpRun<R, C> extends [infer O extends string, infer R2 extends string]
		? TrimOp<O, R2> extends [infer O2 extends string, infer R3 extends string]
			? LexChunk<R3, [...Acc, OpTok<O2>], B>
			: never
		: never;
type OpRun<
	S extends string,
	Acc extends string,
> = S extends `${infer C}${infer R}`
	? C extends OpChar
		? C extends "-"
			? R extends `-${string}`
				? [Acc, S]
				: OpRun<R, `${Acc}${C}`>
			: C extends "/"
				? R extends `*${string}`
					? [Acc, S]
					: OpRun<R, `${Acc}${C}`>
				: OpRun<R, `${Acc}${C}`>
		: [Acc, S]
	: [Acc, S];
type TrimOp<O extends string, R extends string> = O extends `${infer P}+`
	? P extends ""
		? [O, R]
		: P extends `${string}${OpSpecial}${string}`
			? [O, R]
			: TrimOp<P, `+${R}`>
	: O extends `${infer P}-`
		? P extends ""
			? [O, R]
			: P extends `${string}${OpSpecial}${string}`
				? [O, R]
				: TrimOp<P, `-${R}`>
		: [O, R];

type SkipLine<S extends string> = S extends `${infer _}\n${infer R}` ? R : "";

type SkipBlock<
	S extends string,
	Depth extends readonly unknown[],
> = S extends `${infer Pre}*/${infer R}`
	? CountOpens<Pre, Depth> extends readonly [unknown, ...infer D2]
		? D2 extends readonly []
			? R
			: SkipBlock<R, D2>
		: never
	: null;
type CountOpens<
	S extends string,
	Depth extends readonly unknown[],
> = S extends `${string}/*${infer R}` ? CountOpens<R, [...Depth, 0]> : Depth;

type TakeQuoted<
	S extends string,
	Qc extends string,
	Acc extends string,
> = S extends `${infer Body}${Qc}${infer R}`
	? R extends `${Qc}${infer R2}`
		? TakeQuoted<R2, Qc, `${Acc}${Body}${Qc}`>
		: [`${Acc}${Body}`, R]
	: null;

type TakeEscaped<
	S extends string,
	Acc extends string,
> = S extends `${infer Body}'${infer R}`
	? OddBackslashes<Body> extends true
		? TakeEscaped<R, `${Acc}${Body}'`>
		: R extends `'${infer R2}`
			? TakeEscaped<R2, `${Acc}${Body}'`>
			: [`${Acc}${Body}`, R]
	: null;
type OddBackslashes<S extends string> = S extends `${infer P}\\`
	? OddBackslashes<P> extends true
		? false
		: true
	: false;

type TakeString<S extends string, Acc extends string> =
	TakeQuoted<S, "'", ""> extends [
		infer V extends string,
		infer R extends string,
	]
		? Continuation<R> extends infer R1 extends string
			? TakeString<R1, `${Acc}${V}`>
			: [`${Acc}${V}`, R]
		: null;
type TakeEString<S extends string, Acc extends string> =
	TakeEscaped<S, ""> extends [infer V extends string, infer R extends string]
		? Continuation<R> extends infer R1 extends string
			? TakeEString<R1, `${Acc}${V}`>
			: [`${Acc}${V}`, R]
		: null;
type Continuation<R extends string> = R extends `${infer W}'${infer R1}`
	? W extends `${string}\n${string}`
		? AllWs<W> extends true
			? R1
			: null
		: null
	: null;
type AllWs<W extends string> = W extends `${infer C}${infer R}`
	? C extends Ws
		? AllWs<R>
		: false
	: true;

type TakeWord<
	S extends string,
	Acc extends string,
> = S extends `${infer A}${infer B}${infer C}${infer D}${infer R}`
	? A extends NonIdAscii
		? [Acc, S]
		: B extends NonIdAscii
			? [`${Acc}${FoldChar<A>}`, `${B}${C}${D}${R}`]
			: C extends NonIdAscii
				? [`${Acc}${FoldChar<A>}${FoldChar<B>}`, `${C}${D}${R}`]
				: D extends NonIdAscii
					? [`${Acc}${FoldChar<A>}${FoldChar<B>}${FoldChar<C>}`, `${D}${R}`]
					: TakeWord<
							R,
							`${Acc}${FoldChar<A>}${FoldChar<B>}${FoldChar<C>}${FoldChar<D>}`
						>
	: S extends `${infer C}${infer R}`
		? C extends NonIdAscii
			? [Acc, S]
			: TakeWord<R, `${Acc}${FoldChar<C>}`>
		: [Acc, S];

type FoldChar<C extends string> = C extends Upper ? Lowercase<C> : C;

type TakeDigits<
	S extends string,
	Acc extends string,
> = S extends `${infer C}${infer R}`
	? C extends Digit
		? TakeDigits<R, `${Acc}${C}`>
		: [Acc, S]
	: [Acc, S];

type TakeNumber<S extends string> =
	S extends `0${infer P extends "x" | "X" | "o" | "O" | "b" | "B"}${infer R}`
		? Lowercase<P> extends "x"
			? TakeRadix<R, HexDigit, `0${P}`, "hexadecimal">
			: Lowercase<P> extends "o"
				? TakeRadix<R, OctDigit, `0${P}`, "octal">
				: TakeRadix<R, "0" | "1", `0${P}`, "binary">
		: TakeDecimal<S>;
type OctDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
type TakeRadix<
	S extends string,
	D extends string,
	Acc extends string,
	Kind extends string,
> = S extends `${infer C extends D}${infer R}`
	? TakeRadix<R, D, `${Acc}${C}`, Kind>
	: S extends `_${infer C extends D}${infer R}`
		? TakeRadix<R, D, `${Acc}_${C}`, Kind>
		: RadixEnd<Acc, S, IdRun<S>, Kind>;
type RadixEnd<
	Acc extends string,
	S extends string,
	J extends string,
	Kind extends string,
> = Acc extends `0${infer _P}${infer _D}${infer _R}`
	? J extends ""
		? [Acc, S]
		: `trailing junk after numeric literal at or near "${Acc}${J}"`
	: J extends "" | "_"
		? `invalid ${Kind} integer at or near "${Acc}${J}"`
		: `trailing junk after numeric literal at or near "${Acc}${J}"`;
type TakeDecimal<S extends string> =
	DigitRun<S, ""> extends [infer Int extends string, infer R1 extends string]
		? R1 extends `.${infer R2}`
			? R2 extends `.${string}`
				? [Int, R1]
				: DigitRun<R2, ""> extends [
							infer Frac extends string,
							infer R3 extends string,
						]
					? TakeExponent<`${Int}.${Frac}`, R3>
					: never
			: TakeExponent<Int, R1>
		: never;
type DigitRun<
	S extends string,
	Acc extends string,
> = S extends `${infer A extends Digit}${infer R}`
	? R extends `${infer B}${infer C}${infer D}${infer R2}`
		? [B | C | D] extends [Digit]
			? DigitRun<R2, `${Acc}${A}${B}${C}${D}`>
			: DigitRun<R, `${Acc}${A}`>
		: DigitRun<R, `${Acc}${A}`>
	: Acc extends ""
		? [Acc, S]
		: S extends `_${infer A extends Digit}${infer R}`
			? DigitRun<R, `${Acc}_${A}`>
			: [Acc, S];
type TakeExponent<
	V extends string,
	S extends string,
> = S extends `${infer E extends "e" | "E"}${infer R}`
	? R extends `${infer Sign extends "+" | "-"}${infer R2}`
		? DigitRun<R2, ""> extends [infer X extends string, infer R3]
			? X extends ""
				? `trailing junk after numeric literal at or near "${V}${E}${Sign}"`
				: [`${V}${E}${Sign}${X}`, R3]
			: never
		: DigitRun<R, ""> extends [infer X extends string, infer R3]
			? X extends ""
				? `trailing junk after numeric literal at or near "${V}${E}${IdRun<R>}"`
				: [`${V}${E}${X}`, R3]
			: never
	: [V, S];

type ToNum<S extends string> = S extends `${infer N extends number}`
	? N
	: never;
