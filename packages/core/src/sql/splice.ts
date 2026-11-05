import type { Digit } from "../engine/chars.js";
import type { Lt, Members, Tup } from "../engine/object.js";
import type { SqlError } from "../errors.js";
import type { NextOpaque } from "./named.js";

export type Splice<Q extends string, S> = string extends Q
	? string
	: SpliceLoop<Q, S, MaxParamStr<Q>, "">;

type SpliceLoop<
	Q extends string,
	S,
	Off extends number,
	Acc extends string,
> = Q extends `${string}{${string}}${string}`
	? NextOpaque<Q> extends [
			infer Code extends string,
			infer Seg extends string,
			infer After extends string,
		]
		? SpliceCode<Code, S, Off, ""> extends infer R
			? R extends [infer T extends string, infer NewOff extends number]
				? Seg extends ""
					? `${Acc}${T}`
					: SpliceLoop<After, S, NewOff, `${Acc}${T}${Seg}`>
				: R
			: never
		: never
	: `${Acc}${Q}`;

type SpliceCode<
	Q extends string,
	S,
	Off extends number,
	Acc extends string,
> = Q extends `${infer Pre}{${infer Name}}${infer Post}`
	? IsSlotName<Name> extends true
		? Name extends keyof S
			? S[Name] extends { readonly text: infer FT extends string }
				? string extends FT
					? string
					: Renumber<FT, Off, ""> extends [
								infer NT extends string,
								infer NewOff extends number,
							]
						? SpliceCode<Post, S, NewOff, `${Acc}${Pre}${NT}`>
						: never
				: string
			: SqlError<`unknown fragment slot {${Name}}`, null>
		: SpliceCode<Post, S, Off, `${Acc}${Pre}{${Name}}`>
	: [`${Acc}${Q}`, Off];

/** The SQL outside strings, quoted identifiers, comments and dollar quotes. */
type CodeOnly<
	Q extends string,
	Acc extends string = "",
> = Q extends `${string}{${string}}${string}`
	? NextOpaque<Q> extends [
			infer Code extends string,
			infer Seg extends string,
			infer After extends string,
		]
		? Seg extends ""
			? `${Acc}${Code}`
			: CodeOnly<After, `${Acc}${Code} `>
		: never
	: Acc;

export type SpliceCarried<Q extends string, C> = CarriedIn<CodeOnly<Q>, C, []>;
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

/** Only the internal slots that interpolated fragments become; any other `{…}` is SQL text. */
type IsSlotName<N extends string> = N extends `__typesql_inline${number}`
	? true
	: false;

export type SlotNames<Q extends string> = SlotNamesIn<CodeOnly<Q>>;
type SlotNamesIn<Q extends string> =
	Q extends `${string}{${infer Name}}${infer Post}`
		? IsSlotName<Name> extends true
			? Name | SlotNamesIn<Post>
			: SlotNamesIn<Post>
		: never;

type Renumber<
	T extends string,
	Off extends number,
	Acc extends string,
> = T extends `${string}$${string}`
	? Off extends 0
		? T extends `${string}$0${string}`
			? RenumberLoop<T, Off, Off, Acc>
			: [`${Acc}${T}`, MaxParamStr<T>]
		: RenumberLoop<T, Off, Off, Acc>
	: [`${Acc}${T}`, Off];
type RenumberLoop<
	T extends string,
	Off extends number,
	Max extends number,
	Acc extends string,
> =
	NextOpaque<T> extends [
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
				: RenumberLoop<After, Off, M, `${Acc}${C}${Seg}`>
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

type TakeDigits<
	S extends string,
	Acc extends string,
> = S extends `${infer C extends Digit}${infer R}`
	? TakeDigits<R, `${Acc}${C}`>
	: [Acc, S];
type ToNum<S extends string> = S extends `${infer N extends number}`
	? N
	: never;

export type MaxParamStr<
	T extends string,
	Max extends number = 0,
> = T extends `${string}$${string}` ? MaxLoop<T, Max> : Max;
type MaxLoop<T extends string, Max extends number> =
	NextOpaque<T> extends [
		infer Code extends string,
		infer Seg extends string,
		infer After extends string,
	]
		? MaxIn<Code, Max> extends infer M extends number
			? Seg extends ""
				? M
				: MaxLoop<After, M>
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

type Add<A extends number, B extends number> = [
	...Tup<A>,
	...Tup<B>,
]["length"] &
	number;

export type UnknownTuple<
	N extends number,
	Acc extends unknown[] = [],
> = Acc["length"] extends N ? Acc : UnknownTuple<N, [...Acc, unknown]>;

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
	Q extends string = '"',
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

export type UnionList<U> = Members<U>;

export type JoinedText<
	Items extends readonly { readonly text: string }[],
	Sep extends string,
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
			: Renumber<FT, Off, ""> extends [
						infer NT extends string,
						infer NewOff extends number,
					]
				? JoinedText<
						R,
						Sep,
						NewOff,
						First extends true ? NT : `${Acc}${Sep}${NT}`,
						false
					>
				: never
		: string
	: number extends Items["length"]
		? string
		: Acc;
