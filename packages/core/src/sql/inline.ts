import type { Empty } from "../empty.js";
import type { SqlError } from "../errors.js";
import type { Next } from "./next.js";
import type { MaxParamStr } from "./splice.js";

export type ParamInput<T> = unknown extends T
	? unknown
	: undefined extends T
		? SqlError<
				"sql.param() does not accept undefined; use sql.empty for DEFAULT or null for SQL NULL",
				null
			>
		: unknown;

export type InlineMarker<T> = unknown extends T
	? PlainMarker<T>
	: [Extract<T, Empty>] extends [never]
		? PlainMarker<T>
		: DefaultMarker<T>;
type PlainMarker<T> = `\u0000P${Enc<T>}\u0000`;
export type JsonMarker<T> = `\u0000PJ${Enc<T>}\u0000`;
export type JsonValue = `\u0000PJ${string}\u0000`;

export type DefaultMarker<T> = `\u0000Du${Enc<Exclude<T, Empty>>}\u0000`;

export type Enc<T, Depth extends unknown[] = []> = 0 extends 1 & T
	? "*"
	: unknown extends T
		? "*"
		: `${Flag<T, string, "s">}${Flag<T, number, "n">}${Flag<T, boolean, "b">}${Flag<T, bigint, "i">}${Flag<T, null, "0">}${Flag<T, undefined, "u">}${Flag<T, Date, "d">}${Flag<T, Uint8Array, "y">}${ArrFlag<T, Depth>}${ObjFlag<T>}`;
type Flag<T, U, F extends string> = [Extract<T, U>] extends [never] ? "" : F;
type ArrFlag<T, Depth extends unknown[]> = [
	Extract<T, readonly unknown[]>,
] extends [never]
	? ""
	: `[${ElemEnc<T, Extract<T, readonly unknown[]>[number], Depth>}]`;
/**
 * Recursive types (`type J = string | J[]`) would nest forever: an element
 * that is its own array type, or one nested deeper than PostgreSQL's six
 * array dimensions, encodes as `*`.
 */
type ElemEnc<T, E, Depth extends unknown[]> = Depth["length"] extends 6
	? "*"
	: [E] extends [T]
		? [T] extends [E]
			? "*"
			: Enc<E, [...Depth, 0]>
		: Enc<E, [...Depth, 0]>;
type ObjFlag<T> = [
	Exclude<Extract<T, object>, Date | Uint8Array | readonly unknown[]>,
] extends [never]
	? ""
	: "o";

export type CheckEnc<E extends string, P> = unknown extends P
	? true
	: E extends ""
		? true
		: E extends `*${string}`
			? true
			: E extends `[${infer R}`
				? SplitBracket<R, "", []> extends [
						infer Inner extends string,
						infer After extends string,
					]
					? [Extract<P, readonly unknown[]>] extends [never]
						? false
						: CheckEnc<
									Inner,
									Extract<P, readonly unknown[]>[number]
								> extends true
							? CheckEnc<After, P>
							: false
					: false
				: E extends `${infer C}${infer R}`
					? FlagOk<C, P> extends true
						? CheckEnc<R, P>
						: false
					: true;
type FlagOk<C extends string, P> = C extends "s"
	? Has<P, string>
	: C extends "n"
		? Has<P, number>
		: C extends "b"
			? Has<P, boolean>
			: C extends "i"
				? Has<P, bigint>
				: C extends "0" | "u"
					? Has<P, null>
					: C extends "d"
						? Has<P, Date>
						: C extends "y"
							? Has<P, Uint8Array>
							: C extends "o"
								? Has<P, object>
								: true;
type Has<P, U> = [Extract<P, U>] extends [never] ? false : true;

export type DescribeEnc<E extends string> = JoinBar<DescParts<E, []>>;
type DescParts<E extends string, Acc extends string[]> = E extends ""
	? Acc
	: E extends `[${infer R}`
		? SplitBracket<R, "", []> extends [
				infer Inner extends string,
				infer After extends string,
			]
			? DescParts<
					After,
					[
						...Acc,
						DescParts<Inner, []> extends [infer One extends string]
							? `${One}[]`
							: `(${DescribeEnc<Inner>})[]`,
					]
				>
			: Acc
		: E extends `${infer C}${infer R}`
			? DescParts<R, [...Acc, FlagName<C>]>
			: Acc;
type FlagName<C extends string> = C extends "s"
	? "string"
	: C extends "n"
		? "number"
		: C extends "b"
			? "boolean"
			: C extends "i"
				? "bigint"
				: C extends "0"
					? "null"
					: C extends "u"
						? "undefined"
						: C extends "d"
							? "Date"
							: C extends "y"
								? "Uint8Array"
								: C extends "o"
									? "object"
									: "unknown";
type JoinBar<Parts extends string[]> = Parts extends [infer A]
	? A
	: Parts extends [infer A extends string, ...infer R extends string[]]
		? `${A} | ${JoinBar<R>}`
		: "never";

type SplitBracket<
	S extends string,
	Acc extends string,
	Depth extends unknown[],
> = S extends `${infer C}${infer R}`
	? C extends "]"
		? Depth extends [unknown, ...infer D]
			? SplitBracket<R, `${Acc}]`, D>
			: [Acc, R]
		: C extends "["
			? SplitBracket<R, `${Acc}[`, [...Depth, 0]>
			: SplitBracket<R, `${Acc}${C}`, Depth>
	: null;

type Openers = '"' | "--" | "/*";

export type SplitFirst<T extends string> = T extends `${infer A}'${infer B}`
	? A extends `${string}${Openers}${string}`
		? Earlier<A, "'", B>
		: [A, "'", B]
	: T extends `${string}${Openers}${string}`
		? T extends `${infer A}"${infer B}`
			? Earlier<A, '"', B>
			: T extends `${infer A}--${infer B}`
				? Earlier<A, "--", B>
				: T extends `${infer A}/*${infer B}`
					? Earlier<A, "/*", B>
					: [T, "", ""]
		: [T, "", ""];
type Earlier<
	A extends string,
	O extends string,
	B extends string,
> = A extends `${infer A2}"${infer M}`
	? Earlier<A2, '"', `${M}${O}${B}`>
	: A extends `${infer A2}--${infer M}`
		? Earlier<A2, "--", `${M}${O}${B}`>
		: A extends `${infer A2}/*${infer M}`
			? Earlier<A2, "/*", `${M}${O}${B}`>
			: A extends `${infer A2}'${infer M}`
				? Earlier<A2, "'", `${M}${O}${B}`>
				: [A, O, B];

export type Opaque<O extends string, S extends string> = O extends "'" | '"'
	? CloseQuote<S, O, "">
	: O extends "--"
		? S extends `${infer C}\n${infer R}`
			? [`${C}\n`, R]
			: [S, ""]
		: O extends "/*"
			? S extends `${infer C}*/${infer R}`
				? [`${C}*/`, R]
				: [S, ""]
			: ["", S];
type CloseQuote<
	S extends string,
	Q extends string,
	Acc extends string,
> = S extends `${infer In}${Q}${infer R}`
	? R extends `${Q}${infer R2}`
		? CloseQuote<R2, Q, `${Acc}${In}${Q}${Q}`>
		: [`${Acc}${In}${Q}`, R]
	: [`${Acc}${S}`, ""];

type HasMarker<S extends string> = S extends `${string}\u0000${string}`
	? true
	: false;

export type RewriteInlineStr<T extends string, Start extends number> =
	HasMarker<T> extends false ? [T, []] : InlineLoop<T, "", [], Next[Start]>;

type InlineLoop<
	T extends string,
	Acc extends string,
	Encs extends string[],
	K extends number,
> =
	SplitFirst<T> extends [
		infer Code extends string,
		infer O extends string,
		infer Rest extends string,
	]
		? InlineCode<Code, "", Encs, K> extends [
				infer C extends string,
				infer E2 extends string[],
				infer K2 extends number,
			]
			? O extends ""
				? [`${Acc}${C}`, E2]
				: Opaque<O, Rest> extends [
							infer Seg extends string,
							infer After extends string,
						]
					? HasMarker<Seg> extends true
						? SqlError<
								`sql.param() cannot be used inside ${O extends "'" ? "a quoted string" : O extends '"' ? "a quoted identifier" : "a comment"}; remove the surrounding ${O extends "'" | '"' ? "quotes" : "comment"}`,
								null
							>
						: InlineLoop<After, `${Acc}${C}${O}${Seg}`, E2, K2>
					: never
			: never
		: never;

type InlineCode<
	S extends string,
	Acc extends string,
	Encs extends string[],
	K extends number,
> = S extends `${infer Pre}\u0000${infer Body}\u0000${infer Rest}`
	? InlineCode<Rest, `${Acc}${Pre}$${K}`, [...Encs, MarkerEnc<Body>], Next[K]>
	: [`${Acc}${S}`, Encs, K];
type MarkerEnc<B extends string> = B extends `P${infer E}`
	? E
	: B extends `Du${infer E}`
		? E
		: "*";

type AnyMarker = `\u0000${string}\u0000`;
export type ValueEnc<V> = 0 extends 1 & V
	? "*"
	: [Extract<V, AnyMarker>] extends [never]
		? Enc<V>
		:
				| MarkerEncs<Extract<V, AnyMarker>>
				| ([Exclude<V, AnyMarker>] extends [never]
						? never
						: Enc<Exclude<V, AnyMarker>>);
type MarkerEncs<M> = M extends `\u0000${infer B}\u0000` ? MarkerEnc<B> : never;

export type HasDefaultable<S extends string> =
	S extends `${string}\u0000Du${string}` ? true : false;

export type WithDefaults<
	S extends string,
	Acc extends string = "",
> = S extends `${infer Pre}\u0000Du${string}\u0000${infer Rest}`
	? WithDefaults<Rest, `${Acc}${Pre}DEFAULT`>
	: `${Acc}${S}`;

export type Skip<
	N extends number,
	Acc extends null[] = [],
> = Acc["length"] extends N ? Acc : Skip<N, [...Acc, null]>;

export type { MaxParamStr };
