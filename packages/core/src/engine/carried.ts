import type { SqlError } from "../errors.js";
import type { CheckEnc, DescribeEnc } from "../sql/inline.js";
import type { Next } from "../sql/next.js";
import type { EngineTypes, TokensOf, TypeDisplayOf } from "./contract.js";
import type { ParamData, ParamDataOf } from "./infer.js";
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
		: CarriedLoop<E, X, K, ParamDataOf<E, DB, TM, X>, 0>;

type CarriedLoop<
	E extends EngineTypes,
	X extends string,
	K extends readonly unknown[],
	P extends readonly ParamData[],
	I extends number,
> = I extends K["length"]
	? true
	: K[I] extends infer V extends string
		? Extract<
				CheckValue<
					E,
					V,
					P[I] extends ParamData ? P[I]["type"] : undefined,
					P[I] extends ParamData ? P[I]["uses"] : never
				>,
				string
			> extends infer M extends string
			? [M] extends [never]
				? CarriedLoop<E, X, K, P, Next[I]>
				: SqlError<
						`parameter $${Next[I]}: ${M}`,
						FindParam<TokensOf<E, X>, Next[I], 0>
					>
			: CarriedLoop<E, X, K, P, Next[I]>
		: CarriedLoop<E, X, K, P, Next[I]>;

type CheckValue<
	E extends EngineTypes,
	V extends string,
	P,
	U,
> = V extends `J${infer R}`
	? JsonContext<E, Exclude<U, NullTest>> extends false
		? `a sql.json() value cannot be used as ${Expected<E, U>}`
		: CheckEnc<R, P> extends true
			? true
			: `a sql.json() ${DescribeEnc<R>} value cannot be used as ${Expected<E, U>}`
	: CheckEnc<V, P> extends true
		? V extends `${string}[${string}`
			? IsJsonParam<E, Exclude<U, NullTest>> extends true
				? `an array for ${Expected<E, U>} must be passed as sql.json(value) (node-postgres sends a JS array as a Postgres array)`
				: true
			: true
		: `a ${DescribeEnc<V>} value cannot be used as ${Expected<E, U>}`;

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
	First<U> extends {
		readonly type: infer T extends string;
		readonly nullable: infer Nl;
	}
		? `${TypeDisplayOf<E, T>}${Nl extends true ? "" : " NOT NULL"}`
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
