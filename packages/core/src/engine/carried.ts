import type { SqlError } from "../errors.js";
import type { CheckEnc, DescribeEnc, Enc } from "../sql/inline.js";
import type { Next } from "../sql/next.js";
import type {
	AnalysisOf,
	EngineTypes,
	TokensOf,
	TypeDisplayOf,
} from "./contract.js";
import type { ParamTs } from "./infer.js";
import type { PickOne } from "./object.js";
import type { NullTest } from "./params.js";
import type { Nx } from "./parse.js";
import type { Toks } from "./tokens.js";

export type CheckCarried<
	E extends EngineTypes,
	DB,
	TM,
	X extends string,
	K extends readonly unknown[],
> = K extends readonly []
	? true
	: number extends K["length"]
		? true
		: CarriedLoop<
				E,
				DB,
				TM,
				X,
				K,
				AnalysisOf<E, DB, X>["params" & keyof AnalysisOf<E, DB, X>],
				0
			>;

type CarriedLoop<
	E extends EngineTypes,
	DB,
	TM,
	X extends string,
	K extends readonly unknown[],
	P,
	I extends number,
> = I extends K["length"]
	? true
	: K[I] extends infer V extends string
		? CarriedMessage<E, DB, TM, V, P[Nx<I> & keyof P]> extends infer M extends
				string
			? [M] extends [never]
				? CarriedLoop<E, DB, TM, X, K, P, Next<I>>
				: SqlError<
						`parameter $${Next<I>}: ${M}`,
						FindParam<TokensOf<E, X>, Next<I>, 0>
					>
			: CarriedLoop<E, DB, TM, X, K, P, Next<I>>
		: CarriedLoop<E, DB, TM, X, K, P, Next<I>>;

type CarriedMessage<
	E extends EngineTypes,
	DB,
	TM,
	V extends string,
	U,
> = Extract<CheckValue<E, V, ParamTs<E, U, TM, DB>, U>, string>;

type CheckValue<
	E extends EngineTypes,
	V extends string,
	P,
	U,
> = V extends `J${infer R}`
	? JsonContext<E, Exclude<U, NullTest>> extends false
		? `a sql.json() value cannot be used as ${Expected<E, U>}`
		: CheckEnc<R, JsonType<E, U, P>> extends true
			? true
			: // sql.json() binds JSON text, which a parameter taking text accepts
				// unless the column declares a shape for the value before serialization.
				[JsonShapes<E, U>] extends [never]
				? [Exclude<P, null | undefined>] extends [string]
					? true
					: JsonError<E, R, U, JsonType<E, U, P>>
				: JsonError<E, R, U, JsonType<E, U, P>>
	: CheckEnc<V, P> extends true
		? V extends `${string}[0${string}`
			? IsJsonParam<E, Exclude<U, NullTest>> extends true
				? `an array for ${Expected<E, U>} must be passed as sql.json(value) (node-postgres sends a JS array as a Postgres array)`
				: true
			: true
		: `a ${DescribeEnc<V>} value cannot be used as ${Expected<E, U>}${Hint<E, U, P>}`;

type JsonError<
	E extends EngineTypes,
	R extends string,
	U,
	P,
> = `a sql.json() ${DescribeEnc<R>} value cannot be used as ${Expected<E, U>}${Hint<E, U, P>}`;

// Read/parameter maps can expose JSON as serialized text (as SQLite does).
// Inline JSON still carries the original value, so check every declared shape.
type JsonShapes<E extends EngineTypes, U> = U extends {
	readonly type: E["json"] & {
		readonly shape: { readonly k: "ts"; readonly v: infer V };
	};
}
	? (value: V) => void
	: never;
type JsonType<E extends EngineTypes, U, P> = [JsonShapes<E, U>] extends [never]
	? P
	: JsonShapes<E, U> extends (value: infer V) => void
		? V | Extract<P, null | undefined>
		: P;

// The database type alone doesn't say what a typed JSON, enum or object
// parameter takes.
type Hint<E extends EngineTypes, U, P> = unknown extends P
	? ""
	: Enc<P> extends infer X extends string
		? IsJsonParam<E, Exclude<U, NullTest>> extends true
			? ` (expected ${DescribeEnc<X>})`
			: X extends `${string}${"q" | "m" | "<"}${string}`
				? ` (expected ${DescribeEnc<X>})`
				: ""
		: "";

type IsJsonParam<E extends EngineTypes, U> = [
	Extract<U, { readonly type: E["json"] }>,
] extends [never]
	? false
	: true;
type JsonContext<E extends EngineTypes, U> = [U] extends [never]
	? true
	: [Extract<U, { readonly type: E["json"] | "unknown" }>] extends [never]
		? false
		: true;

type Expected<E extends EngineTypes, U> =
	PickOne<U> extends {
		readonly type: infer T extends string;
		readonly nullable: infer Nl;
	}
		? `${TypeDisplayOf<E, T>}${Nl extends true ? "" : " NOT NULL"}`
		: "this parameter";

type FindParam<T, N extends number, I extends number> = T extends Toks
	? T[I] extends { readonly k: "$"; readonly v: N }
		? I
		: T[I] extends { readonly k: string }
			? FindParam<T, N, Next<I>>
			: 0
	: 0;
