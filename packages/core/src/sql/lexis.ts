import type { Digit, IdStart, Ws } from "../engine/chars.js";

/** Standard SQL's openers besides `'`: quoted names and comments. */
type Standard = '"' | "--" | "/*";
/** The openers some dialects add. */
type Extra = "`" | "[" | "#";

/**
 * A dialect's text rules at type level, as its runtime dialect's `lexis`:
 * which text holds no parameters, markers or slots. Standard SQL's strings,
 * quoted names and comments (`'`, `"`, `--`, `/*`) open such text in every
 * dialect.
 */
export interface Lexis {
	/** The openers it adds: quotes and comment starts. */
	readonly extra: Extra;
	/** The quotes inside which a backslash escapes the next character. */
	readonly backslash: "'" | '"';
	/** Whether `--` starts a comment only before whitespace. */
	readonly spacedDash: boolean;
	/** Whether block comments nest. */
	readonly nest: boolean;
	/** Whether `$tag$` quotes a string and `E'…'` strings take backslash escapes, as in PostgreSQL. */
	readonly dollar: boolean;
	/** The quotes of names, for messages; the others quote strings. */
	readonly names: '"' | "`" | "[";
}

/**
 * Whether lexis `L` reads all of `T` as code: no string, quoted name, comment
 * or dollar quote. The pre-passes then read `T` in one piece. The first test,
 * which most statements pass, involves no lexis.
 */
export type AllCode<
	T extends string,
	L extends Lexis,
> = T extends `${string}${"'" | Standard | Extra}${string}`
	? T extends `${string}${"'" | Standard | L["extra"]}${string}`
		? false
		: NoDollarQuote<T, L>
	: NoDollarQuote<T, L>;
type NoDollarQuote<
	T extends string,
	L extends Lexis,
> = T extends `${string}$${string}`
	? DollarOpen<T, "", L> extends null
		? true
		: false
	: true;

/**
 * Splits `T` at its first opener: `[code before it, the opener, text after
 * it]`, or `[T, "", ""]` when it has none.
 */
export type SplitFirst<
	T extends string,
	L extends Lexis,
> = T extends `${infer A}'${infer B}`
	? A extends `${string}${Standard | Extra}${string}`
		? Earlier<A, "'", B, L>
		: [A, "'", B]
	: T extends `${string}${Standard | Extra}${string}`
		? T extends `${infer A}"${infer B}`
			? A extends `${string}${Standard | Extra}${string}`
				? Earlier<A, '"', B, L>
				: [A, '"', B]
			: T extends `${infer A}--${infer B}`
				? Earlier<A, "--", B, L>
				: T extends `${infer A}/*${infer B}`
					? Earlier<A, "/*", B, L>
					: Added<T, "", "", L>
		: [T, "", ""];
/** `A` split at its first opener, if it has one, before opener `O` and text `B`. */
type Earlier<
	A extends string,
	O extends string,
	B extends string,
	L extends Lexis,
> = A extends `${infer A2}"${infer M}`
	? Earlier<A2, '"', `${M}${O}${B}`, L>
	: A extends `${infer A2}--${infer M}`
		? Earlier<A2, "--", `${M}${O}${B}`, L>
		: A extends `${infer A2}/*${infer M}`
			? Earlier<A2, "/*", `${M}${O}${B}`, L>
			: A extends `${infer A2}'${infer M}`
				? Earlier<A2, "'", `${M}${O}${B}`, L>
				: A extends `${string}${Extra}${string}`
					? Added<A, O, B, L>
					: [A, O, B];
/** Earlier, for the openers lexis `L` adds, when `A` has no standard one. */
type Added<
	A extends string,
	O extends string,
	B extends string,
	L extends Lexis,
> = A extends `${infer A2}${"`" & L["extra"]}${infer M}`
	? Added<A2, "`", `${M}${O}${B}`, L>
	: A extends `${infer A2}${"[" & L["extra"]}${infer M}`
		? Added<A2, "[", `${M}${O}${B}`, L>
		: A extends `${infer A2}${"#" & L["extra"]}${infer M}`
			? Added<A2, "#", `${M}${O}${B}`, L>
			: [A, O, B];

/**
 * The text an opener `O` opens, up to and including what closes it, and the
 * text after that. An empty text when `O` doesn't open one here.
 */
export type Opaque<
	O extends string,
	S extends string,
	L extends Lexis,
> = O extends "'" | '"' | "`"
	? S extends `${string}\\${string}`
		? O extends L["backslash"]
			? CloseEscaped<S, O, "">
			: CloseQuote<S, O, "">
		: CloseQuote<S, O, "">
	: O extends "/*"
		? L["nest"] extends true
			? CloseBlock<S, [0], "">
			: S extends `${infer C}*/${infer R}`
				? [`${C}*/`, R]
				: [S, ""]
		: O extends "--"
			? S extends "" | `${Ws}${string}`
				? CloseLine<S>
				: L["spacedDash"] extends true
					? ["", S]
					: CloseLine<S>
			: O extends "#"
				? CloseLine<S>
				: O extends "["
					? S extends `${infer C}]${infer R}`
						? [`${C}]`, R]
						: [S, ""]
					: ["", S];

/** What a marker or slot inside the text an opener `O` opens is inside. */
export type OpaqueKind<O extends string, L extends Lexis> = O extends L["names"]
	? "a quoted identifier"
	: O extends "'" | '"' | "`"
		? "a quoted string"
		: "a comment";

type CloseLine<S extends string> = S extends `${infer C}\n${infer R}`
	? [`${C}\n`, R]
	: [S, ""];

type CloseBlock<
	S extends string,
	Depth extends unknown[],
	Acc extends string,
> = S extends `${infer Pre}/${infer R}`
	? Pre extends `${string}*`
		? Depth extends [unknown, ...infer D]
			? D extends []
				? [`${Acc}${Pre}/`, R]
				: CloseBlock<R, D, `${Acc}${Pre}/`>
			: never
		: R extends `*${infer Rest}`
			? CloseBlock<Rest, [...Depth, 0], `${Acc}${Pre}/*`>
			: CloseBlock<R, Depth, `${Acc}${Pre}/`>
	: [`${Acc}${S}`, ""];

type CloseQuote<
	S extends string,
	Q extends string,
	Acc extends string,
> = S extends `${infer In}${Q}${infer R}`
	? R extends `${Q}${infer R2}`
		? CloseQuote<R2, Q, `${Acc}${In}${Q}${Q}`>
		: [`${Acc}${In}${Q}`, R]
	: [`${Acc}${S}`, ""];

/** The text of quote `Q`, which a backslash escapes as well as a doubled `Q`. */
type CloseEscaped<
	S extends string,
	Q extends string,
	Acc extends string,
> = S extends `${infer In}${Q}${infer R}`
	? In extends `${infer A}\\${infer B}`
		? B extends `${infer C}${infer B2}`
			? CloseEscaped<`${B2}${Q}${R}`, Q, `${Acc}${A}\\${C}`>
			: CloseEscaped<R, Q, `${Acc}${A}\\${Q}`>
		: R extends `${Q}${infer R2}`
			? CloseEscaped<R2, Q, `${Acc}${In}${Q}${Q}`>
			: [`${Acc}${In}${Q}`, R]
	: [`${Acc}${S}`, ""];

/**
 * Splits `T` at its first text that holds no parameters (string, quoted
 * name, comment or dollar quote): `[code before it, that whole text, text
 * after it]`. The text is `""` when `T` is all code.
 */
export type NextOpaque<T extends string, L extends Lexis> =
	SplitFirst<T, L> extends [
		infer Code extends string,
		infer O extends string,
		infer Rest extends string,
	]
		? Code extends `${string}$${string}`
			? DollarOpen<Code, "", L> extends [
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
				: Quoted<Code, O, Rest, L>
			: Quoted<Code, O, Rest, L>
		: never;
/** `[Code, the text opener O opens, the text after it]`. */
type Quoted<
	Code extends string,
	O extends string,
	Rest extends string,
	L extends Lexis,
> = O extends ""
	? [Code, "", ""]
	: (
				O extends "'"
					? IsEString<Code> extends true
						? L["dollar"] extends true
							? CloseEscaped<Rest, "'", "">
							: Opaque<O, Rest, L>
						: Opaque<O, Rest, L>
					: Opaque<O, Rest, L>
			) extends [infer Seg extends string, infer After extends string]
		? [Code, `${O}${Seg}`, After]
		: never;

/** `E'…'` strings escape quotes with backslashes. */
type IsEString<Code extends string> = Code extends `${infer C0}${"E" | "e"}`
	? C0 extends `${string}${NameChar}`
		? false
		: true
	: false;

/**
 * What a name holds after its first character: `$` too, so `a$b$` is a
 * name. A `$` after code that ends in one continues the name.
 */
type NameChar = NChar | "$";

/** The first `$$` or `$tag$` in `S`, and the code before and after it. */
type DollarOpen<
	S extends string,
	Acc extends string,
	L extends Lexis,
> = S extends `${infer A}$${infer B}`
	? L["dollar"] extends true
		? B extends `$${infer R}`
			? `${Acc}${A}` extends `${string}${NameChar}`
				? DollarOpen<B, `${Acc}${A}$`, L>
				: [`${Acc}${A}`, "$$", R]
			: B extends `${infer C extends IdStart}${infer R}`
				? TakeName<R, C> extends [infer Tag extends string, `$${infer R2}`]
					? `${Acc}${A}` extends `${string}${NameChar}`
						? DollarOpen<B, `${Acc}${A}$`, L>
						: [`${Acc}${A}`, `$${Tag}$`, R2]
					: DollarOpen<B, `${Acc}${A}$`, L>
				: DollarOpen<B, `${Acc}${A}$`, L>
		: null
	: null;
type DollarBody<
	S extends string,
	Tag extends string,
> = S extends `${infer Body}${Tag}${infer R}` ? [`${Body}${Tag}`, R] : [S, ""];

type NChar = IdStart | Digit;

/** A name's characters after its first, `Acc`, and the text after them. */
export type TakeName<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends NChar}${infer R}`
	? TakeName<R, `${Acc}${C}`>
	: [Acc, S];
