// Tokens and lexer leaves shared by the MySQL and SQLite lexers. A token keeps
// the whitespace and comments before it (`g`) and, unless its value is its
// text, its text as written (`r`), so names and messages can quote the
// statement's own text.
import type {
	Digit,
	HexDigit,
	IdRun,
	NonIdAscii,
	TakeDigits,
} from "../chars.js";
import type { ToNum } from "../num.js";

export type Word<V extends string, R extends string, G extends string> = {
	readonly k: "w";
	readonly v: V;
	readonly r: R;
	readonly g: G;
};
export type Ident<
	V extends string,
	N extends string,
	R extends string,
	G extends string,
> = {
	readonly k: "id";
	readonly v: V;
	readonly n: N;
	readonly r: R;
	readonly g: G;
};
export type Num<V extends string, G extends string> = {
	readonly k: "n";
	readonly v: V;
	readonly g: G;
};
export type Str<
	V extends string,
	R extends string,
	G extends string,
	F extends string = V,
> = {
	readonly k: "s";
	readonly v: V;
	readonly r: R;
	readonly g: G;
	/** The first of adjacent strings (`'a' 'b'`), which MySQL names the column after. */
	readonly f: F;
};
export type Blob<V extends string, R extends string, G extends string> = {
	readonly k: "s";
	readonly v: V;
	readonly r: R;
	readonly g: G;
	readonly blob: true;
};
/** `$N`, with its text as the server receives it. */
export type Param<N extends number, R extends string, G extends string> = {
	readonly k: "$";
	readonly v: N;
	readonly r: R;
	readonly g: G;
};
export type Op<V extends string, G extends string> = {
	readonly k: "o";
	readonly v: V;
	readonly g: G;
};

export type RawOf<T> = T extends { readonly r: infer R extends string }
	? R
	: T extends { readonly v: infer V extends string }
		? V
		: "";

export type NameOf<T> = T extends { readonly k: "id"; readonly n: infer N }
	? N
	: T extends { readonly k: "w"; readonly r: infer R }
		? R
		: T extends { readonly k: "s"; readonly v: infer V }
			? V
			: never;

/** Lexer steps (a token or a whitespace character) per round, which bounds the recursion depth. */
export type ChunkSize = 200;

export type LexErr<M extends string, Acc extends readonly unknown[]> = [
	"err",
	M,
	Acc,
];

export type BadParam<T extends string> =
	`TypeSQL parameters are written $1 or :name, not "${T}"`;

/** The parameter number after a `$` and the text after it, or the error message. */
export type DollarParam<R extends string> =
	R extends `${infer D extends Digit}${infer R1}`
		? TakeDigits<R1, D> extends [
				infer V extends string,
				infer R2 extends string,
			]
			? IdRun<R2> extends ""
				? [ToNum<V>, R2]
				: BadParam<`$${V}${IdRun<R2>}`>
			: never
		: BadParam<`$${IdRun<R>}`>;

export type IsHex<
	S extends string,
	Even extends boolean,
> = S extends `${infer C}${infer R}`
	? C extends HexDigit
		? IsHex<R, Even extends true ? false : true>
		: false
	: Even;

/** The text up to the closing quote `Qc`, where a doubled quote is one quote. */
export type TakeQuoted<
	S extends string,
	Qc extends string,
	Acc extends string,
> = S extends `${infer Body}${Qc}${infer R}`
	? R extends `${Qc}${infer R2}`
		? TakeQuoted<R2, Qc, `${Acc}${Body}${Qc}`>
		: [`${Acc}${Body}`, R]
	: null;

export type Escape<
	S extends string,
	Q extends string,
	Acc extends string = "",
> = S extends `${infer A}${Q}${infer B}`
	? Escape<B, Q, `${Acc}${A}${Q}${Q}`>
	: `${Acc}${S}`;

export type TakeWord<
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
