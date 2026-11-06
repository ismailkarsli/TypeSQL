import type { Next } from "../../engine/next.js";
import type { ColInfo, Info } from "../../engine/types.js";
import type { SqlError } from "../../errors.js";
import type { TsShape } from "../../schema.js";
import type { IntT, JsonT, StrT } from "../schema/type-facts.js";
import type { Expr, Tag } from "./ast.js";
import type {
	ArrInfo,
	ArrShape,
	BaseOf,
	HasNullElems,
	LitToText,
	MergeShapes,
	Shaped,
	ShapeOfType,
} from "./shape.js";

type ValShape<C> = { readonly k: "val"; readonly c: C };

export type LitType<V extends string> = V extends
	| "[]"
	| "{}"
	| "null"
	| "true"
	| "false"
	? Shaped<"lit", TsShape<LitTs<V>>>
	: "lit";
type LitTs<V extends string> = V extends "[]"
	? []
	: V extends "{}"
		? Record<string, never>
		: V extends "null"
			? null
			: boolean;

export type JsonLitCast<To extends string, V extends string> =
	LitType<V> extends Shaped<"lit", infer S> ? Shaped<To, S> : null;

export type LitCommon<L extends string, X extends string> =
	BaseOf<X> extends JsonT
		? L extends Shaped<"lit", infer SL>
			? X extends Shaped<string, infer SX>
				? Shaped<BaseOf<X>, MergeShapes<SX, SL>>
				: BaseOf<X>
			: BaseOf<X>
		: BaseOf<X>;

type ValInfo<A extends ColInfo> = A["type"] extends "lit"
	? Info<"text", A["nullable"]>
	: A;

type NonNull<A extends ColInfo> = ArrInfo<
	LitToText<A["type"]>,
	false,
	HasNullElems<A>
>;

export type JsonRet<
	P extends string,
	As extends readonly ColInfo[],
> = P extends `${infer K}:${infer B}`
	? K extends "val"
		? Shaped<B, ValShape<NonNull<As[0]>>>
		: K extends "arr"
			? Shaped<B, ArrShape<ValInfo<As[0]>>>
			: K extends "arrnn"
				? Shaped<B, ArrShape<NonNull<As[0]>>>
				: K extends "rec"
					? Shaped<B, { readonly k: "rec"; readonly v: ValInfo<As[1]> }>
					: K extends "recnn"
						? Shaped<
								B,
								{
									readonly k: "rec";
									readonly v: NonNull<As[1]>;
								}
							>
						: K extends "tup"
							? Shaped<
									B,
									{
										readonly k: "tup";
										readonly es: { readonly [I in keyof As]: ValInfo<As[I]> };
									}
								>
							: StepOf<As[0]["type"], B, "idx", number>
	: "unknown";

export type BuildObject<
	B extends string,
	Args extends readonly Expr[],
	As extends readonly ColInfo[],
	I extends number = 0,
	Acc = {},
> = Args[I] extends undefined
	? Info<
			Shaped<
				B,
				{ readonly k: "obj"; readonly m: { readonly [K in keyof Acc]: Acc[K] } }
			>
		>
	: Args[Next<I>] extends undefined
		? SqlError<"argument list must have even number of elements", null>
		: Args[I] extends Tag<"null">
			? SqlError<"null value not allowed for object key", null>
			: KeyOf<Args[I]> extends infer K extends string
				? BuildObject<
						B,
						Args,
						As,
						Next<Next<I>>,
						Without<Acc, K> & { readonly [P in K]: ValInfo<As[Next<I>]> }
					>
				: Info<B>;
type Without<Acc, K extends string> = K extends keyof Acc ? Omit<Acc, K> : Acc;
type KeyOf<E> = E extends {
	readonly t: "str" | "num";
	readonly v: infer V;
}
	? V
	: null;

export type JsonArrow<
	Op extends string,
	L extends ColInfo,
	R extends Expr,
	RT extends ColInfo,
> =
	L["type"] extends Shaped<JsonT, unknown>
		? Op extends "#>"
			? R extends { readonly t: "str"; readonly v: infer V extends string }
				? PathSegs<V> extends infer Segs extends readonly string[]
					? Info<Walk<L["type"], BaseOf<L["type"]>, Segs>, true>
					: null
				: null
			: R extends { readonly t: "str"; readonly v: infer V extends string }
				? Info<StepOf<L["type"], BaseOf<L["type"]>, "key", V>, true>
				: R extends { readonly t: "num"; readonly v: infer V extends string }
					? Info<StepOf<L["type"], BaseOf<L["type"]>, "idx", V>, true>
					: RT["type"] extends IntT
						? Info<StepOf<L["type"], BaseOf<L["type"]>, "idx", number>, true>
						: RT["type"] extends StrT
							? Info<StepOf<L["type"], BaseOf<L["type"]>, "key", string>, true>
							: null
		: null;

type StepOf<
	T extends string,
	B extends string,
	Kind extends "key" | "idx" | "seg",
	K extends string | number,
> =
	ShapeOfType<T> extends infer S
		? [S] extends [null]
			? B
			: Reshape<B, Step<S, Kind, K>>
		: B;
type Reshape<B extends string, S> = [S] extends [never]
	? Shaped<B, TsShape<never>>
	: [S] extends [TsShape<infer T>]
		? unknown extends T
			? B
			: Shaped<B, S>
		: Shaped<B, S>;

type Walk<
	T extends string,
	B extends string,
	Segs extends readonly string[],
> = Segs extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? Walk<StepOf<T, B, "seg", H>, B, R>
	: T;

type Step<
	S,
	Kind extends "key" | "idx" | "seg",
	K extends string | number,
> = S extends { readonly k: "obj"; readonly m: infer M }
	? Kind extends "idx"
		? never
		: K extends keyof M
			? ValShape<M[K]>
			: string extends K
				? ValShape<M[keyof M]>
				: never
	: S extends { readonly k: "rec"; readonly v: infer V }
		? Kind extends "idx"
			? never
			: ValShape<V>
		: S extends { readonly k: "arr"; readonly e: infer E }
			? IndexOk<Kind, K> extends true
				? ValShape<E>
				: never
			: S extends {
						readonly k: "tup";
						readonly es: infer Es extends readonly unknown[];
					}
				? IndexOk<Kind, K> extends true
					? K extends keyof Es
						? ValShape<Es[K]>
						: K extends `-${string}`
							? ValShape<Es[number]>
							: never
					: never
				: S extends { readonly k: "val"; readonly c: infer C extends ColInfo }
					? StepVal<C["type"], Kind, K>
					: S extends TsShape<infer T>
						? TsShape<StepTs<T, Kind, K>>
						: never;
type IndexOk<Kind extends string, K> = Kind extends "key"
	? false
	: K extends number
		? true
		: K extends `${number}`
			? true
			: false;

type StepVal<
	T extends string,
	Kind extends "key" | "idx" | "seg",
	K extends string | number,
> =
	ShapeOfType<T> extends infer S
		? S extends null
			? T extends JsonT | "unknown" | "record"
				? TsShape<unknown>
				: T extends `${infer E}[]`
					? IndexOk<Kind, K> extends true
						? ValShape<Info<E, true>>
						: never
					: never
			: Step<S, Kind, K>
		: never;

type StepTs<
	T,
	Kind extends "key" | "idx" | "seg",
	K extends string | number,
> = unknown extends T
	? unknown
	: T extends readonly unknown[]
		? IndexOk<Kind, K> extends true
			? TsIndex<T, K>
			: never
		: T extends object
			? Kind extends "idx"
				? never
				: K extends keyof T
					? Exclude<T[K], undefined>
					: string extends K
						? Exclude<T[keyof T], undefined>
						: never
			: never;
type TsIndex<
	T extends readonly unknown[],
	K,
> = K extends `${infer N extends number}`
	? `${N}` extends keyof T
		? Exclude<T[N], undefined>
		: T[number]
	: T[number];

type PathSegs<V extends string> = V extends `{${infer Body}}`
	? Body extends `${string}${'"' | "\\"}${string}`
		? null
		: Body extends ""
			? []
			: SplitComma<Body, []>
	: null;
type SplitComma<
	S extends string,
	Acc extends string[],
> = S extends `${infer H},${infer R}`
	? SplitComma<R, [...Acc, Trim<H>]>
	: [...Acc, Trim<S>];
type Trim<S extends string> = S extends ` ${infer R}`
	? Trim<R>
	: S extends `${infer R} `
		? Trim<R>
		: S;
