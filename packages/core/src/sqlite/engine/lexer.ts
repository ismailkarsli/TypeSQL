import type {
	Digit,
	HexDigit,
	IdRun,
	IdStart,
	NonIdAscii,
	Ws,
} from "../../engine/chars.js";
import type {
	BadParam,
	Blob,
	ChunkSize,
	DollarParam,
	Escape,
	Ident,
	IsHex,
	LexErr,
	Num,
	Op,
	Param,
	Str,
	TakeQuoted,
	TakeWord,
	Word,
} from "../../engine/family/lex.js";
import type { Next } from "../../engine/next.js";
import type { SqlError } from "../../errors.js";

export type Lex<Q extends string> = LexAll<Q, [], "">;

type LexAll<
	S extends string,
	Acc extends readonly unknown[],
	G extends string,
> =
	LexChunk<S, [], 0, G> extends infer R
		? R extends ["done", infer T extends readonly unknown[]]
			? [...Acc, ...T]
			: R extends [
						"more",
						infer T extends readonly unknown[],
						infer Rest extends string,
						infer G2 extends string,
					]
				? LexAll<Rest, [...Acc, ...T], G2>
				: R extends [
							"err",
							infer M extends string,
							infer T extends readonly unknown[],
						]
					? SqlError<M, [...Acc, ...T]["length"]>
					: never
		: never;

type Unrecognized<T extends string> = `unrecognized token: "${T}"`;

type LexChunk<
	S extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = S extends ""
	? ["done", Acc]
	: B extends ChunkSize
		? ["more", Acc, S, G]
		: LexStep<S, Acc, Next<B>, G>;

type Punct = "(" | ")" | "," | ";" | "~" | "&" | "+" | "*" | "%";

type LexStep<
	S extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = S extends `${infer C}${infer R}`
	? C extends Ws
		? LexChunk<R, Acc, B, `${G}${C}`>
		: C extends IdStart
			? C extends "x" | "X"
				? R extends `'${infer R1}`
					? LexBlob<R1, C, Acc, B, G>
					: LexWord<R, C, Acc, B, G>
				: LexWord<R, C, Acc, B, G>
			: C extends Digit
				? LexNumber<S, Acc, B, G>
				: C extends Punct
					? LexChunk<R, [...Acc, Op<C, G>], B, "">
					: C extends "'"
						? LexString<R, Acc, B, G>
						: C extends '"' | "`"
							? LexQuoted<R, C, C, Acc, B, G>
							: C extends "["
								? LexQuoted<R, "[", "]", Acc, B, G>
								: C extends "."
									? R extends `${Digit}${string}`
										? LexNumber<S, Acc, B, G>
										: LexChunk<R, [...Acc, Op<".", G>], B, "">
									: LexSymbol<C, R, Acc, B, G>
	: never;

type LexSymbol<
	C extends string,
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = C extends "-"
	? R extends `-${infer R1}`
		? R1 extends `${infer Line}\n${infer R2}`
			? LexChunk<R2, Acc, B, `${G}--${Line}\n`>
			: LexChunk<"", Acc, B, `${G}--${R1}`>
		: R extends `>>${infer R1}`
			? LexChunk<R1, [...Acc, Op<"->>", G>], B, "">
			: R extends `>${infer R1}`
				? LexChunk<R1, [...Acc, Op<"->", G>], B, "">
				: LexChunk<R, [...Acc, Op<"-", G>], B, "">
	: C extends "/"
		? R extends `*${infer R1}`
			? R1 extends `${infer Body}*/${infer R2}`
				? LexChunk<R2, Acc, B, `${G}/*${Body}*/`>
				: LexChunk<"", Acc, B, `${G}/*${R1}`>
			: LexChunk<R, [...Acc, Op<"/", G>], B, "">
		: C extends "|"
			? R extends `|${infer R1}`
				? LexChunk<R1, [...Acc, Op<"||", G>], B, "">
				: LexChunk<R, [...Acc, Op<"|", G>], B, "">
			: C extends "<"
				? R extends `${infer O extends "=" | ">" | "<"}${infer R1}`
					? LexChunk<R1, [...Acc, Op<`<${O}`, G>], B, "">
					: LexChunk<R, [...Acc, Op<"<", G>], B, "">
				: C extends ">"
					? R extends `${infer O extends "=" | ">"}${infer R1}`
						? LexChunk<R1, [...Acc, Op<`>${O}`, G>], B, "">
						: LexChunk<R, [...Acc, Op<">", G>], B, "">
					: C extends "="
						? R extends `=${infer R1}`
							? LexChunk<R1, [...Acc, Op<"==", G>], B, "">
							: LexChunk<R, [...Acc, Op<"=", G>], B, "">
						: C extends "!"
							? R extends `=${infer R1}`
								? LexChunk<R1, [...Acc, Op<"!=", G>], B, "">
								: LexErr<Unrecognized<"!">, Acc>
							: C extends "$"
								? LexDollar<R, Acc, B, G>
								: C extends "?" | "@" | ":"
									? LexErr<BadParam<`${C}${IdRun<R>}`>, Acc>
									: C extends NonIdAscii
										? LexErr<Unrecognized<C>, Acc>
										: LexWord<R, C, Acc, B, G>;

type LexDollar<
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	DollarParam<R> extends [infer N extends number, infer R2 extends string]
		? LexChunk<R2, [...Acc, Param<N, `$${N}`, G>], B, "">
		: LexErr<DollarParam<R> & string, Acc>;

type LexWord<
	R extends string,
	C extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	TakeWord<R, C> extends [infer W extends string, infer R2 extends string]
		? LexChunk<R2, [...Acc, Word<Lowercase<W>, W, G>], B, "">
		: never;

type LexBlob<
	R1 extends string,
	X extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = R1 extends `${infer Hex}'${infer R2}`
	? IsHex<Hex, true> extends true
		? IdRun<R2> extends ""
			? LexChunk<R2, [...Acc, Blob<Hex, `${X}'${Hex}'`, G>], B, "">
			: LexErr<Unrecognized<`${X}'${Hex}'${IdRun<R2>}`>, Acc>
		: LexErr<Unrecognized<`${X}'${Hex}'`>, Acc>
	: LexErr<Unrecognized<`${X}'${R1}`>, Acc>;

type LexString<
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	TakeQuoted<R, "'", ""> extends [
		infer V extends string,
		infer R2 extends string,
	]
		? LexChunk<R2, [...Acc, Str<V, `'${Escape<V, "'">}'`, G>], B, "">
		: LexErr<Unrecognized<`'${R}`>, Acc>;

type LexQuoted<
	R extends string,
	Open extends string,
	Close extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = (
	Close extends "]"
		? R extends `${infer V}]${infer R2}`
			? [V, R2]
			: null
		: TakeQuoted<R, Close, "">
) extends [infer V extends string, infer R2 extends string]
	? LexChunk<
			R2,
			[
				...Acc,
				Ident<
					Lowercase<V>,
					V,
					`${Open}${Close extends "]" ? V : Escape<V, Close>}${Close}`,
					G
				>,
			],
			B,
			""
		>
	: LexErr<Unrecognized<`${Open}${R}`>, Acc>;

type LexNumber<
	S extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	TakeNumber<S> extends [infer V extends string, infer R2 extends string]
		? IdRun<R2> extends ""
			? LexChunk<R2, [...Acc, Num<V, G>], B, "">
			: LexErr<Unrecognized<`${V}${IdRun<R2>}`>, Acc>
		: TakeNumber<S> extends infer Bad extends string
			? LexErr<Unrecognized<Bad>, Acc>
			: never;

type TakeNumber<S extends string> =
	S extends `0${infer P extends "x" | "X"}${infer R}`
		? HexRun<R, ""> extends [infer H extends string, infer R2 extends string]
			? H extends ""
				? `0${P}${IdRun<R>}`
				: [`0${P}${H}`, R2]
			: never
		: TakeDecimal<S>;
type HexRun<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends HexDigit}${infer R}`
	? HexRun<R, `${Acc}${C}`>
	: S extends `_${infer C extends HexDigit}${infer R}`
		? Acc extends ""
			? [Acc, S]
			: HexRun<R, `${Acc}_${C}`>
		: [Acc, S];
type TakeDecimal<S extends string> =
	DigitRun<S, ""> extends [infer Int extends string, infer R1 extends string]
		? R1 extends `.${infer R2}`
			? DigitRun<R2, ""> extends [
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
	? DigitRun<R, `${Acc}${A}`>
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
		? DigitRun<R2, ""> extends [infer X extends string, infer R3 extends string]
			? X extends ""
				? `${V}${E}${Sign}${IdRun<R2>}`
				: [`${V}${E}${Sign}${X}`, R3]
			: never
		: DigitRun<R, ""> extends [infer X extends string, infer R3 extends string]
			? X extends ""
				? `${V}${E}${IdRun<R>}`
				: [`${V}${E}${X}`, R3]
			: never
	: [V, S];
