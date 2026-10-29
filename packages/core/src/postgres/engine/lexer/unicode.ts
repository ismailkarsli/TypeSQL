import type { HexDigit, NonIdAscii, Ws } from "./chars.js";

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
						? `${P}${Q}` extends
								| "01"
								| "02"
								| "03"
								| "04"
								| "05"
								| "06"
								| "07"
								| "08"
								| "09"
								| "0a"
								| "0b"
								| "0c"
								| "0d"
								| "0e"
								| "0f"
								| "10"
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
			) extends infer K
			? K extends keyof Latin1
				? Latin1[K]
				: Raw
			: never
		: never;

interface Latin1 {
	"0020": " ";
	"0021": "!";
	"0022": '"';
	"0023": "#";
	"0024": "$";
	"0025": "%";
	"0026": "&";
	"0027": "'";
	"0028": "(";
	"0029": ")";
	"002a": "*";
	"002b": "+";
	"002c": ",";
	"002d": "-";
	"002e": ".";
	"002f": "/";
	"0030": "0";
	"0031": "1";
	"0032": "2";
	"0033": "3";
	"0034": "4";
	"0035": "5";
	"0036": "6";
	"0037": "7";
	"0038": "8";
	"0039": "9";
	"003a": ":";
	"003b": ";";
	"003c": "<";
	"003d": "=";
	"003e": ">";
	"003f": "?";
	"0040": "@";
	"0041": "A";
	"0042": "B";
	"0043": "C";
	"0044": "D";
	"0045": "E";
	"0046": "F";
	"0047": "G";
	"0048": "H";
	"0049": "I";
	"004a": "J";
	"004b": "K";
	"004c": "L";
	"004d": "M";
	"004e": "N";
	"004f": "O";
	"0050": "P";
	"0051": "Q";
	"0052": "R";
	"0053": "S";
	"0054": "T";
	"0055": "U";
	"0056": "V";
	"0057": "W";
	"0058": "X";
	"0059": "Y";
	"005a": "Z";
	"005b": "[";
	"005c": "\\";
	"005d": "]";
	"005e": "^";
	"005f": "_";
	"0060": "`";
	"0061": "a";
	"0062": "b";
	"0063": "c";
	"0064": "d";
	"0065": "e";
	"0066": "f";
	"0067": "g";
	"0068": "h";
	"0069": "i";
	"006a": "j";
	"006b": "k";
	"006c": "l";
	"006d": "m";
	"006e": "n";
	"006f": "o";
	"0070": "p";
	"0071": "q";
	"0072": "r";
	"0073": "s";
	"0074": "t";
	"0075": "u";
	"0076": "v";
	"0077": "w";
	"0078": "x";
	"0079": "y";
	"007a": "z";
	"007b": "{";
	"007c": "|";
	"007d": "}";
	"007e": "~";
	"00a0": "\u00a0";
	"00a1": "\u00a1";
	"00a2": "\u00a2";
	"00a3": "\u00a3";
	"00a4": "\u00a4";
	"00a5": "\u00a5";
	"00a6": "\u00a6";
	"00a7": "\u00a7";
	"00a8": "\u00a8";
	"00a9": "\u00a9";
	"00aa": "\u00aa";
	"00ab": "\u00ab";
	"00ac": "\u00ac";
	"00ad": "\u00ad";
	"00ae": "\u00ae";
	"00af": "\u00af";
	"00b0": "\u00b0";
	"00b1": "\u00b1";
	"00b2": "\u00b2";
	"00b3": "\u00b3";
	"00b4": "\u00b4";
	"00b5": "\u00b5";
	"00b6": "\u00b6";
	"00b7": "\u00b7";
	"00b8": "\u00b8";
	"00b9": "\u00b9";
	"00ba": "\u00ba";
	"00bb": "\u00bb";
	"00bc": "\u00bc";
	"00bd": "\u00bd";
	"00be": "\u00be";
	"00bf": "\u00bf";
	"00c0": "\u00c0";
	"00c1": "\u00c1";
	"00c2": "\u00c2";
	"00c3": "\u00c3";
	"00c4": "\u00c4";
	"00c5": "\u00c5";
	"00c6": "\u00c6";
	"00c7": "\u00c7";
	"00c8": "\u00c8";
	"00c9": "\u00c9";
	"00ca": "\u00ca";
	"00cb": "\u00cb";
	"00cc": "\u00cc";
	"00cd": "\u00cd";
	"00ce": "\u00ce";
	"00cf": "\u00cf";
	"00d0": "\u00d0";
	"00d1": "\u00d1";
	"00d2": "\u00d2";
	"00d3": "\u00d3";
	"00d4": "\u00d4";
	"00d5": "\u00d5";
	"00d6": "\u00d6";
	"00d7": "\u00d7";
	"00d8": "\u00d8";
	"00d9": "\u00d9";
	"00da": "\u00da";
	"00db": "\u00db";
	"00dc": "\u00dc";
	"00dd": "\u00dd";
	"00de": "\u00de";
	"00df": "\u00df";
	"00e0": "\u00e0";
	"00e1": "\u00e1";
	"00e2": "\u00e2";
	"00e3": "\u00e3";
	"00e4": "\u00e4";
	"00e5": "\u00e5";
	"00e6": "\u00e6";
	"00e7": "\u00e7";
	"00e8": "\u00e8";
	"00e9": "\u00e9";
	"00ea": "\u00ea";
	"00eb": "\u00eb";
	"00ec": "\u00ec";
	"00ed": "\u00ed";
	"00ee": "\u00ee";
	"00ef": "\u00ef";
	"00f0": "\u00f0";
	"00f1": "\u00f1";
	"00f2": "\u00f2";
	"00f3": "\u00f3";
	"00f4": "\u00f4";
	"00f5": "\u00f5";
	"00f6": "\u00f6";
	"00f7": "\u00f7";
	"00f8": "\u00f8";
	"00f9": "\u00f9";
	"00fa": "\u00fa";
	"00fb": "\u00fb";
	"00fc": "\u00fc";
	"00fd": "\u00fd";
	"00fe": "\u00fe";
	"00ff": "\u00ff";
}
