import type { Empty } from "../empty.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Fragment, InlineFragment } from "../query.js";
import type { SlotNames } from "./splice.js";
import type { NotLiteralMessage } from "./text.js";

type InlineName<N extends number | string> = `__typesql_inline${N}`;

/**
 * A statement with `${fragment}` / `${query}` interpolations as
 * `[text, slots]`: each becomes an internal `{name}` slot, and an omitted
 * `${sql.optional(…)}` an empty one. `null` for a literal statement.
 * TypeScript types such a template as a pattern that keeps each fragment's
 * type as a placeholder, which no string literal has.
 */
export type Inlined<Q extends string> = string extends Q
	? null
	: {} extends Record<Q, 1>
		? Merge<Q extends unknown ? Lift<Q, "", []> : never>
		: null;

/** The statement text with each interpolated fragment as an internal slot. */
export type InlinedText<Q extends string> =
	Inlined<Q> extends readonly [infer T extends string, unknown] ? T : Q;

/** The fragments those internal slots hold. */
export type InlinedSlots<Q extends string> =
	Inlined<Q> extends readonly [string, infer F] ? F : {};

/** Splits at spaces, so only the words holding a placeholder go char by char. */
type Lift<
	Q extends string,
	Acc extends string,
	Fs extends readonly unknown[],
> = Q extends InlineFragment
	? Finish<LiftWord<Q, Acc, Fs>>
	: Q extends `${infer Word} ${infer Rest}`
		? LiftWord<Word, Acc, Fs> extends [
				infer A extends string,
				infer F extends readonly unknown[],
			]
			? Lift<Rest, `${A} `, F>
			: LiftWord<Word, Acc, Fs>
		: Finish<LiftWord<Q, Acc, Fs>>;

type Finish<R> = R extends [
	infer A extends string,
	infer F extends readonly unknown[],
]
	? Quoted<A, F> extends true
		? SqlError<
				"a fragment cannot be interpolated inside a quoted string, quoted identifier, dollar-quoted string or comment; remove the surrounding quotes or comment",
				null
			>
		: [
				A,
				{
					readonly [I in keyof F &
						`${number}` as `__typesql_inline${I}`]: F[I] extends Empty
						? Fragment<"", [], []>
						: F[I];
				},
			]
	: R;

/**
 * A word that is one placeholder comes back as the fragment's own type, and
 * so does the rest of a word after a placeholder when it is one too.
 */
type LiftWord<
	W extends string,
	Acc extends string,
	Fs extends readonly unknown[],
> = W extends InlineFragment
	? [`${Acc}{${InlineName<Fs["length"]>}}`, [...Fs, W]]
	: {} extends Record<W, 1>
		? LiftChars<W, Acc, Fs>
		: [`${Acc}${W}`, Fs];

type LiftChars<
	W extends string,
	Acc extends string,
	Fs extends readonly unknown[],
> = W extends InlineFragment
	? [`${Acc}{${InlineName<Fs["length"]>}}`, [...Fs, W]]
	: W extends `${infer C}${infer R}`
		? C extends InlineFragment
			? LiftChars<R, `${Acc}{${InlineName<Fs["length"]>}}`, [...Fs, C]>
			: {} extends Record<C, 1>
				? C extends `${infer F extends InlineFragment}`
					? LiftChars<R, `${Acc}{${InlineName<Fs["length"]>}}`, [...Fs, F]>
					: SqlError<NotLiteralMessage, 0>
				: LiftChars<R, `${Acc}${C}`, Fs>
		: W extends ""
			? [Acc, Fs]
			: SqlError<NotLiteralMessage, 0>;

/** Whether a fragment's slot landed where `{name}` is not a slot. */
type Quoted<T extends string, Fs extends readonly unknown[]> = [
	Exclude<InlineName<Extract<keyof Fs, `${number}`>>, SlotNames<T>>,
] extends [never]
	? false
	: true;

/** The members of a union of statements (`${flag ? a : b}`) as one statement with union slots. */
type Merge<L> = [Extract<L, AnyErr>] extends [never]
	? [L] extends [readonly [infer T extends string, infer S]]
		? [T, MergeSlots<S>]
		: never
	: Extract<L, AnyErr>;
type MergeSlots<S> = {
	readonly [K in S extends unknown ? keyof S : never]: S extends unknown
		? K extends keyof S
			? S[K]
			: never
		: never;
};
