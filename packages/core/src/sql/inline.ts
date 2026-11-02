import type { Empty } from "../empty.js";
import type { SqlError } from "../errors.js";
import type { InlineFragment } from "../query.js";
import type { Next } from "./next.js";

export type ParamInput<T> = unknown extends T
	? unknown
	: undefined extends T
		? SqlError<
				"sql.param() does not accept undefined; use sql.optional(value) for DEFAULT or null for SQL NULL",
				null
			>
		: [Extract<Exclude<T, Empty>, InlineFragment>] extends [never]
			? true extends HoldsMarker<Exclude<T, Empty>>
				? SqlError<
						"sql.param() takes a value, not another sql.param() or sql.json(); pass the value itself",
						null
					>
				: unknown
			: SqlError<
					"sql.param() takes a value, not a fragment or query; interpolate it itself: ${fragment}",
					null
				>;

/** The value of `sql.json()`: one that holds no marker, which would be stored as text. */
export type JsonInput<T> = unknown extends T
	? unknown
	: true extends HoldsMarker<T>
		? SqlError<
				"sql.json() takes a plain value; a sql.param() or sql.json() inside it would be stored as its marker text",
				null
			>
		: unknown;

/** Whether a value's type holds a marker, a few levels deep. */
type HoldsMarker<T, Depth extends readonly unknown[] = []> = 0 extends 1 & T
	? false
	: unknown extends T
		? false
		: Depth["length"] extends 6
			? false
			: T extends `\u0000${string}\u0000`
				? true
				: T extends (...args: never) => unknown
					? false
					: T extends readonly unknown[]
						? HoldsMarker<T[number], [...Depth, 0]>
						: T extends object
							? HoldsMarker<T[keyof T], [...Depth, 0]>
							: false;

export type InlineMarker<T> = unknown extends T
	? PlainMarker<T>
	: [Extract<T, Empty>] extends [never]
		? PlainMarker<T>
		: DefaultMarker<T>;
type PlainMarker<T> = `\u0000P${Enc<T>}\u0000`;
/** `sql.json(undefined)` sends DEFAULT, so a value that can be `undefined` is checked as `sql.param(sql.optional(value))` is. */
export type JsonMarker<T> = unknown extends T
	? `\u0000PJ${Enc<T>}\u0000`
	: [Extract<T, undefined>] extends [never]
		? `\u0000PJ${Enc<T>}\u0000`
		: `\u0000DuJ${Enc<Exclude<T, undefined>>}\u0000`;
export type JsonValue = `\u0000PJ${string}\u0000`;
/** A `sql.json()` value that can be DEFAULT, which `sql.set` and `sql.values` leave out. */
export type JsonDefaultValue = `\u0000DuJ${string}\u0000`;

export type DefaultMarker<T> = `\u0000Du${Enc<Exclude<T, Empty>>}\u0000`;

/**
 * A value's type, written into the marker text so `sql()` can check it
 * against the parameter's type. Flags list the value's members: `s` string,
 * `n` number, `b` boolean, `t` / `f` true / false, `q…~` a string literal,
 * `m…~` a number literal (unions of more than 64 literals are `s` or `n`),
 * `i` bigint, `0` null, `u` undefined, `d` Date, `y` Uint8Array,
 * `[D…]D` an array, `<D…>D` an object's properties (`key=enc`, `key=!enc` when
 * optional, `*=enc` for an index signature, separated by `,D`), `o` an object
 * whose properties are not listed, and `*` anything. `D` is the nesting depth,
 * so the first `]D`, `>D` or `,D` closes the group. Keys and literals escape
 * ASCII punctuation as `%` and a letter: marker text then holds no quotes,
 * comments, `$`, `:`, `?` or braces for the SQL scanners to see.
 */
export type Enc<T, Depth extends unknown[] = []> = 0 extends 1 & T
	? "*"
	: unknown extends T
		? "*"
		: Depth["length"] extends 6
			? "*"
			: `${StrEnc<Extract<T, string>>}${NumEnc<Extract<T, number>>}${BoolEnc<Extract<T, boolean>>}${Flag<T, bigint, "i">}${Flag<T, Date, "d">}${Flag<T, Uint8Array, "y">}${ArrEnc<T, Depth>}${ObjEnc<T, Depth>}${Flag<T, null, "0">}${Flag<T, undefined, "u">}`;
type Flag<T, U, F extends string> = [Extract<T, U>] extends [never] ? "" : F;

type StrEnc<S> = [S] extends [never]
	? ""
	: {} extends Record<S & string, 1>
		? "s"
		: LitEnc<Members<S, 64>, "q", "s">;
type NumEnc<N> = [N] extends [never]
	? ""
	: {} extends Record<`${N & number}`, 1>
		? "n"
		: number extends N
			? "n"
			: LitEnc<Members<N, 64>, "m", "n">;
type BoolEnc<B> = [B] extends [never]
	? ""
	: [boolean] extends [B]
		? "b"
		: [B] extends [true]
			? "t"
			: "f";
type LitEnc<
	L,
	Tag extends string,
	Wide extends string,
	Acc extends string = "",
> = L extends readonly [infer H extends string | number, ...infer R]
	? Esc<`${H}`> extends infer X extends string
		? LitEnc<R, Tag, Wide, `${Acc}${Tag}${X}~`>
		: Wide
	: L extends readonly []
		? Acc
		: Wide;

/** A union's members as a tuple, or `null` when it has more than `Max`. */
type Members<U, Max extends number, Acc extends readonly unknown[] = []> = [
	U,
] extends [never]
	? Acc
	: Acc["length"] extends Max
		? null
		: LastOf<U> extends infer L
			? Members<Exclude<U, L>, Max, [L, ...Acc]>
			: never;
type UnionToIntersection<U> = (
	U extends unknown
		? (u: U) => void
		: never
) extends (u: infer I) => void
	? I
	: never;
type LastOf<U> =
	UnionToIntersection<U extends unknown ? (x: U) => void : never> extends (
		x: infer L,
	) => void
		? L
		: never;

type ArrEnc<T, Depth extends unknown[]> = [
	Extract<T, readonly unknown[]>,
] extends [never]
	? ""
	: `[${Depth["length"]}${ElemEnc<T, Extract<T, readonly unknown[]>[number], Depth>}]${Depth["length"]}`;
/**
 * Recursive types (`type J = string | J[]`) would nest forever: an element or
 * property that is its own enclosing type encodes as `*`, as does anything
 * nested deeper than PostgreSQL's six array dimensions.
 */
type ElemEnc<T, E, Depth extends unknown[]> = [E] extends [T]
	? [T] extends [E]
		? "*"
		: Enc<E, [...Depth, 0]>
	: Enc<E, [...Depth, 0]>;

type PlainObject<T> = Exclude<
	Extract<T, object>,
	Date | Uint8Array | readonly unknown[]
>;
type ObjEnc<T, Depth extends unknown[]> = [PlainObject<T>] extends [never]
	? ""
	: Members<PlainObject<T>, 8> extends infer Os extends readonly unknown[]
		? ShapesEnc<T, Os, Depth, "">
		: "o";
type ShapesEnc<
	T,
	Os extends readonly unknown[],
	Depth extends unknown[],
	Acc extends string,
> = Os extends readonly [infer O, ...infer R]
	? ShapesEnc<T, R, Depth, `${Acc}${ShapeEnc<T, O, Depth>}`>
	: Acc;
type ShapeEnc<T, O, Depth extends unknown[]> = O extends (
	...args: never
) => unknown
	? "o"
	: string extends keyof O
		? `<${Depth["length"]}*=${ElemEnc<T, O[string & keyof O], Depth>}>${Depth["length"]}`
		: number extends keyof O
			? `<${Depth["length"]}*=${ElemEnc<T, O[number & keyof O], Depth>}>${Depth["length"]}`
			: Members<Exclude<keyof O, symbol>, 48> extends infer Ks extends
						readonly unknown[]
				? PropsEnc<T, O, Ks, Depth, ""> extends infer P extends string
					? `<${Depth["length"]}${P}>${Depth["length"]}`
					: "o"
				: "o";
type PropsEnc<
	T,
	O,
	Ks extends readonly unknown[],
	Depth extends unknown[],
	Acc extends string,
> = Ks extends readonly [
	infer K extends keyof O & (string | number),
	...infer R,
]
	? Esc<`${K}`> extends infer X extends string
		? PropsEnc<
				T,
				O,
				R,
				Depth,
				`${Acc}${Acc extends "" ? "" : `,${Depth["length"]}`}${X}=${{} extends Pick<O, K> ? `!${ElemEnc<T, Exclude<O[K], undefined>, Depth>}` : ElemEnc<T, O[K], Depth>}`
			>
		: null
	: Acc;

type EscCodes = {
	" ": "a";
	"!": "b";
	'"': "c";
	"#": "d";
	$: "e";
	"%": "f";
	"&": "g";
	"'": "h";
	"(": "i";
	")": "j";
	"*": "k";
	"+": "l";
	",": "m";
	"-": "n";
	".": "o";
	"/": "p";
	":": "q";
	";": "r";
	"<": "s";
	"=": "t";
	">": "u";
	"?": "v";
	"@": "w";
	"[": "x";
	"\\": "y";
	"]": "z";
	"^": "A";
	"`": "B";
	"{": "C";
	"|": "D";
	"}": "E";
	"~": "F";
	"\u0000": "G";
};
type Punct = keyof EscCodes;
type Unescapes = { [C in Punct as EscCodes[C]]: C };
/** `null` for text too long to escape. */
type Esc<S extends string> = S extends `${string}${Punct}${string}`
	? EscLoop<S, "", []>
	: S;
type EscLoop<
	S extends string,
	Acc extends string,
	N extends unknown[],
> = N["length"] extends 500
	? null
	: S extends `${infer C}${infer R}`
		? EscLoop<R, `${Acc}${C extends Punct ? `%${EscCodes[C]}` : C}`, [...N, 0]>
		: Acc;
type Unesc<
	S extends string,
	Acc extends string = "",
> = S extends `${infer A}%${infer C}${infer R}`
	? Unesc<R, `${Acc}${A}${C extends keyof Unescapes ? Unescapes[C] : C}`>
	: `${Acc}${S}`;

/** Whether a value encoded as `E` fits a parameter of TypeScript type `P`. */
export type CheckEnc<E extends string, P> = unknown extends P
	? true
	: CheckLoop<E, P, false>;
type CheckLoop<E extends string, P, InObject extends boolean> = E extends ""
	? true
	: unknown extends P
		? true
		: E extends `[${infer D extends string}${infer R}`
			? R extends `${infer Inner}]${D}${infer After}`
				? ArrOk<Inner, P> extends true
					? CheckLoop<After, P, InObject>
					: false
				: false
			: E extends `<${infer D extends string}${infer R}`
				? R extends `${infer Inner}>${D}${infer After}`
					? ObjOk<Fields<Inner, D, []>, P> extends true
						? CheckLoop<After, P, InObject>
						: false
					: false
				: E extends `q${infer L}~${infer R}`
					? [Unesc<L>] extends [P]
						? CheckLoop<R, P, InObject>
						: false
					: E extends `m${infer L}~${infer R}`
						? Unesc<L> extends `${infer X extends number}`
							? [X] extends [P]
								? CheckLoop<R, P, InObject>
								: false
							: CheckLoop<R, P, InObject>
						: E extends `${infer C}${infer R}`
							? FlagOk<C, P, InObject> extends true
								? CheckLoop<R, P, InObject>
								: false
							: true;
// Literals and object shapes are checked exactly. A plain `string`, `number`
// or `boolean` only needs the parameter to take that kind, so a `string` fits
// an enum.
type FlagOk<C extends string, P, InObject extends boolean> = C extends "s"
	? Has<P, string>
	: C extends "n"
		? Has<P, number>
		: C extends "b"
			? Has<P, boolean>
			: C extends "t"
				? [true] extends [P]
					? true
					: false
				: C extends "f"
					? [false] extends [P]
						? true
						: false
					: C extends "i"
						? Has<P, bigint>
						: C extends "0"
							? Has<P, null>
							: C extends "u"
								? InObject extends true
									? [undefined] extends [P]
										? true
										: false
									: Has<P, null>
								: C extends "d"
									? Has<P, Date>
									: C extends "y"
										? Has<P, Uint8Array>
										: C extends "o"
											? Has<P, object>
											: true;
type Has<P, U> = [Extract<P, U>] extends [never] ? false : true;

type ArrOk<Inner extends string, P> = [Extract<P, readonly unknown[]>] extends [
	never,
]
	? false
	: CheckLoop<Inner, Extract<P, readonly unknown[]>[number], false>;

type Field = readonly [key: string, optional: boolean, enc: string];
type Fields<
	S extends string,
	D extends string,
	Acc extends readonly Field[],
> = S extends ""
	? Acc
	: S extends `${infer F},${D}${infer R}`
		? Fields<R, D, [...Acc, ParseField<F>]>
		: [...Acc, ParseField<S>];
type ParseField<F extends string> = F extends `${infer K}=${infer E}`
	? E extends `!${infer O}`
		? [Unesc<K>, true, O]
		: [Unesc<K>, false, E]
	: ["", false, "*"];

type ObjOk<Fs extends readonly Field[], P> = true extends (
	PlainObject<P> extends infer O
		? O extends unknown
			? ShapeOk<Fs, O>
			: never
		: never
)
	? true
	: false;
// A value with an index signature (`Record<string, unknown>`) has keys the
// type doesn't list, so like a plain `string` it isn't checked for missing ones.
type ShapeOk<Fs extends readonly Field[], O> = "*" extends Fs[number][0]
	? FieldsOk<Fs, O>
	: [Exclude<RequiredKeys<O>, PresentKeys<Fs>>] extends [never]
		? FieldsOk<Fs, O>
		: false;
type RequiredKeys<O> = {
	[K in keyof O]-?: {} extends Pick<O, K>
		? never
		: K extends string | number
			? `${K}`
			: never;
}[keyof O];
type PresentKeys<Fs extends readonly Field[]> = Fs[number] extends infer F
	? F extends readonly [infer K, false, string]
		? K
		: never
	: never;
type FieldsOk<Fs extends readonly Field[], O> = Fs extends readonly [
	readonly [infer K extends string, boolean, infer E extends string],
	...infer R extends readonly Field[],
]
	? CheckLoop<E, PropOf<O, K>, true> extends true
		? FieldsOk<R, O>
		: false
	: true;
/** The type a property takes; `unknown` for keys the parameter doesn't list. */
type PropOf<O, K extends string> = K extends "*"
	? string extends keyof O
		? O[string & keyof O]
		: [keyof O] extends [never]
			? unknown
			: O[keyof O]
	: K extends keyof O
		? O[K]
		: K extends `${infer N extends number}`
			? N extends keyof O
				? O[N]
				: IndexOf<O>
			: IndexOf<O>;
type IndexOf<O> = string extends keyof O ? O[string & keyof O] : unknown;

/** A readable form of an encoded type, for error messages. */
export type DescribeEnc<E extends string> = JoinBar<DescParts<E, []>>;
type DescParts<E extends string, Acc extends string[]> = E extends ""
	? Acc
	: E extends `[${infer D extends string}${infer R}`
		? R extends `${infer Inner}]${D}${infer After}`
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
		: E extends `<${infer D extends string}${infer R}`
			? R extends `${infer Inner}>${D}${infer After}`
				? DescParts<After, [...Acc, DescObject<Fields<Inner, D, []>>]>
				: Acc
			: E extends `q${infer L}~${infer R}`
				? DescParts<R, [...Acc, `"${Unesc<L>}"`]>
				: E extends `m${infer L}~${infer R}`
					? DescParts<R, [...Acc, Unesc<L>]>
					: E extends `${infer C}${infer R}`
						? DescParts<R, [...Acc, FlagName<C>]>
						: Acc;
type DescObject<
	Fs extends readonly Field[],
	Acc extends string = "",
> = Fs extends readonly [
	readonly [infer K extends string, infer Opt, infer E extends string],
	...infer R extends readonly Field[],
]
	? DescObject<
			R,
			`${Acc}${Acc extends "" ? "" : "; "}${K extends "*" ? "[key: string]" : K extends `${string}${Punct}${string}` ? `"${K}"` : K}${Opt extends true ? "?" : ""}: ${DescribeEnc<E>}`
		>
	: Acc extends ""
		? "{}"
		: `{ ${Acc} }`;
type FlagName<C extends string> = C extends "s"
	? "string"
	: C extends "n"
		? "number"
		: C extends "b"
			? "boolean"
			: C extends "t"
				? "true"
				: C extends "f"
					? "false"
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
