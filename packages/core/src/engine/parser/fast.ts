import type { Digit, IdStart, NonIdAscii, Ws } from "../lexer/chars.js";
import type { Lex } from "../lexer/lex.js";
import type { IdTok, Toks, WordTok } from "../lexer/tokens.js";
import type { MaxParam } from "../typer/params.js";
import type { ColNode } from "./expr.js";
import type { NotBareLabel, NotColId } from "./keywords.js";
import type {
	ParseSelectTail,
	ParseSimpleAfterTargets,
	ParseTargetList,
	StarNode,
	TargetNode,
} from "./select.js";
import type { Nx, Ok } from "./util.js";

/**
 * Parse the projection separately from the FROM tail so repeated headers share their work.
 * Simple column targets bypass tokenization; computed targets use the expression parser.
 * Anything uncertain returns never, leaving the original pipeline to handle it and its errors.
 */
export type FastSelect<Q extends string> =
	TrimStart<Q> extends `${"SELECT" | "select"}${Ws}${infer Rest}` // type-mutate: equivalent cond-false union-drop – declining this shortcut leaves the complete parser responsible for the same SQL
		? SplitFrom<TrimStart<Rest>>
		: never;

type SplitFrom<S extends string> = S extends `${infer Cs}FROM${Ws}${infer Rest}` // type-mutate: equivalent cond-false never-true never-false – omitting a FROM-case shortcut leaves the complete parser authoritative
	? Cs extends `${string}${Ws}` // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
		? SelectFrom<Cs, TrimStart<Rest>>
		: never
	: S extends `${infer Cs}from${Ws}${infer Rest}` // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
		? Cs extends `${string}${Ws}` // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
			? SelectFrom<Cs, TrimStart<Rest>>
			: never
		: never;
// A textual FROM inside a line comment is not a clause; let the full lexer locate it.
type SelectFrom<
	Cs extends string,
	Rest extends string,
> = Cs extends `${string}--${string}` // type-mutate: equivalent cond-true – declining this shortcut leaves the complete parser responsible for the same SQL
	? never
	: AllTargets<Cs> extends infer Ts // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
		? Ts extends readonly unknown[] // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
			? GeneralTail<Ts, Rest>
			: never
		: never;
type AllTargets<S extends string> =
	Targets<S> extends infer Ts // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
		? Ts extends readonly unknown[] // type-mutate: equivalent cond-swap cond-true cond-false never-true never-false – the complete target parser gives the same targets; null or never declines the optimization
			? Ts
			: S extends `${string}$${string}` // type-mutate: equivalent cond-true never-true never-false – null and never both decline computed-header optimization; the general pipeline still handles parameters
				? null
				: Lex<S> extends infer T // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
					? T extends Toks // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
						? ParseTargetList<T, 0, []> extends Ok<infer Cs, infer J> // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
							? T[J] extends undefined // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
								? Cs
								: null // type-mutate: equivalent never-false – null and never both decline a header with leftover tokens
							: null // type-mutate: equivalent never-false – null and never both decline a failed target parse
						: null // type-mutate: equivalent never-false – null and never both decline a failed header lex
					: null
		: null;

type GeneralTail<Ts, Rest extends string> =
	Lex<`FROM ${Rest}`> extends infer T // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
		? T extends Toks // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
			? ParseSimpleAfterTargets<T, 0, false, Ts> extends Ok<infer Body, infer J> // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
				? ParseSelectTail<T, Body, null, J> extends Ok<infer Stmt, infer End> // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
					? T[End] extends undefined // type-mutate: equivalent cond-false – declining this shortcut leaves the complete parser responsible for the same SQL
						? { stmt: Stmt; max: MaxParam<T> }
						: never
					: never
				: never
			: never
		: never;

type Targets<
	S extends string,
	Acc extends readonly unknown[] = [],
> = Acc["length"] extends 64 // type-mutate: equivalent cond-swap cond-true never-true never-false cond-false – the exact-mutant capacity sweep preserves every supported inferred type; this only selects identical targets longer and may expand compiler capacity
	? null
	: S extends `${infer H},${infer R}` // type-mutate: equivalent cond-false never-true never-false – declining the column shortcut uses the complete target parser or general pipeline
		? Target<H> extends infer T // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
			? [T] extends [never] // type-mutate: equivalent cond-true never-true – declining the column shortcut uses the complete target parser or general pipeline
				? null
				: Targets<R, [...Acc, T]> // type-mutate: equivalent never-false – declining the column shortcut uses the complete target parser or general pipeline
			: null
		: Target<S> extends infer T // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
			? [T] extends [never] // type-mutate: equivalent cond-true never-true – declining the column shortcut uses the complete target parser or general pipeline
				? null
				: [...Acc, T] // type-mutate: equivalent never-false – declining the column shortcut uses the complete target parser or general pipeline
			: null;
type Target<S extends string> =
	TrimStart<S> extends `*${infer R}` // type-mutate: equivalent cond-false never-true never-false – declining the column shortcut uses the complete target parser or general pipeline
		? TargetAlias<StarNode<null>, R>
		: ReadName<TrimStart<S>> extends [
					// type-mutate: equivalent cond-false – declining the column shortcut uses the complete target parser or general pipeline
					infer N extends string, // type-mutate: equivalent infer-bare – the name reader already returns string names and tail text
					infer R extends string,
				]
			? TrimStart<R> extends `.${infer R2}` // type-mutate: equivalent cond-false never-true – declining the column shortcut uses the complete target parser or general pipeline
				? TrimStart<R2> extends `*${infer Tail}` // type-mutate: equivalent cond-false never-true never-false – declining the column shortcut uses the complete target parser or general pipeline
					? TargetAlias<StarNode<N>, Tail>
					: ReadLabel<TrimStart<R2>> extends [
								// type-mutate: equivalent cond-false – declining the column shortcut uses the complete target parser or general pipeline
								infer C extends string, // type-mutate: equivalent infer-bare – the name reader already returns string names and tail text
								infer Tail extends string,
							]
						? TargetAlias<ColNode<N, C>, Tail>
						: never
				: TargetAlias<ColNode<null, N>, R> // type-mutate: equivalent never-false – declining the column shortcut uses the complete target parser or general pipeline
			: never;
type TargetAlias<E, S extends string> =
	TrimStart<S> extends infer R extends string // type-mutate: equivalent cond-false – declining the column shortcut uses the complete target parser or general pipeline
		? R extends "" // type-mutate: equivalent cond-false never-true never-false – declining the column shortcut uses the complete target parser or general pipeline
			? TargetNode<E, null>
			: R extends `${"AS" | "as"}${Ws}${infer Tail}` // type-mutate: equivalent cond-false never-true never-false union-drop – declining the column shortcut uses the complete target parser or general pipeline
				? ReadLabel<TrimStart<Tail>> extends [infer A, infer End extends string] // type-mutate: equivalent cond-false tuple-swap – the complete target parser preserves accepted ASTs; names are strings and swapped aliases fail end-of-input checks
					? TrimStart<End> extends "" // type-mutate: equivalent cond-false – declining the column shortcut uses the complete target parser or general pipeline
						? TargetNode<E, A>
						: never
					: never
				: ReadRaw<R> extends [
							// type-mutate: equivalent cond-false – declining the column shortcut uses the complete target parser or general pipeline
							infer A extends string, // type-mutate: equivalent tuple-swap infer-bare – the raw reader already returns string names and tail text
							infer End extends string, // type-mutate: equivalent tuple-swap – a swapped nonempty alias name or boolean quote flag cannot pass the string end-of-input check
							infer Quoted,
						]
					? TrimStart<End> extends "" // type-mutate: equivalent cond-false – declining the column shortcut uses the complete target parser or general pipeline
						? Quoted extends true // type-mutate: equivalent cond-false never-true never-false – rejecting quoted labels as keywords or declining them uses the complete target parser
							? TargetNode<E, A>
							: A extends NotBareLabel // type-mutate: equivalent cond-true – declining the column shortcut uses the complete target parser or general pipeline
								? never
								: TargetNode<E, A>
						: never
					: never
		: never;

/** Isolated names share the lexer; the bounded fallback consumes ASCII prefixes only. */
type NameChar = IdStart | Digit | "$";
type ReadName<S extends string> =
	ReadRaw<S> extends [infer N extends string, infer R, infer Quoted] // type-mutate: equivalent cond-false never-true infer-bare tuple-swap – the swapped quote flag is boolean and fails the target reader's string-tail constraint
		? Quoted extends true // type-mutate: equivalent cond-false never-true never-false – rejecting names only declines the shortcut; never cannot pass the literal target-tail checks
			? [N, R]
			: N extends NotColId // type-mutate: equivalent cond-true never-true – rejecting names only declines the shortcut; never cannot pass the literal target-tail checks
				? null
				: [N, R] // type-mutate: equivalent never-false – rejecting names only declines the shortcut; never cannot pass the literal target-tail checks
		: null; // type-mutate: equivalent never-false – rejecting names only declines the shortcut; never cannot pass the literal target-tail checks
type ReadLabel<S extends string> =
	ReadRaw<S> extends [infer N, infer R, unknown] ? [N, R] : null; // type-mutate: equivalent cond-false never-true never-false – null or never labels fail the literal name/tail checks and decline the shortcut
type ReadRaw<S extends string> = S extends `${infer N} ${infer R}` // type-mutate: equivalent never-true never-false cond-false – declining identifier caching uses the same ASCII prefix reader or complete parser; non-ASCII suffixes cannot become aliases through that same disabled cache
	? NameOnly<N> extends [infer Name, infer Quoted] // type-mutate: equivalent never-true tuple-swap cond-false – declining identifier caching uses the same ASCII prefix reader or complete parser; non-ASCII suffixes cannot become aliases through that same disabled cache
		? [Name, ` ${R}`, Quoted]
		: ReadRawChars<S> // type-mutate: equivalent never-false – never cannot supply a literal string name and tail, so the complete target parser is used
	: NameOnly<S> extends [infer Name, infer Quoted] // type-mutate: equivalent never-true cond-false – declining identifier caching uses the same ASCII prefix reader or complete parser; non-ASCII suffixes cannot become aliases through that same disabled cache
		? [Name, "", Quoted]
		: ReadRawChars<S>; // type-mutate: equivalent never-false – never cannot supply a literal string name and tail, so the complete target parser is used
type NameOnly<S extends string> = S extends `"${string}"` // type-mutate: equivalent cond-true never-true never-false cond-swap cond-false – broader screening still requires exactly one lexer identifier; narrower screening uses the same prefix reader or complete parser
	? SingleName<Lex<S>>
	: S extends `${string}${NonIdAscii}${string}` // type-mutate: equivalent cond-false never-true cond-swap cond-true – broader screening still requires exactly one lexer identifier; narrower screening uses the same prefix reader or complete parser
		? null
		: SingleName<Lex<S>>; // type-mutate: equivalent never-false – never cannot supply a literal string name; the complete target parser handles the header
type SingleName<T> = T extends readonly [IdTok<infer N>] // type-mutate: equivalent cond-false never-true never-false – never cannot supply a literal string name and tail, so this only declines the shortcut
	? [N, true] // type-mutate: equivalent bool-flip – treating a quoted name as bare only rejects additional keywords; the complete parser preserves them
	: T extends readonly [WordTok<infer N>] // type-mutate: equivalent never-true cond-false – declining identifier caching uses the same ASCII prefix reader or complete parser; non-ASCII suffixes cannot become aliases through that same disabled cache
		? [N, false]
		: null; // type-mutate: equivalent never-false – never cannot supply a literal string name and tail, so this only declines the shortcut

type ReadRawChars<S extends string> = S extends `"${infer N}"${infer R}` // type-mutate: equivalent cond-false never-true never-false – never fails the later literal name/tail checks and declines the shortcut
	? R extends `"${string}` // type-mutate: equivalent cond-true never-true never-false cond-swap cond-false – the native cache already decodes escaped identifiers; otherwise ASCII-content and alias-EOF checks reject any doubled-quote split
		? null
		: N extends "" // type-mutate: equivalent cond-true never-true never-false – never fails the later literal name/tail checks and declines the shortcut
			? null
			: AllNameChars<N> extends true // type-mutate: equivalent cond-swap cond-true cond-false never-true bool-flip – the quote flag only controls keyword rejection; extra rejection delegates to the complete parser
				? [N, R, true] // type-mutate: equivalent bool-flip – the quote flag only controls keyword rejection; extra rejection delegates to the complete parser
				: null // type-mutate: equivalent never-false – never fails the later literal name/tail checks and declines the shortcut
	: S extends `${infer C extends IdStart}${infer R}` // type-mutate: equivalent cond-false never-true – never fails the later literal name/tail checks and declines the shortcut
		? NameTail<R, C>
		: null; // type-mutate: equivalent never-false – never fails the later literal name/tail checks and declines the shortcut
type AllNameChars<S extends string, B extends number = 0> = B extends 128 // type-mutate: equivalent cond-swap cond-true never-true never-false – quoted contents are already delimited; this screen only chooses the exact quoted reader or complete parser
	? false // type-mutate: equivalent bool-flip – quoted contents are already delimited; this screen only chooses the exact quoted reader or complete parser
	: S extends "" // type-mutate: equivalent cond-swap cond-true cond-false never-true never-false – quoted contents are already delimited; this screen only chooses the exact quoted reader or complete parser
		? true // type-mutate: equivalent bool-flip – quoted contents are already delimited; this screen only chooses the exact quoted reader or complete parser
		: S extends `${NameChar}${infer R}` // type-mutate: equivalent cond-false never-true – quoted contents are already delimited; this screen only chooses the exact quoted reader or complete parser
			? AllNameChars<R, Nx<B>>
			: false; // type-mutate: equivalent never-false bool-flip – quoted contents are already delimited; this screen only chooses the exact quoted reader or complete parser
type NameTail<
	S extends string,
	Acc extends string,
	B extends number = 0,
> = B extends 128 // type-mutate: equivalent cond-swap cond-true never-true never-false – one-character and bulk readers return the same ASCII prefix or reach conservative fallback sooner; never declines the shortcut
	? null
	: S extends `${infer A}${infer C2}${infer C}${infer D}${infer R}` // type-mutate: equivalent cond-false never-true – one-character and bulk readers return the same ASCII prefix or reach conservative fallback sooner; never declines the shortcut
		? [A | C2 | C | D] extends [NameChar] // type-mutate: equivalent cond-false never-true – one-character and bulk readers return the same ASCII prefix or reach conservative fallback sooner; never declines the shortcut
			? NameTail<R, `${Acc}${A}${C2}${C}${D}`, Nx<B>>
			: NameTailOne<S, Acc, B> // type-mutate: equivalent never-false – one-character and bulk readers return the same ASCII prefix or reach conservative fallback sooner; never declines the shortcut
		: NameTailOne<S, Acc, B>; // type-mutate: equivalent never-false – one-character and bulk readers return the same ASCII prefix or reach conservative fallback sooner; never declines the shortcut
type NameTailOne<
	S extends string,
	Acc extends string,
	B extends number,
> = S extends `${infer C extends NameChar}${infer R}` // type-mutate: equivalent never-true – never cannot supply a literal string name and tail, so the complete target parser handles the header
	? NameTail<R, `${Acc}${C}`, Nx<B>>
	: [Lowercase<Acc>, S, false]; // type-mutate: equivalent never-false – never cannot supply a literal string name and tail, so the complete target parser handles the header

type TrimStart<
	S extends string,
	B extends unknown[] = [],
> = B["length"] extends 128 // type-mutate: equivalent cond-swap cond-true never-true never-false – untrimmed or never text either parses identically with the complete lexer or declines this shortcut
	? S
	: S extends `${Ws}${infer R}` // type-mutate: equivalent cond-false never-true – untrimmed or never text either parses identically with the complete lexer or declines this shortcut
		? TrimStart<R, [...B, 0]>
		: S; // type-mutate: equivalent never-false – untrimmed or never text either parses identically with the complete lexer or declines this shortcut
