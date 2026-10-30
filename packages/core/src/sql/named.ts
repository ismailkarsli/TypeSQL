import type { SqlError } from "../errors.js";
import type { Opaque, SplitFirst } from "./inline.js";
import type { MaxParamStr } from "./splice.js";

export type RewriteNamed<Q extends string> =
	RewriteNamedStr<Q> extends [infer T, infer Names]
		? Names extends []
			? [T, []]
			: MaxParamStr<Q> extends 0
				? [T, Names]
				: SqlError<"cannot mix named (:name) and positional ($n) parameters", 0>
		: never;

type IndexOf<
	Names extends string[],
	Name extends string,
	Acc extends unknown[] = [],
> = Names extends [infer H, ...infer R extends string[]]
	? H extends Name
		? [...Acc, 0]["length"]
		: IndexOf<R, Name, [...Acc, 0]>
	: [...Acc, 0]["length"];

export type NamedParams<
	Names extends readonly string[],
	Params extends readonly unknown[],
> = {
	-readonly [I in keyof Names & `${number}` as Names[I]]: Params[I &
		keyof Params];
} extends infer O
	? { [K in keyof O]: O[K] }
	: never;

export type RewriteNamedStr<Text extends string> =
	HasSingleColon<Text> extends true ? NamedLoop<Text, "", []> : [Text, []];

type HasSingleColon<
	S extends string,
	Budget extends unknown[] = [],
> = Budget["length"] extends 128
	? true
	: S extends `${string}:${infer R}`
		? R extends `:${infer Rest}`
			? HasSingleColon<Rest, [...Budget, 0]>
			: true
		: false;

type NamedLoop<T extends string, Acc extends string, Names extends string[]> =
	NextOpaque<T> extends [
		infer Code extends string,
		infer Seg extends string,
		infer After extends string,
	]
		? RewriteCode<Code, "", Names> extends [
				infer C extends string,
				infer N2 extends string[],
			]
			? Seg extends ""
				? [`${Acc}${C}`, N2]
				: NamedLoop<After, `${Acc}${C}${Seg}`, N2>
			: never
		: never;

/**
 * Splits `T` at its first string, E-string, quoted identifier, comment or
 * dollar quote: `[code before it, the whole quoted segment, text after it]`.
 * The segment is `""` when `T` is all code.
 */
export type NextOpaque<T extends string> =
	SplitFirst<T> extends [
		infer Code extends string,
		infer O extends string,
		infer Rest extends string,
	]
		? DollarOpen<Code, ""> extends [
				infer Pre extends string,
				infer Tag extends string,
				infer InCode extends string,
			]
			? DollarBody<`${InCode}${O}${Rest}`, Tag> extends [
					infer Seg extends string,
					infer After extends string,
				]
				? [Pre, `${Tag}${Seg}`, After]
				: never
			: O extends ""
				? [Code, "", ""]
				: (
							O extends "'"
								? IsEString<Code> extends true
									? EClose<Rest, "">
									: Opaque<O, Rest>
								: Opaque<O, Rest>
						) extends [infer Seg extends string, infer After extends string]
					? [Code, `${O}${Seg}`, After]
					: never
		: never;

/** `E'…'` strings escape quotes with backslashes. */
type IsEString<Code extends string> = Code extends `${infer C0}${"E" | "e"}`
	? C0 extends `${string}${NChar}`
		? false
		: true
	: false;
type EClose<
	S extends string,
	Acc extends string,
> = S extends `${infer In}'${infer R}`
	? In extends `${infer A}\\${infer B}`
		? B extends `${infer C}${infer B2}`
			? EClose<`${B2}'${R}`, `${Acc}${A}\\${C}`>
			: EClose<R, `${Acc}${A}\\'`>
		: R extends `'${infer R2}`
			? EClose<R2, `${Acc}${In}''`>
			: [`${Acc}${In}'`, R]
	: [`${Acc}${S}`, ""];

type DollarOpen<
	S extends string,
	Acc extends string,
> = S extends `${infer A}$${infer B}`
	? B extends `$${infer R}`
		? [`${Acc}${A}`, "$$", R]
		: B extends `${infer C extends NStart}${infer R}`
			? TakeName<R, C> extends [infer Tag extends string, `$${infer R2}`]
				? [`${Acc}${A}`, `$${Tag}$`, R2]
				: DollarOpen<B, `${Acc}${A}$`>
			: DollarOpen<B, `${Acc}${A}$`>
	: null;
type DollarBody<
	S extends string,
	Tag extends string,
> = S extends `${infer Body}${Tag}${infer R}` ? [`${Body}${Tag}`, R] : [S, ""];

type NStart =
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "g"
	| "h"
	| "i"
	| "j"
	| "k"
	| "l"
	| "m"
	| "n"
	| "o"
	| "p"
	| "q"
	| "r"
	| "s"
	| "t"
	| "u"
	| "v"
	| "w"
	| "x"
	| "y"
	| "z"
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F"
	| "G"
	| "H"
	| "I"
	| "J"
	| "K"
	| "L"
	| "M"
	| "N"
	| "O"
	| "P"
	| "Q"
	| "R"
	| "S"
	| "T"
	| "U"
	| "V"
	| "W"
	| "X"
	| "Y"
	| "Z"
	| "_";
type NChar = NStart | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type RewriteCode<
	S extends string,
	Acc extends string,
	Names extends string[],
> = S extends `${infer Pre}:${infer Rest}`
	? Rest extends `:${infer Rest2}`
		? RewriteCode<Rest2, `${Acc}${Pre}::`, Names>
		: Rest extends `${infer C extends NStart}${infer Rest2}`
			? TakeName<Rest2, C> extends [
					infer Name extends string,
					infer Rest3 extends string,
				]
				? RewriteCode<
						Rest3,
						`${Acc}${Pre}$${IndexOf<Names, Name>}`,
						Name extends Names[number] ? Names : [...Names, Name]
					>
				: never
			: RewriteCode<Rest, `${Acc}${Pre}:`, Names>
	: [`${Acc}${S}`, Names];
type TakeName<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends NChar}${infer R}`
	? TakeName<R, `${Acc}${C}`>
	: [Acc, S];
