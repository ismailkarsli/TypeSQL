import type { SqlError } from "../errors.js";
import type { CheckEnc, DescribeEnc } from "../sql/inline.js";
import type { Next } from "../sql/next.js";
import type {
	AnalysisOf,
	EngineTypes,
	TokensOf,
	TypeDisplayOf,
} from "./contract.js";
import type { ParamsOf } from "./infer.js";
import type { NullTest } from "./params.js";
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
		: CarriedLoop<E, DB, X, K, ParamsOf<E, DB, TM, X>, 0>;

type CarriedLoop<
	E extends EngineTypes,
	DB,
	X extends string,
	K extends readonly unknown[],
	P extends readonly unknown[],
	I extends number,
> = I extends K["length"]
	? true
	: K[I] extends infer V extends string
		? Extract<
				CheckValue<E, DB, X, Next[I], V, P[I]>,
				string
			> extends infer M extends string
			? [M] extends [never]
				? CarriedLoop<E, DB, X, K, P, Next[I]>
				: SqlError<
						`parameter $${Next[I]}: ${M}`,
						FindParam<TokensOf<E, X>, Next[I], 0>
					>
			: CarriedLoop<E, DB, X, K, P, Next[I]>
		: CarriedLoop<E, DB, X, K, P, Next[I]>;

type CheckValue<
	E extends EngineTypes,
	DB,
	X extends string,
	N extends number,
	V extends string,
	P,
> = V extends `J${infer R}`
	? JsonContext<E, ParamUses<E, DB, X, N>> extends false
		? `a sql.json() value cannot be used as ${Expected<E, DB, X, N>}`
		: CheckEnc<R, P> extends true
			? true
			: `a sql.json() ${DescribeEnc<R>} value cannot be used as ${Expected<E, DB, X, N>}`
	: CheckEnc<V, P> extends true
		? V extends `${string}[${string}`
			? IsJsonParam<E, ParamUses<E, DB, X, N>> extends true
				? `an array for ${Expected<E, DB, X, N>} must be passed as sql.json(value) (node-postgres sends a JS array as a Postgres array)`
				: true
			: true
		: `a ${DescribeEnc<V>} value cannot be used as ${Expected<E, DB, X, N>}`;

type ParamUses<E extends EngineTypes, DB, X extends string, N extends number> =
	AnalysisOf<E, DB, X> extends { readonly params: infer M }
		? N extends keyof M
			? Exclude<M[N], NullTest>
			: never
		: never;
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

type Expected<E extends EngineTypes, DB, X extends string, N extends number> =
	AnalysisOf<E, DB, X> extends { readonly params: infer M }
		? N extends keyof M
			? First<M[N]> extends {
					readonly type: infer T extends string;
					readonly nullable: infer Nl;
				}
				? `${TypeDisplayOf<E, T>}${Nl extends true ? "" : " NOT NULL"}`
				: "this parameter"
			: "this parameter"
		: "this parameter";
type First<U> = (U extends unknown ? (u: () => U) => void : never) extends (
	u: infer F,
) => void
	? F extends () => infer R
		? R
		: never
	: never;

type FindParam<T, N extends number, I extends number> = T extends Toks
	? T[I] extends { readonly k: "$"; readonly v: N }
		? I
		: T[I] extends { readonly k: string }
			? FindParam<T, N, Next[I]>
			: 0
	: 0;
