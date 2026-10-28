import type { SqlError } from "../errors.js";
import type {
	Digit,
	HexDigit,
	IdStart,
	NonIdAscii,
	Upper,
	Ws,
} from "./chars.js";
import type { Next } from "./next.js";
import type {
	BitTok,
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	Tok,
	WordTok,
} from "./tokens.js";
import type {
	CheckEscapes,
	CheckUEscapes,
	DecodeU,
	UEscape,
} from "./unicode.js";

type Nx<I extends number> = Next[I];

/**
 * Type-level lexer. `Lex<Q>` is a tuple of tokens or an `SqlError<message, tokenIndex>`
 * (the index of the token that could not be produced).
 *
 * Budget strategy: the main loop handles one token, one whitespace character or one comment
 * per iteration. After `ChunkSize` iterations the loop restarts so the 1000-iteration
 * tail-recursion cap is never hit; the outer loop concatenates chunks.
 * The budget is a numeric counter (`Nx`), not a tuple that is sliced each step: slicing
 * a 250-element tuple per token cost 42% of the lexer's check time.
 *
 * Dispatch on the first character, cheapest checks first: words, numbers, punctuation that
 * needs no lookahead (`Punct1`), operator characters (`LexOperator`, which also starts the
 * `--` and block comments), `:` and `.` with one character of lookahead, then quotes.
 *
 * Helpers that can fail (`TakeQuoted`, `SkipBlock`) return `null`, never
 * `never`: `never extends [infer A, infer B]` takes the true branch.
 */
export type Lex<Q extends string> = LexLines<Q, []>;

/**
 * Lex complete lines independently so statements and fragment alternatives share tokens for
 * identical lines. A line that fails may open a multiline token: retry its full remaining
 * text, retaining the original token index and error snippet. The budget bounds this extra
 * recursion; the original chunked scanner handles the remaining input after it runs out.
 */
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

/** A comma is a lexical boundary unless it lies in an unfinished quote or comment. */
type LexCommas<
	S extends string,
	Acc extends readonly unknown[],
	B extends number = 0,
> = B extends ChunkSize
	? LexAll<S, Acc>
	: S extends `${infer Part},${infer Rest}`
		? Part extends `${string}--${string}`
			? LexAll<S, Acc>
			: LexAll<Part, []> extends infer R
				? R extends readonly unknown[]
					? LexCommas<Rest, [...Acc, ...R, OpTok<",">], Nx<B>>
					: LexAll<S, Acc>
				: never
		: LexAll<S, Acc>;

/** Unicode UESCAPE and adjacent quoted-string continuations can consume the next line. */
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

/** Iterations per chunk: restart the loop before the 1000-iteration tail-recursion cap. */
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

/** Error marker carrying the chunk-local tokens so the outer loop can compute the token index. */
type Err<M extends string, Acc extends readonly Tok[]> = ["err", M, Acc];

/** Punctuation that is never part of an operator: one token, no lookahead. */
type Punct1 = "(" | ")" | "," | ";" | "[" | "]";
/** Characters operators are made of (Postgres `op_chars`). */
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
/** An operator ending in `+` or `-` keeps it only if it also contains one of these. */
type OpSpecial = "~" | "!" | "@" | "#" | "^" | "&" | "|" | "`" | "?" | "%";

type LexStep<
	S extends string,
	Acc extends readonly Tok[],
	B extends number,
> = S extends `${infer C}${infer R}`
	? C extends Ws
		? LexChunk<R, Acc, B>
		: C extends IdStart
			? R extends `${infer Q extends "'" | "&"}${infer R1}` // one check per word for E'', B'', X'', U&'', U&""
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
							: C extends "N" | "n" // N'…' is NCHAR '…', as Postgres's scanner reads it
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
												? Err<`syntax error at or near "${C}"`, Acc> // `\`, `{`, `}`: no token starts with them
												: LexWord<R, C, Acc, B> // a non-ASCII character starts an identifier
	: never;

/** A string literal token from `[value, rest]`, or the error `M` (unterminated). */
type LexString<
	X,
	Acc extends readonly Tok[],
	B extends number,
	M extends string,
> = X extends [infer V extends string, infer R2 extends string]
	? LexChunk<R2, [...Acc, StrTok<V>], B>
	: Err<M, Acc>;

/** `B'…'` / `X'…'`: every character a binary / hexadecimal digit (checked by Postgres's bit input). */
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
/** The first character of `V` that is not a `D`, or null. */
type NotDigit<
	V extends string,
	D extends string,
> = V extends `${infer C}${infer R}`
	? C extends D
		? NotDigit<R, D>
		: C
	: null;

/** `E'...'`: backslash escapes (kept raw), `\u` / `\U` escapes validated. */
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

/** `U&'...' [UESCAPE 'c']`: the value stays raw; its escapes are validated (unicode.ts). */
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

/** `U&"..." [UESCAPE 'c']`: a quoted identifier with its escapes decoded. */
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

/**
 * Fast path for the common short integer (`LIMIT 20`, `= 1`): up to four digits followed by
 * whitespace or punctuation other than `.`. Anything else goes to `LexNumber`, from the start `S0`.
 */
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

/**
 * A number, then a check that no identifier character follows it (`123abc`, `1x`, `100_` are
 * "trailing junk", as in Postgres 15+).
 */
type LexNumber<S extends string, Acc extends readonly Tok[], B extends number> =
	TakeNumber<S> extends infer N
		? N extends [infer V extends string, infer R2 extends string]
			? JunkAt<R2> extends infer J extends string
				? Err<`trailing junk after numeric literal at or near "${V}${J}"`, Acc>
				: LexChunk<R2, [...Acc, NumTok<V>], B>
			: Err<N & string, Acc>
		: never;

/**
 * The identifier at the start of `R` when one starts there (a letter, `_` or a non-ASCII
 * character, then identifier characters), else `null`: Postgres's junk token is the number and
 * all of it (`100__000`, `1_000._5`).
 */
type JunkAt<R extends string> = R extends `${infer C}${infer R1}`
	? C extends NonIdAscii | Digit | "$"
		? null
		: `${C}${IdRun<R1>}`
	: null;
/** The identifier characters at the start of `R`. */
type IdRun<
	R extends string,
	Acc extends string = "",
> = R extends `${infer C}${infer R1}`
	? C extends NonIdAscii
		? Acc
		: IdRun<R1, `${Acc}${C}`>
	: Acc;

/** An unquoted identifier or keyword starting with `C`, its ASCII letters folded to lowercase. */
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

/**
 * After operator character `C` (Postgres `scan.l`): `--` and a block comment, a single-character
 * operator (the common case: no other operator character follows), or the longest run of
 * operator characters, cut before an embedded comment start. A run longer than one character
 * cannot end in `+` or `-` unless it contains an `OpSpecial` character (`a+-b` is `+` and `-b`,
 * `@-` stays one operator); the dropped characters are lexed again.
 */
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

/**
 * Skip a (possibly nested) block comment. `S` is just after the opening `/*`; `Depth`
 * holds one entry per open comment. Each `/*` before the next `*\/` opens a level.
 * Result: the rest of the input, or `null` when unterminated.
 */
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

/** Consume up to the closing quote `Qc`, unescaping doubled quotes. `null` when unterminated. */
type TakeQuoted<
	S extends string,
	Qc extends string,
	Acc extends string,
> = S extends `${infer Body}${Qc}${infer R}`
	? R extends `${Qc}${infer R2}`
		? TakeQuoted<R2, Qc, `${Acc}${Body}${Qc}`>
		: [`${Acc}${Body}`, R]
	: null;

/** `E'...'` body: like `TakeQuoted` but a backslash-escaped quote does not terminate. Escapes are kept raw. */
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
/** Does `S` end in an odd number of backslashes (so that a quote after it is escaped)? `\\` is an escaped backslash. */
type OddBackslashes<S extends string> = S extends `${infer P}\\`
	? OddBackslashes<P> extends true
		? false
		: true
	: false;

/**
 * A `'...'` literal and its continuations: Postgres joins string literals separated by whitespace
 * that contains a newline (`'a'` newline `'b'` is `'ab'`). `[value, rest]` or `null`.
 */
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
/** After a closing quote: the rest after the next opening quote when only whitespace with a newline is in between, else `null`. */
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

/** The identifier characters (all but `NonIdAscii`) at the start of `S`, after `Acc`: `[word, rest]`. */
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

/**
 * `0x…`, `0o…`, `0b…`, or `digits [ . [digits] ] [ e [+-] digits ]` (or `. digits …`), with
 * single `_` separators between digits, as Postgres 16+ scans them. `[value, rest]`, or the error
 * message for a prefix without digits or an exponent without digits.
 */
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
/**
 * After the digits `Acc` of `0x…` / `0o…` / `0b…`: Postgres reads `0` and the identifier after it
 * as one junk token (`0o19`, `0xg`, `0x1_`) unless the digits are all of it (`J`, the identifier
 * characters left, is empty); with no digit, `0x` or `0x_` alone is an invalid integer.
 */
type RadixEnd<
	Acc extends string,
	S extends string,
	J extends string,
	Kind extends string,
> = Acc extends `0${infer _P}${infer _D}${infer _R}` // at least one digit after the prefix
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
				? [Int, R1] // `1..2`: the integer, then `..`
				: DigitRun<R2, ""> extends [
							infer Frac extends string,
							infer R3 extends string,
						]
					? TakeExponent<`${Int}.${Frac}`, R3>
					: never
			: TakeExponent<Int, R1>
		: never;
/**
 * Digits with single `_` separators between them, four at a time when possible (numbers can be
 * thousands of digits long). Characters are inferred unconstrained and tested afterwards: a
 * template built from `infer X extends Digit` parts is a 10^4-member union at declaration time.
 */
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
