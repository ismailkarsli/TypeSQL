import type {
	Digit,
	HexDigit,
	IdStart,
	NonIdAscii,
	Ws,
} from "../../engine/chars.js";
import type { SqlError } from "../../errors.js";
import type { Next } from "../../sql/next.js";
import type {
	SqBlob,
	SqIdent,
	SqNum,
	SqOp,
	SqParam,
	SqStr,
	SqWord,
} from "./tokens.js";

type Nx<I extends number> = Next[I];

export type Lex<Q extends string> = LexAll<Q, [], "">;

type ChunkSize = 200;

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

type Err<M extends string, Acc extends readonly unknown[]> = ["err", M, Acc];
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
		: LexStep<S, Acc, Nx<B>, G>;

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
					? LexChunk<R, [...Acc, SqOp<C, G>], B, "">
					: C extends "'"
						? LexString<R, Acc, B, G>
						: C extends '"' | "`"
							? LexQuoted<R, C, C, Acc, B, G>
							: C extends "["
								? LexQuoted<R, "[", "]", Acc, B, G>
								: C extends "."
									? R extends `${Digit}${string}`
										? LexNumber<S, Acc, B, G>
										: LexChunk<R, [...Acc, SqOp<".", G>], B, "">
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
			? LexChunk<R1, [...Acc, SqOp<"->>", G>], B, "">
			: R extends `>${infer R1}`
				? LexChunk<R1, [...Acc, SqOp<"->", G>], B, "">
				: LexChunk<R, [...Acc, SqOp<"-", G>], B, "">
	: C extends "/"
		? R extends `*${infer R1}`
			? R1 extends `${infer Body}*/${infer R2}`
				? LexChunk<R2, Acc, B, `${G}/*${Body}*/`>
				: LexChunk<"", Acc, B, `${G}/*${R1}`>
			: LexChunk<R, [...Acc, SqOp<"/", G>], B, "">
		: C extends "|"
			? R extends `|${infer R1}`
				? LexChunk<R1, [...Acc, SqOp<"||", G>], B, "">
				: LexChunk<R, [...Acc, SqOp<"|", G>], B, "">
			: C extends "<"
				? R extends `${infer O extends "=" | ">" | "<"}${infer R1}`
					? LexChunk<R1, [...Acc, SqOp<`<${O}`, G>], B, "">
					: LexChunk<R, [...Acc, SqOp<"<", G>], B, "">
				: C extends ">"
					? R extends `${infer O extends "=" | ">"}${infer R1}`
						? LexChunk<R1, [...Acc, SqOp<`>${O}`, G>], B, "">
						: LexChunk<R, [...Acc, SqOp<">", G>], B, "">
					: C extends "="
						? R extends `=${infer R1}`
							? LexChunk<R1, [...Acc, SqOp<"==", G>], B, "">
							: LexChunk<R, [...Acc, SqOp<"=", G>], B, "">
						: C extends "!"
							? R extends `=${infer R1}`
								? LexChunk<R1, [...Acc, SqOp<"!=", G>], B, "">
								: Err<Unrecognized<"!">, Acc>
							: C extends "$"
								? LexDollar<R, Acc, B, G>
								: C extends "?" | "@" | ":"
									? Err<
											`TypeSQL parameters are written $1 or :name, not "${C}${IdRun<R>}"`,
											Acc
										>
									: C extends NonIdAscii
										? Err<Unrecognized<C>, Acc>
										: LexWord<R, C, Acc, B, G>;

type LexDollar<
	R extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> = R extends `${infer D extends Digit}${infer R1}`
	? TakeDigits<R1, D> extends [infer V extends string, infer R2 extends string]
		? IdRun<R2> extends ""
			? LexChunk<R2, [...Acc, SqParam<ToNum<V>, G>], B, "">
			: Err<
					`TypeSQL parameters are written $1 or :name, not "$${V}${IdRun<R2>}"`,
					Acc
				>
		: never
	: Err<`TypeSQL parameters are written $1 or :name, not "$${IdRun<R>}"`, Acc>;

type LexWord<
	R extends string,
	C extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	TakeWord<R, C> extends [infer W extends string, infer R2 extends string]
		? LexChunk<R2, [...Acc, SqWord<Lowercase<W>, W, G>], B, "">
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
			? LexChunk<R2, [...Acc, SqBlob<Hex, `${X}'${Hex}'`, G>], B, "">
			: Err<Unrecognized<`${X}'${Hex}'${IdRun<R2>}`>, Acc>
		: Err<Unrecognized<`${X}'${Hex}'`>, Acc>
	: Err<Unrecognized<`${X}'${R1}`>, Acc>;
type IsHex<
	S extends string,
	Even extends boolean,
> = S extends `${infer C}${infer R}`
	? C extends HexDigit
		? IsHex<R, Even extends true ? false : true>
		: false
	: Even;

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
		? LexChunk<R2, [...Acc, SqStr<V, `'${Escape<V, "'">}'`, G>], B, "">
		: Err<Unrecognized<`'${R}`>, Acc>;

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
				SqIdent<
					Lowercase<V>,
					V,
					`${Open}${Close extends "]" ? V : Escape<V, Close>}${Close}`,
					G
				>,
			],
			B,
			""
		>
	: Err<Unrecognized<`${Open}${R}`>, Acc>;

type TakeQuoted<
	S extends string,
	Qc extends string,
	Acc extends string,
> = S extends `${infer Body}${Qc}${infer R}`
	? R extends `${Qc}${infer R2}`
		? TakeQuoted<R2, Qc, `${Acc}${Body}${Qc}`>
		: [`${Acc}${Body}`, R]
	: null;

type Escape<
	S extends string,
	Q extends string,
	Acc extends string = "",
> = S extends `${infer A}${Q}${infer B}`
	? Escape<B, Q, `${Acc}${A}${Q}${Q}`>
	: `${Acc}${S}`;

type LexNumber<
	S extends string,
	Acc extends readonly unknown[],
	B extends number,
	G extends string,
> =
	TakeNumber<S> extends [infer V extends string, infer R2 extends string]
		? IdRun<R2> extends ""
			? LexChunk<R2, [...Acc, SqNum<V, G>], B, "">
			: Err<Unrecognized<`${V}${IdRun<R2>}`>, Acc>
		: TakeNumber<S> extends infer Bad extends string
			? Err<Unrecognized<Bad>, Acc>
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

type TakeDigits<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends Digit}${infer R}`
	? TakeDigits<R, `${Acc}${C}`>
	: [Acc, S];

type IdRun<
	R extends string,
	Acc extends string = "",
> = R extends `${infer C}${infer R1}`
	? C extends NonIdAscii
		? Acc
		: IdRun<R1, `${Acc}${C}`>
	: Acc;

type TakeWord<
	S extends string,
	Acc extends string,
> = S extends `${infer A}${infer B}${infer C}${infer D}${infer R}`
	? A extends NonIdAscii
		? [Acc, S]
		: B extends NonIdAscii
			? [`${Acc}${A}`, `${B}${C}${D}${R}`]
			: C extends NonIdAscii
				? [`${Acc}${A}${B}`, `${C}${D}${R}`]
				: D extends NonIdAscii
					? [`${Acc}${A}${B}${C}`, `${D}${R}`]
					: TakeWord<R, `${Acc}${A}${B}${C}${D}`>
	: S extends `${infer C}${infer R}`
		? C extends NonIdAscii
			? [Acc, S]
			: TakeWord<R, `${Acc}${C}`>
		: [Acc, S];

type ToNum<S extends string> = S extends `${infer N extends number}`
	? N
	: never;
