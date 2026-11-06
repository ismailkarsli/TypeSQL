import type { Empty } from "../empty.js";
import type { Tup } from "../engine/num.js";
import type { Members } from "../engine/object.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Fragment, TextType } from "../query.js";
import type { HasDefaultable, ValueEnc } from "./inline.js";
import type {
	Inlined,
	InlinedSlots,
	InlinedText,
	QuotedSlot,
} from "./inline-fragment.js";
import type { Lexis } from "./lexis.js";
import type {
	CarriedOf,
	SlotCarried,
	SlotTexts,
	Slottable,
	SlotVariants,
} from "./slots.js";
import type { JoinedText, Splice, SpliceCarried } from "./splice.js";
import type {
	IsLiteral,
	NotLiteralMessage,
	Prepared,
	PText,
	Surface,
} from "./text.js";

export type LiteralParts<Parts extends readonly string[]> = {
	readonly [I in keyof Parts]: string extends Parts[I]
		? never
		: {} extends Record<Parts[I], 1>
			? never
			: Parts[I];
};

type FragCheck<Text extends string, L extends Lexis> =
	IsLiteral<Text> extends false
		? SqlError<NotLiteralMessage, 0>
		: Prepared<Text, L> extends infer P
			? P extends AnyErr
				? P
				: HasDefaultable<Text> extends true
					? SqlError<
							"a sql.param(sql.optional(…)) value, or a sql.json() value that can be undefined, is sent as DEFAULT, which a fragment cannot check; narrow it, or use null for SQL NULL",
							null
						>
					: true
			: never;

type FragArgs<Text extends string, L extends Lexis> =
	Prepared<Text, L> extends [
		string,
		infer Names extends string[],
		readonly unknown[],
		infer M extends number,
	]
		? Names extends []
			? Tup<M, unknown>
			: // biome-ignore lint/plugin: named fragment parameters accept any value; the SQL decides their types.
				[params: { readonly [K in Names[number]]: unknown }]
		: readonly unknown[];

type FragCount<Text extends string, L extends Lexis> =
	Prepared<Text, L> extends [
		string,
		string[],
		infer Encs extends readonly unknown[],
		infer M extends number,
	]
		? [...Tup<M, unknown>, ...Encs]["length"]
		: 0;

type FragCarried<
	Text extends string,
	A extends readonly unknown[],
	L extends Lexis,
> =
	Prepared<Text, L> extends [
		string,
		infer Names extends string[],
		infer Encs extends readonly string[],
		number,
	]
		? Names extends []
			? [...EncAll<A>, ...Encs]
			: [...EncNamed<Names, A[0]>, ...Encs]
		: [];

type EncAll<A extends readonly unknown[]> = {
	-readonly [I in keyof A]: ValueEnc<A[I]>;
};

type EncNamed<Names extends string[], O> = {
	[I in keyof Names]: Names[I] extends keyof O ? ValueEnc<O[Names[I]]> : "*";
};

type JoinedCarried<
	Items extends readonly unknown[],
	L extends Lexis,
	Acc extends readonly unknown[] = [],
> = Items extends readonly [infer H, ...infer R]
	? JoinedCarried<
			R,
			L,
			[
				...Acc,
				...(CarriedOf<H, L> extends infer C extends readonly unknown[]
					? C
					: []),
			]
		>
	: Acc;

type ElemPairs<F, Wrap extends boolean, L extends Lexis> = F extends unknown
	? TextType<F> extends infer T extends string
		? T extends unknown
			? readonly [Wrap extends true ? Parened<F, T> : T, CarriedOf<F, L>]
			: never
		: never
	: never;

declare const GROUPED: unique symbol;
/** A sql.and / sql.or result: already one parenthesized condition. */
type Grouped = { readonly [GROUPED]: true };

type Parened<F, T extends string> = string extends T
	? T
	: F extends Grouped
		? T
		: `(${T})`;

type AnyDynamic<P> = true extends (
	P extends readonly [infer T extends string, unknown]
		? IsLiteral<T> extends true
			? false
			: true
		: true
)
	? true
	: false;

type PairCarried<
	Ps extends readonly unknown[],
	Acc extends readonly unknown[] = [],
> = Ps extends readonly [
	readonly [string, infer C extends readonly unknown[]],
	...infer R,
]
	? PairCarried<R, [...Acc, ...C]>
	: Acc;

type PairTexts<Ps extends readonly unknown[]> = {
	[I in keyof Ps]: {
		readonly text: Ps[I] extends readonly [infer T extends string, unknown]
			? T
			: string;
	};
};

export type ListRep<
	E,
	Sep extends string,
	L extends Lexis,
	Wrap extends boolean = false,
> = [E] extends [never]
	? { readonly text: string; readonly carried: []; readonly count: number }
	: ElemPairs<E, Wrap, L> extends infer P
		? AnyDynamic<P> extends true
			? { readonly text: string; readonly carried: []; readonly count: number }
			: Members<P> extends infer Ps extends readonly unknown[]
				? {
						readonly text: JoinedText<PairTexts<Ps>, Sep, L>;
						readonly carried: PairCarried<Ps>;
						readonly count: Ps["length"];
					}
				: never
		: never;

// Match runtime filtering for sql.optional(…) omissions. Conditional entries are
// checked as present, like elements of a runtime list's representative statement.
type PresentItems<
	Items extends readonly (Slottable | Empty)[],
	Acc extends readonly Slottable[] = [],
> = number extends Items["length"]
	? [...Acc, ...Exclude<Items[number], Empty>[]]
	: Items extends readonly []
		? Acc
		: Items extends readonly [
					Slottable | Empty,
					...infer R extends readonly (Slottable | Empty)[],
				]
			? PresentItems<
					R,
					[Exclude<Items[0], Empty>] extends [never]
						? Acc
						: [...Acc, Exclude<Items[0], Empty>]
				>
			: Acc;

export type CombineOf<
	Items extends readonly (Slottable | Empty)[],
	Sep extends string,
	L extends Lexis,
> = CombinePresent<
	number extends Items["length"]
		? readonly Exclude<Items[number], Empty>[]
		: PresentItems<Items>,
	Sep,
	L
>;

type CombinePresent<
	Items extends readonly Slottable[],
	Sep extends string,
	L extends Lexis,
> = string extends Sep
	? Fragment<string, readonly unknown[], []>
	: number extends Items["length"]
		? Fragment<
				ListRep<Items[number], Sep, L>["text"],
				readonly unknown[],
				ListRep<Items[number], Sep, L>["carried"]
			>
		: Fragment<
				JoinedText<
					SlotTexts<Items> extends readonly { readonly text: string }[]
						? SlotTexts<Items>
						: never,
					Sep,
					L
				>,
				readonly unknown[],
				JoinedCarried<Items, L>
			>;

export type CombineSeparator = ", " | (string & {});

// sql.and / sql.or: each item and, for several items, the whole result is
// parenthesized. No items gives the operator's identity (true or false).
export type BoolOf<
	Items extends readonly (Slottable | Empty)[],
	Op extends "AND" | "OR",
	L extends Lexis,
> = BoolPresent<
	number extends Items["length"]
		? readonly Exclude<Items[number], Empty>[]
		: PresentItems<Items>,
	Op,
	L
>;

type BoolPresent<
	Items extends readonly Slottable[],
	Op extends "AND" | "OR",
	L extends Lexis,
> = number extends Items["length"]
	? ListRep<Items[number], ` ${Op} `, L, true> extends {
			readonly text: infer T extends string;
			readonly carried: infer C extends readonly unknown[];
			readonly count: infer N;
		}
		? Fragment<Group<T, N>, readonly unknown[], C> & Grouped
		: never
	: Items extends readonly []
		? Fragment<Op extends "AND" ? "true" : "false", [], []> & Grouped
		: Fragment<
				Group<JoinedText<Parens<Items>, ` ${Op} `, L>, Items["length"]>,
				readonly unknown[],
				JoinedCarried<Items, L>
			> &
				Grouped;

type Parens<Items extends readonly unknown[]> = {
	[I in keyof Items]: {
		readonly text: TextType<Items[I]> extends infer T extends string
			? Parened<Items[I], T>
			: string;
	};
};

type Group<Text extends string, N> = string extends Text
	? string
	: N extends 1
		? Text
		: `(${Text})`;

export type GateFragCheck<Text extends string, L extends Lexis> =
	Inlined<Text> extends infer I
		? I extends AnyErr
			? I
			: [
						I extends readonly [infer T2 extends string, unknown]
							? QuotedSlot<T2, L>
							: never,
					] extends [infer QE]
				? [QE] extends [never]
					? [InlinedText<Text>] extends [infer T2 extends string]
						? Surface<FragCheck<T2, L>>
						: never
					: QE
				: never
		: never;

export type BoxFragArgs<Text extends string, L extends Lexis> = [
	InlinedText<Text>,
] extends [infer T2 extends string]
	? Extract<
			{ [K in T2 as `${K}`]: FragArgs<K, L> }[`${T2}`],
			readonly unknown[]
		>
	: never;

/** `sql.fragment(text, ...params)`; its `${fragment}` interpolations are slots. */
export type PlainFragment<
	Text extends string,
	A extends readonly unknown[],
	L extends Lexis,
> =
	Inlined<Text> extends null
		? Fragment<
				PText<Text, L>,
				Tup<FragCount<Text, L>, unknown>,
				FragCarried<Text, A, L>
			>
		: InlinedFragment<Text, A, L>;

/** One fragment for each combination of union fragments, so each text keeps its own values. */
type InlinedFragment<
	Text extends string,
	A extends readonly unknown[],
	L extends Lexis,
> = [InlinedText<Text>] extends [infer T2 extends string]
	? SlotVariants<InlinedSlots<Text>> extends infer V
		? V extends unknown
			? Splice<PText<T2, L>, SlotTexts<V>, L> extends infer X extends string
				? Fragment<
						X,
						readonly unknown[],
						[
							...FragCarried<T2, A, L>,
							...SpliceCarried<PText<T2, L>, SlotCarried<V, L>, L>,
						]
					>
				: never
			: never
		: never
	: never;
