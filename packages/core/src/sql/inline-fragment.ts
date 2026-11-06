import type { Empty } from "../empty.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Fragment, InlineFragment } from "../query.js";
import type { Lexis } from "./lexis.js";
import type { InlineName, SlotNames, SlotNamesIn } from "./splice.js";
import type { NotLiteralMessage } from "./text.js";

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

type Lift<
	Q extends string,
	Acc extends string,
	Fs extends readonly unknown[],
> = Q extends `${infer Line}\n${infer Rest}`
	? {} extends Record<Line, 1>
		? LiftLine<Line, Acc, Fs> extends [
				infer A extends string,
				infer F extends readonly unknown[],
			]
			? Lift<Rest, `${A}\n`, F>
			: LiftLine<Line, Acc, Fs>
		: Lift<Rest, `${Acc}${Line}\n`, Fs>
	: LiftLine<Q, Acc, Fs> extends infer R
		? Finish<R>
		: never;

type LiftLine<
	Q extends string,
	Acc extends string,
	Fs extends readonly unknown[],
> =
	{} extends Record<Q, 1>
		? Q extends InlineFragment
			? [`${Acc}{${InlineName<Fs["length"]>}}`, [...Fs, Q]]
			: Q extends `${infer Word} ${infer Rest}`
				? {} extends Record<Word, 1>
					? LiftChars<Word, Acc, Fs> extends [
							infer A extends string,
							infer F extends readonly unknown[],
						]
						? LiftLine<Rest, `${A} `, F>
						: LiftChars<Word, Acc, Fs>
					: LiftLine<Rest, `${Acc}${Word} `, Fs>
				: LiftChars<Q, Acc, Fs>
		: [`${Acc}${Q}`, Fs];

type Finish<R> = R extends [
	infer A extends string,
	infer F extends readonly unknown[],
]
	? [
			A,
			{
				readonly [I in keyof F &
					`${number}` as InlineName<I>]: F[I] extends Empty
					? Fragment<"", [], []>
					: F[I];
			},
		]
	: R;

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

/**
 * The error for a statement `T` (Inlined text) with a fragment's slot where
 * `{name}` is not a slot, which lexis `L` reads as quoted text or a comment.
 */
export type QuotedSlot<T extends string, L extends Lexis> = T extends unknown
	? [Exclude<SlotNamesIn<T>, SlotNames<T, L>>] extends [never]
		? never
		: SqlError<
				"a fragment cannot be interpolated inside a quoted string, quoted identifier, dollar-quoted string or comment; remove the surrounding quotes or comment",
				null
			>
	: never;

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
