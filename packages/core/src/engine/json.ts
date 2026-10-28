import type { EnumsOf } from "../type-map/index.js";
import type { Expr } from "./ast.js";
import type { SqlError } from "./errors.js";
import type { Nx } from "./parser/util.js";
import type { AnyShaped, BaseOf, Shaped } from "./shape.js";
import type {
	DateTimeT,
	IntT,
	LitToText,
	NumT,
	RangeT,
	StrT,
} from "./typer/operators.js";
import type { ColInfo, Info } from "./types.js";

/**
 * Typed JSON. A `json` / `jsonb` value whose structure is known carries it as a shape (see
 * shape.ts): `Shaped<"jsonb", S>`. Shapes describe the value in SQL terms and are turned into
 * TypeScript types only at the row boundary (`JsonTs`), with Postgres's JSON serialization
 * rules (verified on PostgreSQL 18, `to_json` / `json_build_object` / `json_agg`):
 *
 *   int2 int4 int8 float4 float8 numeric      → number (JSON numbers; `JSON.parse` loses int8
 *                                               precision beyond 2^53, NaN/Infinity are strings)
 *   bool                                      → boolean
 *   text, uuid, date/time types, interval,    → string (their text form: timestamps are ISO
 *   bytea, money, oid, inet, bit, ranges, …     8601 strings, bytea is "\\x…" hex)
 *   enums                                     → the enum's values
 *   arrays                                    → arrays (elements as above)
 *   json / jsonb                              → embedded (their shape, or unknown)
 *   whole rows (to_json(t))                   → objects keyed by column name
 *
 * Shapes:
 *   obj  keys → SQL types        json_build_object('a', x), to_json(t) (through `val`)
 *   arr  element SQL type        json_agg(x)
 *   tup  element SQL types       json_build_array(a, b)
 *   rec  value SQL type          json_object_agg(k, v): an object with arbitrary keys
 *   val  an SQL value            to_json(x): x serialized
 *   ts   a TypeScript type       Json<T> columns, simple JSON literals ('[]'), steps into a `ts`
 */
type ArrShape<E> = { readonly k: "arr"; readonly e: E };
type ValShape<C> = { readonly k: "val"; readonly c: C };
/** A JSON value of TS type `T` (`Json<T>` columns). */
export type TsShape<T> = { readonly k: "ts"; readonly v: T };

// ───────────────────────────── literals ─────────────────────────────

/**
 * Type of an untyped string literal in operand position (typeof.ts `TypeOperand`). Simple JSON
 * literals keep their value as a shape, so `coalesce(json_agg(x), '[]')` stays an array; any
 * other literal is plain `lit` (when it meets a shaped JSON value, the result is plain JSON).
 */
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

/** `'…'::json` / `json '…'` (`To` is json or jsonb): a simple JSON literal keeps its value; `null` when it has no shape. */
export type JsonLitCast<To extends string, V extends string> =
	LitType<V> extends Shaped<"lit", infer S> ? Shaped<To, S> : null;

/**
 * `CommonLit` of a string literal `L` and a shaped value `X`: the literal takes `X`'s type.
 * A simple JSON literal adds its value (`'[]'` is absorbed by an array shape); any other
 * literal makes the result plain JSON. Whole rows lose their shape.
 */
export type LitCommon<L extends string, X extends string> =
	BaseOf<X> extends "json" | "jsonb"
		? L extends Shaped<"lit", infer SL>
			? X extends Shaped<string, infer SX>
				? Shaped<BaseOf<X>, MergeShapes<SX, SL>>
				: BaseOf<X>
			: BaseOf<X>
		: BaseOf<X>;

/** Union of two branch shapes; an empty-array literal (`'[]'`) is absorbed by an array shape. */
export type MergeShapes<A, B> = [B] extends [TsShape<[]>]
	? ArrayLike<A> extends true
		? A
		: A | B
	: [A] extends [TsShape<[]>]
		? ArrayLike<B> extends true
			? B
			: A | B
		: A | B;
type ArrayLike<S> = [S] extends [ArrShape<unknown>]
	? true
	: [S] extends [TsShape<infer T>]
		? [] extends T
			? true
			: false
		: false;

// ───────────────────────────── constructors ─────────────────────────────

/** Strip the string-literal pseudo-type from a value's info (`'x'` is text). */
type ValInfo<A extends ColInfo> = A["type"] extends "lit"
	? Info<"text", A["nullable"]>
	: A;

/**
 * JSON return patterns of the function catalog (`Sig<…, "$jval:json">`); the functions have the
 * arguments their pattern reads:
 *   $jval:B    to_json / row_to_json / array_to_json: the first argument, serialized
 *   $jarr:B    json_agg: array of the first argument (NULLs included)
 *   $jarrnn:B  json_agg_strict: array of the first argument, NULLs skipped
 *   $jrec:B    json_object_agg: object of the second argument ($jrecnn: NULL values skipped)
 *   $jtup:B    json_build_array: tuple of the arguments
 *   $jelem:B   json_array_elements: an element of the first argument
 */
export type JsonRet<
	P extends string,
	As extends readonly ColInfo[],
> = P extends `${infer K}:${infer B}`
	? K extends "val"
		? Shaped<B, ValShape<Info<LitToText<As[0]["type"]>>>>
		: K extends "arr"
			? Shaped<B, ArrShape<ValInfo<As[0]>>>
			: K extends "arrnn"
				? Shaped<B, ArrShape<Info<LitToText<As[0]["type"]>>>>
				: K extends "rec"
					? Shaped<B, { readonly k: "rec"; readonly v: ValInfo<As[1]> }>
					: K extends "recnn"
						? Shaped<
								B,
								{
									readonly k: "rec";
									readonly v: Info<LitToText<As[1]["type"]>>;
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
							: StepOf<As[0]["type"], B, "idx", number> // elem
	: "unknown";

/**
 * `json_build_object(k1, v1, …)` with literal keys: an object shape (a repeated key keeps its
 * last value, like the JSON the drivers parse). A non-literal key gives plain JSON.
 */
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
	: Args[Nx<I>] extends undefined
		? SqlError<"argument list must have even number of elements", null>
		: Args[I] extends { readonly t: "null" }
			? SqlError<"null value not allowed for object key", null>
			: KeyOf<Args[I]> extends infer K extends string
				? BuildObject<
						B,
						Args,
						As,
						Nx<Nx<I>>,
						Without<Acc, K> & { readonly [P in K]: ValInfo<As[Nx<I>]> }
					>
				: Info<B>;
/** `Acc` without key `K` (a repeated key keeps its last value). */
type Without<Acc, K extends string> = K extends keyof Acc ? Omit<Acc, K> : Acc;
type KeyOf<E> = E extends {
	readonly t: "str" | "num";
	readonly v: infer V;
}
	? V
	: null;

// ───────────────────────────── navigation ─────────────────────────────

/** Shape of a type name: a shaped JSON value's shape, a whole row (`obj`), or `null`. */
type ShapeOfType<T extends string> =
	T extends Shaped<"json" | "jsonb" | "record", infer S> ? S : null;

/**
 * `L -> R`, `L #> R` and `L[R]` on a shaped JSON value (`null` when `L` has no shape, or the
 * step cannot be followed: the caller then uses the plain operator rules). `R` is the operand
 * AST, so literal keys, indexes and paths are followed precisely; a non-literal text key or
 * integer index (`RT`, a negative one too) follows every key / element.
 */
export type JsonArrow<
	Op extends string,
	L extends ColInfo,
	R extends Expr,
	RT extends ColInfo,
> =
	L["type"] extends Shaped<"json" | "jsonb", unknown>
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

/** One step from type name `T`; the result is a `B` (json/jsonb), shaped when the step's target is known. */
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
/** A step result: `unknown` (no shape left) is the plain type; a step that only misses has no value (NULL). */
type Reshape<B extends string, S> = [S] extends [never]
	? Shaped<B, TsShape<never>>
	: [S] extends [TsShape<infer T>]
		? unknown extends T
			? B
			: Shaped<B, S>
		: Shaped<B, S>;

/** Follow a `#>` path. */
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

/**
 * One step into a shape (distributes over a union of shapes). `key`: object key; `idx`: array
 * index (number = any element); `seg`: a `#>` path element, an index for arrays and a key for
 * objects. Missing keys, out-of-range indexes and keys on arrays (and the reverse) are SQL NULL,
 * not a JSON `null`: they give `never` here (`coalesce(x -> 'nope', '[]')` is `[]`), and a step
 * that only misses is NULL (`Reshape`).
 */
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
					: S extends { readonly k: "ts"; readonly v: infer T }
						? TsShape<StepTs<T, Kind, K>>
						: never;
type IndexOk<Kind extends string, K> = Kind extends "key"
	? false
	: K extends number
		? true
		: K extends `${number}`
			? true
			: false;

/** Step into a serialized SQL value: shaped JSON and rows have shapes; arrays index; scalars give NULL. */
type StepVal<
	T extends string,
	Kind extends "key" | "idx" | "seg",
	K extends string | number,
> =
	ShapeOfType<T> extends infer S
		? S extends null
			? T extends "json" | "jsonb" | "unknown" | "record"
				? TsShape<unknown>
				: T extends `${infer E}[]`
					? IndexOk<Kind, K> extends true
						? ValShape<Info<E, true>>
						: never
					: never
			: Step<S, Kind, K>
		: never;

/** Step into a TypeScript type (`Json<T>` columns): `T[K]` for objects, `T[number]` for arrays; a miss is `never` (see `Step`). */
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
/** An element of `T`: by position for a literal index into a tuple (past its end, or negative from the end, any element). */
type TsIndex<
	T extends readonly unknown[],
	K,
> = K extends `${infer N extends number}`
	? `${N}` extends keyof T
		? Exclude<T[N], undefined>
		: T[number]
	: T[number];

/** `'{a,0,b}'` → `["a", "0", "b"]`; `null` for quoted or escaped elements. */
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

// ───────────────────────────── to TypeScript ─────────────────────────────

/** TS type of a JSON shape (distributes over a union of shapes). */
export type JsonTs<S, DB> = S extends { readonly k: "obj"; readonly m: infer M }
	? [keyof M] extends [never]
		? Record<string, never>
		: {
				-readonly [K in keyof M]: M[K] extends ColInfo
					? JsonValueTs<M[K], DB>
					: never;
			}
	: S extends { readonly k: "arr"; readonly e: infer E extends ColInfo }
		? JsonValueTs<E, DB>[]
		: S extends {
					readonly k: "tup";
					readonly es: infer Es extends readonly ColInfo[];
				}
			? { -readonly [I in keyof Es]: JsonValueTs<Es[I], DB> }
			: S extends { readonly k: "rec"; readonly v: infer V extends ColInfo }
				? { [key: string]: JsonValueTs<V, DB> }
				: S extends { readonly k: "val"; readonly c: infer C extends ColInfo }
					? JsonValueTs<C, DB>
					: S extends { readonly k: "ts"; readonly v: infer T }
						? T
						: unknown;

/** TS type of an SQL value inside JSON (distributes over a union of infos). */
type JsonValueTs<C extends ColInfo, DB> = C extends ColInfo
	? C["nullable"] extends true
		? JsonOfType<C["type"], DB> | null
		: JsonOfType<C["type"], DB>
	: never;

/** Types that JSON serialization writes as strings (their text form). */
type JsonStringT =
	| StrT
	| DateTimeT
	| RangeT
	| `${string}multirange`
	| "uuid"
	| "interval"
	| "bytea"
	| "money"
	| "oid"
	| "inet"
	| "cidr"
	| "macaddr"
	| "macaddr8"
	| "bit"
	| "varbit"
	| "xml"
	| "tsvector"
	| "tsquery"
	| "jsonpath"
	| "regclass"
	| "regtype"
	| "regproc"
	| "regconfig"
	| "point"
	| "line"
	| "lseg"
	| "box"
	| "path"
	| "polygon"
	| "circle";

type JsonOfType<T extends string, DB> = T extends AnyShaped
	? ShapeOfType<T> extends infer S
		? S extends null
			? unknown
			: JsonTs<S, DB>
		: never
	: T extends NumT
		? number
		: T extends "bool"
			? boolean
			: T extends "null"
				? null
				: T extends `${infer E}[]`
					? JsonOfType<E, DB>[]
					: T extends JsonStringT
						? string
						: T extends keyof EnumsOf<DB>
							? EnumsOf<DB>[T]
							: unknown;
