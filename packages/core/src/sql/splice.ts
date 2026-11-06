import type { Digit, TakeDigits } from "../engine/chars.js";
import type { Add, Lt, ToNum, Tup } from "../engine/num.js";
import type { SqlError } from "../errors.js";
import type { AllCode, Lexis, NextOpaque } from "./lexis.js";

export type Splice<Q extends string, S, L extends Lexis> = string extends Q
	? string
	: Q extends `${string}{${string}}${string}`
		? AllCode<Q, L> extends true
			? SpliceCode<Q, S, MaxParamStr<Q, L>, "", L> extends infer R
				? R extends [infer T extends string, number]
					? T
					: R
				: never
			: SpliceLoop<Q, S, MaxParamStr<Q, L>, "", L>
		: Q;

type SpliceLoop<
	Q extends string,
	S,
	Off extends number,
	Acc extends string,
	L extends Lexis,
> = Q extends `${string}{${string}}${string}`
	? NextOpaque<Q, L> extends [
			infer Code extends string,
			infer Seg extends string,
			infer After extends string,
		]
		? SpliceCode<Code, S, Off, "", L> extends infer R
			? R extends [infer T extends string, infer NewOff extends number]
				? Seg extends ""
					? `${Acc}${T}`
					: SpliceLoop<After, S, NewOff, `${Acc}${T}${Seg}`, L>
				: R
			: never
		: never
	: `${Acc}${Q}`;

type SpliceCode<
	Q extends string,
	S,
	Off extends number,
	Acc extends string,
	L extends Lexis,
> = Q extends `${infer Pre}{${infer Name}}${infer Post}`
	? IsSlotName<Name> extends true
		? Name extends keyof S
			? S[Name] extends { readonly text: infer FT extends string }
				? string extends FT
					? string
					: Renumber<FT, Off, "", L> extends [
								infer NT extends string,
								infer NewOff extends number,
							]
						? SpliceCode<Post, S, NewOff, `${Acc}${Pre}${NT}`, L>
						: never
				: string
			: SqlError<`unknown fragment slot {${Name}}`, null>
		: SpliceCode<Post, S, Off, `${Acc}${Pre}{${Name}}`, L>
	: [`${Acc}${Q}`, Off];

/** The SQL outside strings, quoted identifiers, comments and dollar quotes, where it has slots. */
type CodeOf<
	Q extends string,
	L extends Lexis,
> = Q extends `${string}{${string}}${string}`
	? AllCode<Q, L> extends true
		? Q
		: CodeOnly<Q, L>
	: "";
type CodeOnly<
	Q extends string,
	L extends Lexis,
	Acc extends string = "",
> = Q extends `${string}{${string}}${string}`
	? NextOpaque<Q, L> extends [
			infer Code extends string,
			infer Seg extends string,
			infer After extends string,
		]
		? Seg extends ""
			? `${Acc}${Code}`
			: CodeOnly<After, L, `${Acc}${Code} `>
		: never
	: Acc;

export type SpliceCarried<Q extends string, C, L extends Lexis> = CarriedIn<
	CodeOf<Q, L>,
	C,
	[]
>;
type CarriedIn<
	Q extends string,
	C,
	Acc extends readonly unknown[],
> = Q extends `${string}{${infer Name}}${infer Post}`
	? IsSlotName<Name> extends true
		? Name extends keyof C
			? C[Name] extends infer T extends readonly unknown[]
				? CarriedIn<Post, C, [...Acc, ...T]>
				: CarriedIn<Post, C, Acc>
			: Acc
		: CarriedIn<Post, C, Acc>
	: Acc;

export type InlineName<N extends number | string> = `__typesql_inline${N}`;

/** Only the internal slots that interpolated fragments become; any other `{…}` is SQL text. */
type IsSlotName<N extends string> = N extends InlineName<number> ? true : false;

export type SlotNames<Q extends string, L extends Lexis> = SlotNamesIn<
	CodeOf<Q, L>
>;
/** The internal slots in `Q`, quoted or not. */
export type SlotNamesIn<Q extends string> =
	Q extends `${string}{${infer Name}}${infer Post}`
		? IsSlotName<Name> extends true
			? Name | SlotNamesIn<Post>
			: SlotNamesIn<Post>
		: never;

type Renumber<
	T extends string,
	Off extends number,
	Acc extends string,
	L extends Lexis,
> = T extends `${string}$${string}`
	? Off extends 0
		? T extends `${string}$0${string}`
			? RenumberAll<T, Off, Acc, L>
			: [`${Acc}${T}`, MaxParamStr<T, L>]
		: RenumberAll<T, Off, Acc, L>
	: [`${Acc}${T}`, Off];
type RenumberAll<
	T extends string,
	Off extends number,
	Acc extends string,
	L extends Lexis,
> =
	AllCode<T, L> extends true
		? RenumberCode<T, Off, Off, Acc>
		: RenumberLoop<T, Off, Off, Acc, L>;
type RenumberLoop<
	T extends string,
	Off extends number,
	Max extends number,
	Acc extends string,
	L extends Lexis,
> =
	NextOpaque<T, L> extends [
		infer Code extends string,
		infer Seg extends string,
		infer After extends string,
	]
		? RenumberCode<Code, Off, Max, ""> extends [
				infer C extends string,
				infer M extends number,
			]
			? Seg extends ""
				? [`${Acc}${C}`, M]
				: RenumberLoop<After, Off, M, `${Acc}${C}${Seg}`, L>
			: never
		: never;
type RenumberCode<
	T extends string,
	Off extends number,
	Max extends number,
	Acc extends string,
> = T extends `${infer Pre}$${infer Rest}`
	? Rest extends `${infer D extends Digit}${infer R}`
		? TakeDigits<R, D> extends [infer N extends string, infer R2 extends string]
			? Add<ToNum<N>, Off> extends infer M extends number
				? RenumberCode<
						R2,
						Off,
						Lt<Max, M> extends true ? M : Max,
						`${Acc}${Pre}$${M}`
					>
				: never
			: never
		: RenumberCode<Rest, Off, Max, `${Acc}${Pre}$`>
	: [`${Acc}${T}`, Max];

export type MaxParamStr<
	T extends string,
	L extends Lexis,
> = T extends `${string}$${string}`
	? AllCode<T, L> extends true
		? MaxIn<T, 0>
		: MaxLoop<T, 0, L>
	: 0;
type MaxLoop<T extends string, Max extends number, L extends Lexis> =
	NextOpaque<T, L> extends [
		infer Code extends string,
		infer Seg extends string,
		infer After extends string,
	]
		? MaxIn<Code, Max> extends infer M extends number
			? Seg extends ""
				? M
				: MaxLoop<After, M, L>
			: never
		: never;
type MaxIn<
	T extends string,
	Max extends number,
> = T extends `${string}$${infer Rest}`
	? Rest extends `${infer D extends Digit}${infer R}`
		? TakeDigits<R, D> extends [infer N extends string, infer R2 extends string]
			? MaxIn<R2, Lt<Max, ToNum<N>> extends true ? ToNum<N> : Max>
			: never
		: MaxIn<Rest, Max>
	: Max;

export type UnknownTuple<N extends number> = Tup<N, unknown>;

export type Take<
	T extends readonly unknown[],
	N extends number,
	Acc extends unknown[] = [],
> = Acc["length"] extends N
	? Acc
	: T extends readonly [infer H, ...infer R]
		? Take<R, N, [...Acc, H]>
		: Acc;

export type QuotedIdent<
	Parts extends readonly string[],
	Q extends string,
> = Parts extends readonly [infer P extends string]
	? `${Q}${Dq<P, Q>}${Q}`
	: Parts extends readonly [
				infer P extends string,
				...infer R extends readonly string[],
			]
		? `${Q}${Dq<P, Q>}${Q}.${QuotedIdent<R, Q>}`
		: string;
type Dq<
	S extends string,
	Q extends string,
> = S extends `${infer A}${Q}${infer B}` ? `${A}${Q}${Q}${Dq<B, Q>}` : S;

export type JoinedText<
	Items extends readonly { readonly text: string }[],
	Sep extends string,
	L extends Lexis,
	Off extends number = 0,
	Acc extends string = "",
	First extends boolean = true,
> = Items extends readonly [
	infer H,
	...infer R extends readonly { readonly text: string }[],
]
	? H extends { readonly text: infer FT extends string }
		? string extends FT
			? string
			: Renumber<FT, Off, "", L> extends [
						infer NT extends string,
						infer NewOff extends number,
					]
				? JoinedText<
						R,
						Sep,
						L,
						NewOff,
						First extends true ? NT : `${Acc}${Sep}${NT}`,
						false
					>
				: never
		: string
	: number extends Items["length"]
		? string
		: Acc;
