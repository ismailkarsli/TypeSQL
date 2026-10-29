import type { AnyErr, SqlError } from "../engine/errors.js";
import type { HasDefaultable, ValueEnc } from "../engine/inline.js";
import type {
	HasSlots,
	JoinedText,
	UnionList,
	UnknownTuple,
} from "../engine/splice.js";
import type { Fragment, TextType } from "../query.js";
import type { CarriedOf, SlotTexts, Slottable } from "./slots.js";
import type {
	IsLiteral,
	NotLiteralMessage,
	Prepared,
	Surface,
} from "./text.js";

export type LiteralParts<Parts extends readonly string[]> = {
	readonly [I in keyof Parts]: string extends Parts[I]
		? never
		: {} extends Record<Parts[I], 1>
			? never
			: Parts[I];
};

type FragCheck<Text extends string, Slotted extends boolean> =
	IsLiteral<Text> extends false
		? SqlError<NotLiteralMessage, 0>
		: HasSlots<Text> extends Slotted
			? Prepared<Text> extends infer P
				? P extends AnyErr
					? P
					: HasDefaultable<Text> extends true
						? SqlError<
								"a sql.param() value that can be undefined is sent as DEFAULT, which a fragment cannot check; narrow it, or pass value ?? null",
								null
							>
						: true
				: never
			: never;

type FragArgs<Text extends string> =
	Prepared<Text> extends [
		string,
		infer Names extends string[],
		readonly unknown[],
		infer M extends number,
	]
		? Names extends []
			? UnknownTuple<M>
			: [params: { readonly [K in Names[number]]: unknown }]
		: readonly unknown[];

export type FragCount<Text extends string> =
	Prepared<Text> extends [
		string,
		string[],
		infer Encs extends readonly unknown[],
		infer M extends number,
	]
		? [...UnknownTuple<M>, ...Encs]["length"]
		: 0;

export type FragCarried<Text extends string, A extends readonly unknown[]> =
	Prepared<Text> extends [
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
	Acc extends readonly unknown[] = [],
> = Items extends readonly [infer H, ...infer R]
	? JoinedCarried<
			R,
			[
				...Acc,
				...(CarriedOf<H> extends infer C extends readonly unknown[] ? C : []),
			]
		>
	: Acc;

type ElemPairs<F> = F extends unknown
	? TextType<F> extends infer T extends string
		? T extends unknown
			? readonly [T, CarriedOf<F>]
			: never
		: never
	: never;

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

export type ListRep<E, Sep extends string> = [E] extends [never]
	? { readonly text: string; readonly carried: [] }
	: ElemPairs<E> extends infer P
		? AnyDynamic<P> extends true
			? { readonly text: string; readonly carried: [] }
			: UnionList<P> extends infer Ps extends readonly unknown[]
				? {
						readonly text: JoinedText<PairTexts<Ps>, Sep>;
						readonly carried: PairCarried<Ps>;
					}
				: never
		: never;

export type CombineOf<
	Items extends readonly Slottable[],
	Sep extends string,
> = string extends Sep
	? Fragment<string, readonly unknown[], []>
	: number extends Items["length"]
		? Fragment<
				ListRep<Items[number], Sep>["text"],
				readonly unknown[],
				ListRep<Items[number], Sep>["carried"]
			>
		: Fragment<
				JoinedText<
					SlotTexts<Items> extends readonly { readonly text: string }[]
						? SlotTexts<Items>
						: never,
					Sep
				>,
				readonly unknown[],
				JoinedCarried<Items>
			>;

export type CombineSeparator = ", " | " AND " | " OR " | (string & {});

export type GateFragCheck<Text extends string, Slotted extends boolean> = [
	Text,
	Slotted,
] extends [infer T2 extends string, infer B extends boolean]
	? Surface<FragCheck<T2, B>>
	: never;

export type BoxFragArgs<Text extends string> = Extract<
	{ [K in Text as `${K}`]: FragArgs<K> }[`${Text}`],
	readonly unknown[]
>;
