import type { HexDigit, NonIdAscii, Ws } from "../../../engine/chars.js";

export type CheckEscapes<S extends string> = S extends `${string}\\${infer R}`
	? R extends `u${infer R2}`
		? Hex4<R2> extends [infer H extends string, infer R3 extends string]
			? CheckCodePoint<H, R3, "e">
			: "invalid Unicode escape"
		: R extends `U${infer R2}`
			? Hex8<R2> extends [infer H extends string, infer R3 extends string]
				? CheckCodePoint<H, R3, "e">
				: "invalid Unicode escape"
			: R extends `${string}${infer R2}`
				? CheckEscapes<R2>
				: null
	: null;

export type CheckUEscapes<
	S extends string,
	E extends string,
> = S extends `${string}${E}${infer R}`
	? R extends `${E}${infer R2}`
		? CheckUEscapes<R2, E>
		: R extends `+${infer R2}`
			? Hex6<R2> extends [infer H extends string, infer R3 extends string]
				? CheckCodePoint<H, R3, E>
				: "invalid Unicode escape"
			: Hex4<R> extends [infer H extends string, infer R3 extends string]
				? CheckCodePoint<H, R3, E>
				: "invalid Unicode escape"
	: null;

type CheckCodePoint<H extends string, R extends string, E extends string> =
	CodePoint<H> extends infer K
		? K extends "high"
			? LowSurrogateNext<R, E> extends [infer R2 extends string]
				? Continue<R2, E>
				: E extends "e"
					? NotLowSurrogate<R>
					: "invalid Unicode surrogate pair"
			: K extends "low"
				? AtEscape<"invalid Unicode surrogate pair", H, E>
				: K extends "invalid"
					? AtEscape<"invalid Unicode escape value", H, E>
					: Continue<R, E>
		: never;
type AtEscape<
	M extends string,
	H extends string,
	E extends string,
> = E extends "e"
	? `${M} at or near "${H extends `${string}${string}${string}${string}${infer _5}${string}` ? "\\U" : "\\u"}${H}"`
	: M;
type NotLowSurrogate<R extends string> = R extends `\\u${infer R2}`
	? Hex4<R2> extends [infer H extends string, string]
		? `invalid Unicode surrogate pair at or near "\\u${H}"`
		: "invalid Unicode escape"
	: R extends `\\U${infer R2}`
		? Hex8<R2> extends [infer H extends string, string]
			? `invalid Unicode surrogate pair at or near "\\U${H}"`
			: "invalid Unicode escape"
		: R extends `${infer C}${string}`
			? `invalid Unicode surrogate pair at or near "${C}"`
			: `invalid Unicode surrogate pair at or near "'"`;
type Continue<R extends string, E extends string> = E extends "e"
	? CheckEscapes<R>
	: CheckUEscapes<R, E>;

type LowSurrogateNext<R extends string, E extends string> = E extends "e"
	? R extends `\\u${infer R2}`
		? IfLow<Hex4<R2>>
		: R extends `\\U${infer R2}`
			? IfLow<Hex8<R2>>
			: null
	: R extends `${E}+${infer R2}`
		? IfLow<Hex6<R2>>
		: R extends `${E}${infer R2}`
			? IfLow<Hex4<R2>>
			: null;
type IfLow<X> = X extends [infer H extends string, infer R]
	? CodePoint<H> extends "low"
		? [R]
		: null
	: null;

type CodePoint<H extends string> =
	Lowercase<H> extends infer L
		? L extends `00${infer Rest}`
			? CodePoint<Rest>
			: L extends ""
				? "invalid"
				: L extends `${infer _1}${infer _2}${infer _3}${infer _4}${infer _5}${infer _6}${infer _7}${infer _8}`
					? "invalid"
					: L extends `${infer P}${infer Q}${infer _3}${infer _4}${infer _5}${infer _6}`
						? `${P}${Q}` extends `0${Exclude<Lowercase<HexDigit>, "0">}` | "10"
							? "ok"
							: "invalid"
						: L extends `d${infer S}${infer _3}${infer _4}`
							? S extends "8" | "9" | "a" | "b"
								? "high"
								: S extends "c" | "d" | "e" | "f"
									? "low"
									: "ok"
							: "ok"
		: never;

type Hex4<S extends string> =
	S extends `${infer A}${infer B}${infer C}${infer D}${infer R}`
		? [A | B | C | D] extends [HexDigit]
			? [`${A}${B}${C}${D}`, R]
			: null
		: null;
type Hex6<S extends string> = S extends `${infer A}${infer B}${infer R}`
	? [A | B] extends [HexDigit]
		? Hex4<R> extends [infer H extends string, infer R2]
			? [`${A}${B}${H}`, R2]
			: null
		: null
	: null;
type Hex8<S extends string> = S extends `${infer A}${infer B}${infer R}`
	? [A | B] extends [HexDigit]
		? Hex6<R> extends [infer H extends string, infer R2]
			? [`${A}${B}${H}`, R2]
			: null
		: null
	: null;

export type UEscape<R extends string> =
	SkipWsOnly<R> extends `${infer A}${infer B}${infer C}${infer D}${infer E}${infer F}${infer G}${infer Rest}`
		? Lowercase<`${A}${B}${C}${D}${E}${F}${G}`> extends "uescape"
			? Rest extends `${infer N}${string}`
				? N extends NonIdAscii
					? EscapeChar<SkipWsOnly<Rest>>
					: ["\\", R]
				: EscapeChar<Rest>
			: ["\\", R]
		: ["\\", R];
type EscapeChar<S extends string> = S extends `'${infer Ch}'${infer Rest}`
	? Ch extends `${infer One}${infer More}`
		? More extends ""
			? One extends HexDigit | "+" | "'" | '"' | Ws
				? `invalid Unicode escape character at or near "'${Ch}'"`
				: [One, Rest]
			: `invalid Unicode escape character at or near "'${Ch}'"`
		: `invalid Unicode escape character at or near "''"`
	: S extends `${infer N}${string}`
		? `UESCAPE must be followed by a simple string literal at or near "${N}"`
		: "UESCAPE must be followed by a simple string literal at end of input";
type SkipWsOnly<S extends string> = S extends `${infer C}${infer R}`
	? C extends Ws
		? SkipWsOnly<R>
		: S
	: S;

export type DecodeU<
	S extends string,
	E extends string,
	Acc extends string = "",
> = S extends `${infer Pre}${E}${infer R}`
	? R extends `${E}${infer R2}`
		? DecodeU<R2, E, `${Acc}${Pre}${E}`>
		: R extends `+${infer R2}`
			? Hex6<R2> extends [infer H extends string, infer R3 extends string]
				? DecodeU<R3, E, `${Acc}${Pre}${CharOf<H, `${E}+${H}`>}`>
				: `${Acc}${S}`
			: Hex4<R> extends [infer H extends string, infer R3 extends string]
				? DecodeU<R3, E, `${Acc}${Pre}${CharOf<H, `${E}${H}`>}`>
				: `${Acc}${S}`
	: `${Acc}${S}`;
type CharOf<H extends string, Raw extends string> =
	Lowercase<H> extends infer L
		? (
				L extends `00${infer L4}`
					? L4 extends `${infer _1}${infer _2}${infer _3}${infer _4}`
						? L4
						: L
					: L
			) extends `00${infer Hi extends keyof Latin1Rows}${infer Lo}`
			? [RowChar<Latin1Rows[Hi], Lo>] extends [never]
				? Raw
				: RowChar<Latin1Rows[Hi], Lo>
			: Raw
		: never;

type Latin1Rows = {
	"2": " !\"#$%&'()*+,-./";
	"3": "0123456789:;<=>?";
	"4": "@ABCDEFGHIJKLMNO";
	"5": "PQRSTUVWXYZ[\\]^_";
	"6": "`abcdefghijklmno";
	"7": "pqrstuvwxyz{|}~";
	a: "\u00a0¡¢£¤¥¦§¨©ª«¬\u00ad®¯";
	b: "°±²³´µ¶·¸¹º»¼½¾¿";
	c: "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ";
	d: "ÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß";
	e: "àáâãäåæçèéêëìíîï";
	f: "ðñòóôõö÷øùúûüýþÿ";
};
type RowChar<
	S extends string,
	D extends string,
	Hex extends string = "0123456789abcdef",
> = S extends `${infer C}${infer R}`
	? Hex extends `${infer H}${infer HR}`
		? H extends D
			? C
			: RowChar<R, D, HR>
		: never
	: never;
