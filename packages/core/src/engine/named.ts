import type { SqlError } from "./errors.js";
import type { Opaque, SplitFirst } from "./inline.js";
import type { MaxParamStr } from "./splice.js";

/**
 * Named parameter sugar: `:name` is rewritten to `$k` where `k` is the position of the
 * name's first appearance. Done on the text, as the runtime does (`rewriteNamed` in
 * runtime/splice.ts), so the statement checked is the one sent: `::` casts, `:=`, a colon
 * followed by a space (`JSON_OBJECT('k': v)`, `a[1: n]`) and colons inside quoted strings,
 * quoted identifiers, comments and dollar-quoted strings are never touched.
 *
 * `RewriteNamed<Q>` → `[text, names]` (`names` is `[]` when the statement uses `$n`).
 * Mixing `:name` and `$n` is an error.
 */
export type RewriteNamed<Q extends string> =
	RewriteNamedStr<Q> extends [infer T, infer Names]
		? Names extends []
			? [T, []]
			: MaxParamStr<Q> extends 0
				? [T, Names]
				: SqlError<"cannot mix named (:name) and positional ($n) parameters", 0>
		: never;

/** 1-based position of `Name` in `Names`, or `Names["length"] + 1` when absent. */
type IndexOf<
	Names extends string[],
	Name extends string,
	Acc extends unknown[] = [],
> = Names extends [infer H, ...infer R extends string[]]
	? H extends Name
		? [...Acc, 0]["length"]
		: IndexOf<R, Name, [...Acc, 0]>
	: [...Acc, 0]["length"];

/**
 * Object type for named parameters given the positional tuple (`names[i]` ↔ `params[i]`).
 * A name the rewrite took for code that PostgreSQL reads inside a literal or a comment
 * (`E'\':a'`, or after the inner closer of a nested block comment; the runtime reads them
 * alike) has no parameter: `never`, as no value sent for it would be accepted.
 */
export type NamedParams<
	Names extends readonly string[],
	Params extends readonly unknown[],
> = {
	-readonly [I in keyof Names & `${number}` as Names[I]]: Params[I &
		keyof Params];
} extends infer O
	? { [K in keyof O]: O[K] } // spelled out, not shown as `NamedParams<…>`
	: never;

// ───────────────────────────── text rewrite ─────────────────────────────

/**
 * `RewriteNamedStr<Text>` → `[text with :name → $k, names]`, operating on the literal
 * itself (needed before fragment splicing).
 */
export type RewriteNamedStr<Text extends string> =
	HasSingleColon<Text> extends true // type-mutate: equivalent cond-true – a shortcut: text with only cast colons has no name, and the loop copies it
		? NamedLoop<Text, "", []>
		: [Text, []];

/** Cast pairs never start a named parameter. Bound the shortcut: opaque text may contain many. */
type HasSingleColon<
	S extends string,
	Budget extends unknown[] = [],
> = Budget["length"] extends 128 // type-mutate: equivalent cond-swap cond-true never-true never-false – true and never choose the complete rewrite; an early fallback preserves its result
	? true // type-mutate: equivalent never-true – never also chooses the complete rewrite
	: S extends `${string}:${infer R}` // type-mutate: equivalent never-true – never passes the caller's extends true gate and only runs the full rewrite for cast-only text
		? R extends `:${infer Rest}` // type-mutate: equivalent cond-false never-true – treating a cast as a possible name only runs the full, cast-aware rewrite
			? HasSingleColon<Rest, [...Budget, 0]>
			: true // type-mutate: equivalent never-false – never and true both pass the caller's extends true gate
		: false; // type-mutate: equivalent never-false bool-flip – running the full rewrite without a colon copies the text unchanged

type NamedLoop<T extends string, Acc extends string, Names extends string[]> =
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
			? RewriteCode<Pre, "", Names> extends [
					infer C extends string,
					infer N2 extends string[],
				]
				? DollarBody<`${InCode}${O}${Rest}`, Tag> extends [
						infer Seg extends string,
						infer After extends string,
					]
					? NamedLoop<After, `${Acc}${C}${Tag}${Seg}`, N2>
					: never
				: never
			: RewriteCode<Code, "", Names> extends [
						infer C extends string,
						infer N2 extends string[],
					]
				? O extends ""
					? [`${Acc}${C}`, N2]
					: Opaque<O, Rest> extends [
								infer Seg extends string,
								infer After extends string,
							]
						? NamedLoop<After, `${Acc}${C}${O}${Seg}`, N2>
						: never
				: never
		: never;

/**
 * `[code before, opener, code after]` at the first dollar-quote opener (`$$`, `$tag$`) in a
 * code segment, else `null`. The runtime's rule: a `$` followed by an optional name and a `$`.
 */
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
/** A dollar-quoted body up to and including its closer: `[segment, rest]` (unclosed: the rest of the text). */
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

/**
 * Rewrite `:name` occurrences in a quote-free code segment: a `:` directly followed by a
 * name start, not part of `::`.
 */
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
