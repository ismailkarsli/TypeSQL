import type { IdStart } from "../engine/chars.js";
import type { SqlError } from "../errors.js";
import type { AllCode, Lexis, NextOpaque, TakeName } from "./lexis.js";
import type { MaxParamStr, Take } from "./splice.js";

/** `Q` with its `:name` parameters numbered, and their names; an error if it also has `$n`. */
export type RewriteNamed<Q extends string, L extends Lexis> =
	RewriteNamedStr<Q, L> extends [infer T, infer Names]
		? Names extends []
			? [T, []]
			: MaxParamStr<Q, L> extends 0
				? [T, Names]
				: SqlError<
						"cannot mix named (:name) and positional ($n) parameters",
						null
					>
		: never;

/** The one object argument of a statement with named parameters, from its positional arguments. */
export type NamedArgs<
	Names extends readonly string[],
	Args extends readonly unknown[],
> = [params: NamedParams<Names, Take<Args, Names["length"]>>];

type IndexOf<
	Names extends string[],
	Name extends string,
	Acc extends unknown[] = [],
> = Names extends [infer H, ...infer R extends string[]]
	? H extends Name
		? [...Acc, 0]["length"]
		: IndexOf<R, Name, [...Acc, 0]>
	: [...Acc, 0]["length"];

export type NamedParams<
	Names extends readonly string[],
	Params extends readonly unknown[],
> = {
	-readonly [I in keyof Names & `${number}` as Names[I]]: Params[I &
		keyof Params];
} extends infer O
	? { [K in keyof O]: O[K] }
	: never;

export type RewriteNamedStr<Text extends string, L extends Lexis> =
	HasSingleColon<Text> extends true
		? AllCode<Text, L> extends true
			? RewriteCode<Text, "", []>
			: NamedLoop<Text, "", [], L>
		: [Text, []];

type HasSingleColon<
	S extends string,
	Budget extends unknown[] = [],
> = Budget["length"] extends 128
	? true
	: S extends `${string}:${infer R}`
		? R extends `:${infer Rest}`
			? HasSingleColon<Rest, [...Budget, 0]>
			: true
		: false;

type NamedLoop<
	T extends string,
	Acc extends string,
	Names extends string[],
	L extends Lexis,
> =
	NextOpaque<T, L> extends [
		infer Code extends string,
		infer Seg extends string,
		infer After extends string,
	]
		? RewriteCode<Code, "", Names> extends [
				infer C extends string,
				infer N2 extends string[],
			]
			? Seg extends ""
				? [`${Acc}${C}`, N2]
				: NamedLoop<After, `${Acc}${C}${Seg}`, N2, L>
			: never
		: never;

type RewriteCode<
	S extends string,
	Acc extends string,
	Names extends string[],
> = S extends `${infer Pre}:${infer Rest}`
	? Rest extends `:${infer Rest2}`
		? RewriteCode<Rest2, `${Acc}${Pre}::`, Names>
		: Rest extends `${infer C extends IdStart}${infer Rest2}`
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
