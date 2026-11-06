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

/** A user variable (`@name`) or system variable (`@@name`). */
type MyVar<V extends string, R extends string, G extends string> = {
	readonly k: "v";
	readonly v: V;
	readonly r: R;
	readonly g: G;
};

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

type Unrecognized<T extends string> =
	`You have an error in your SQL syntax near '${T}'`;

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

type Punct = "(" | ")" | "," | ";" | "~" | "+" | "*" | "%" | "^";

type LexStep<
	S extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = S extends `${infer C}${infer R}`
	? C extends Ws
		? LexChunk<R, Acc, B, `${G}${C}`>
		: C extends IdStart
			? LexLetter<C, R, Acc, B, G>
			: C extends Digit
				? LexNumber<S, Acc, B, G>
				: C extends Punct
					? LexChunk<R, [...Acc, Op<C, G>], B, "">
					: C extends "'" | '"'
						? LexString<R, C, C, "", Acc, B, G>
						: C extends "`"
							? LexQuoted<R, Acc, B, G>
							: C extends "."
								? R extends `${Digit}${string}`
									? LexNumber<S, Acc, B, G>
									: LexChunk<R, [...Acc, Op<".", G>], B, "">
								: LexSymbol<C, R, Acc, B, G>
	: never;

/** Letters: words, and the `x'…'`, `b'…'`, `n'…'` and `_charset'…'` literals. */
type LexLetter<
	C extends string,
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = C extends "x" | "X"
	? R extends `'${infer R1}`
		? LexHexString<R1, C, Acc, B, G>
		: LexWord<R, C, Acc, B, G>
	: C extends "b" | "B"
		? R extends `'${infer R1}`
			? LexBitString<R1, C, Acc, B, G>
			: LexWord<R, C, Acc, B, G>
		: C extends "n" | "N"
			? R extends `'${infer R1}`
				? LexString<R1, "'", `${C}'`, "", Acc, B, G>
				: LexWord<R, C, Acc, B, G>
			: C extends "_"
				? TakeWord<R, C> extends [
						infer W extends string,
						infer R2 extends string,
					]
					? R2 extends `${infer Q extends "'" | '"'}${infer R3}`
						? LexString<
								R3,
								Q,
								`${W}${Q}`,
								Lowercase<W> extends "_binary" ? "blob" : "",
								Acc,
								B,
								G
							>
						: LexChunk<R2, [...Acc, Word<Lowercase<W>, W, G>], B, "">
					: never
				: LexWord<R, C, Acc, B, G>;

type LexSymbol<
	C extends string,
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = C extends "-"
	? R extends `-${infer R1}`
		? R1 extends "" | `${Ws}${string}`
			? R1 extends `${infer Line}\n${infer R2}`
				? LexChunk<R2, Acc, B, `${G}--${Line}\n`>
				: LexChunk<"", Acc, B, `${G}--${R1}`>
			: LexChunk<R, [...Acc, Op<"-", G>], B, "">
		: R extends `>>${infer R1}`
			? LexChunk<R1, [...Acc, Op<"->>", G>], B, "">
			: R extends `>${infer R1}`
				? LexChunk<R1, [...Acc, Op<"->", G>], B, "">
				: LexChunk<R, [...Acc, Op<"-", G>], B, "">
	: C extends "#"
		? R extends `${infer Line}\n${infer R2}`
			? LexChunk<R2, Acc, B, `${G}#${Line}\n`>
			: LexChunk<"", Acc, B, `${G}#${R}`>
		: C extends "/"
			? R extends `*${infer R1}`
				? R1 extends `${infer Body}*/${infer R2}`
					? LexChunk<R2, Acc, B, `${G}/*${Body}*/`>
					: LexErr<"Unclosed comment", Acc>
				: LexChunk<R, [...Acc, Op<"/", G>], B, "">
			: C extends "|"
				? R extends `|${infer R1}`
					? LexChunk<R1, [...Acc, Op<"||", G>], B, "">
					: LexChunk<R, [...Acc, Op<"|", G>], B, "">
				: C extends "&"
					? R extends `&${infer R1}`
						? LexChunk<R1, [...Acc, Op<"&&", G>], B, "">
						: LexChunk<R, [...Acc, Op<"&", G>], B, "">
					: C extends "<"
						? R extends `=>${infer R1}`
							? LexChunk<R1, [...Acc, Op<"<=>", G>], B, "">
							: R extends `${infer O extends "=" | ">" | "<"}${infer R1}`
								? LexChunk<R1, [...Acc, Op<`<${O}`, G>], B, "">
								: LexChunk<R, [...Acc, Op<"<", G>], B, "">
						: C extends ">"
							? R extends `${infer O extends "=" | ">"}${infer R1}`
								? LexChunk<R1, [...Acc, Op<`>${O}`, G>], B, "">
								: LexChunk<R, [...Acc, Op<">", G>], B, "">
							: C extends "="
								? LexChunk<R, [...Acc, Op<"=", G>], B, "">
								: C extends "!"
									? R extends `=${infer R1}`
										? LexChunk<R1, [...Acc, Op<"!=", G>], B, "">
										: LexChunk<R, [...Acc, Op<"!", G>], B, "">
									: C extends ":"
										? R extends `=${infer R1}`
											? LexChunk<R1, [...Acc, Op<":=", G>], B, "">
											: LexErr<BadParam<`:${IdRun<R>}`>, Acc>
										: C extends "$"
											? LexDollar<R, Acc, B, G>
											: C extends "@"
												? LexVar<R, Acc, B, G>
												: C extends "?"
													? LexErr<BadParam<"?">, Acc>
													: C extends NonIdAscii
														? LexErr<Unrecognized<`${C}${Head<R>}`>, Acc>
														: LexWord<R, C, Acc, B, G>;

type Head<R extends string> =
	R extends `${infer A}${infer B}${infer C}${infer D}${infer E}${string}`
		? `${A}${B}${C}${D}${E}`
		: R;

type LexDollar<
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	DollarParam<R> extends [infer N extends number, infer R2 extends string]
		? LexChunk<R2, [...Acc, Param<N, "?", G>], B, "">
		: LexErr<DollarParam<R> & string, Acc>;

/** `@name`, `@'name'`, `@@name`, `@@session.name`. */
type LexVar<
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = R extends `@${infer R1}`
	? TakeWord<R1, ""> extends [infer N extends string, infer R2 extends string]
		? N extends ""
			? LexErr<Unrecognized<"@@">, Acc>
			: R2 extends `.${infer R3}`
				? TakeWord<R3, ""> extends [
						infer N2 extends string,
						infer R4 extends string,
					]
					? LexChunk<
							R4,
							[...Acc, MyVar<`@@${Lowercase<N2>}`, `@@${N}.${N2}`, G>],
							B,
							""
						>
					: never
				: LexChunk<R2, [...Acc, MyVar<`@@${Lowercase<N>}`, `@@${N}`, G>], B, "">
		: never
	: R extends `${infer Q extends "'" | '"' | "`"}${infer R1}`
		? R1 extends `${infer Body}${Q}${infer R2}`
			? LexChunk<
					R2,
					[...Acc, MyVar<`@${Lowercase<Body>}`, `@${Q}${Body}${Q}`, G>],
					B,
					""
				>
			: LexErr<Unrecognized<`@${Q}`>, Acc>
		: TakeWord<R, ""> extends [infer N extends string, infer R2 extends string]
			? N extends ""
				? LexErr<Unrecognized<"@">, Acc>
				: LexChunk<R2, [...Acc, MyVar<`@${Lowercase<N>}`, `@${N}`, G>], B, "">
			: never;

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

type LexHexString<
	R1 extends string,
	X extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = R1 extends `${infer Hex}'${infer R2}`
	? IsHex<Hex, true> extends true
		? LexChunk<R2, [...Acc, Blob<Hex, `${X}'${Hex}'`, G>], B, "">
		: LexErr<Unrecognized<`${X}'${Hex}'`>, Acc>
	: LexErr<Unrecognized<`${X}'${R1}`>, Acc>;

type LexBitString<
	R1 extends string,
	X extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = R1 extends `${infer Bits}'${infer R2}`
	? IsBits<Bits> extends true
		? LexChunk<R2, [...Acc, Blob<Bits, `${X}'${Bits}'`, G>], B, "">
		: LexErr<Unrecognized<`${X}'${Bits}'`>, Acc>
	: LexErr<Unrecognized<`${X}'${R1}`>, Acc>;
type IsBits<S extends string> = S extends `${infer C}${infer R}`
	? C extends "0" | "1"
		? IsBits<R>
		: false
	: true;

/**
 * A string in `Q` quotes, after the opening quote. `\` escapes the next
 * character and a doubled quote is one quote.
 */
type LexString<
	R extends string,
	Q extends string,
	Open extends string,
	Kind extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	TakeString<R, Q, "", ""> extends [
		infer V extends string,
		infer Raw extends string,
		infer R2 extends string,
	]
		? AdjacentString<R2> extends [
				infer V2 extends string,
				infer Raw2 extends string,
				infer R3 extends string,
			]
			? LexChunk<
					R3,
					[
						...Acc,
						Kind extends "blob"
							? Blob<`${V}${V2}`, `${Open}${Raw}${Q}${Raw2}`, G>
							: Str<`${V}${V2}`, `${Open}${Raw}${Q}${Raw2}`, G, V>,
					],
					B,
					""
				>
			: never
		: LexErr<Unrecognized<`${Open}${Head<R>}`>, Acc>;

/** MySQL joins adjacent string literals: `'a' 'b'` is `'ab'`. */
type AdjacentString<
	S extends string,
	V extends string = "",
	Raw extends string = "",
> =
	SkipWs<S, ""> extends [infer W extends string, infer R extends string]
		? R extends `${infer Q extends "'" | '"'}${infer R1}`
			? TakeString<R1, Q, "", ""> extends [
					infer V2 extends string,
					infer Raw2 extends string,
					infer R2 extends string,
				]
				? AdjacentString<R2, `${V}${V2}`, `${Raw}${W}${Q}${Raw2}${Q}`>
				: [V, Raw, S]
			: [V, Raw, S]
		: never;
type SkipWs<
	S extends string,
	W extends string,
> = S extends `${infer C extends Ws}${infer R}`
	? SkipWs<R, `${W}${C}`>
	: [W, S];

type TakeString<
	S extends string,
	Q extends string,
	V extends string,
	Raw extends string,
> = S extends `${infer A}${Q}${infer R}`
	? A extends `${infer B}\\${infer Rest}`
		? Rest extends `${infer E}${infer Rest2}`
			? TakeString<
					`${Rest2}${Q}${R}`,
					Q,
					`${V}${B}${Unescape<E>}`,
					`${Raw}${B}\\${E}`
				>
			: TakeString<R, Q, `${V}${B}${Q}`, `${Raw}${B}\\${Q}`>
		: R extends `${Q}${infer R2}`
			? TakeString<R2, Q, `${V}${A}${Q}`, `${Raw}${A}${Q}${Q}`>
			: [`${V}${A}`, `${Raw}${A}`, R]
	: null;

type Unescape<E extends string> = E extends "n"
	? "\n"
	: E extends "t"
		? "\t"
		: E extends "r"
			? "\r"
			: E extends "0"
				? "\u0000"
				: E extends "b"
					? "\b"
					: E extends "Z"
						? "\u001a"
						: E extends "%" | "_"
							? `\\${E}`
							: E;

type LexQuoted<
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	TakeQuoted<R, "`", ""> extends [
		infer V extends string,
		infer R2 extends string,
	]
		? V extends ""
			? LexErr<Unrecognized<"``">, Acc>
			: LexChunk<
					R2,
					[...Acc, Ident<Lowercase<V>, V, `\`${Escape<V, "`">}\``, G>],
					B,
					""
				>
		: LexErr<Unrecognized<`\`${Head<R>}`>, Acc>;

/**
 * A number, or a word that starts with digits (MySQL identifiers may), and the
 * `0x…` and `0b…` literals, which are binary strings.
 */
type LexNumber<
	S extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = S extends `0${infer P extends "x" | "b"}${infer R}`
	? (P extends "x" ? HexRun<R, ""> : BitRun<R, "">) extends [
			infer H extends string,
			infer R2 extends string,
		]
		? H extends ""
			? LexWord<R, `0${P}`, Acc, B, G>
			: IdRun<R2> extends ""
				? LexChunk<R2, [...Acc, Blob<H, `0${P}${H}`, G>], B, "">
				: LexWord<R, `0${P}`, Acc, B, G>
		: never
	: TakeDecimal<S> extends [infer V extends string, infer R2 extends string]
		? IdRun<R2> extends ""
			? LexChunk<R2, [...Acc, Num<V, G>], B, "">
			: V extends `${string}${"." | "e" | "E"}${string}`
				? LexErr<Unrecognized<`${V}${IdRun<R2>}`>, Acc>
				: LexWord<R2, V, Acc, B, G>
		: TakeDecimal<S> extends infer Bad extends string
			? LexErr<Unrecognized<Bad>, Acc>
			: never;
type HexRun<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends HexDigit}${infer R}`
	? HexRun<R, `${Acc}${C}`>
	: [Acc, S];
type BitRun<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends "0" | "1"}${infer R}`
	? BitRun<R, `${Acc}${C}`>
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
				? [V, S]
				: [`${V}${E}${X}`, R3]
			: never
	: [V, S];
