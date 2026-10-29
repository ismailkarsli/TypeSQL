import type { SqlError } from "../../errors.js";
import type { CheckEnc, DescribeEnc } from "../../sql/inline.js";
import type { Next } from "../../sql/next.js";
import type { Analysis, ParamsOf } from "./infer.js";
import type { Lex } from "./lexer/lex.js";
import type { Toks } from "./lexer/tokens.js";
import type { StripShape } from "./shape.js";
import type { NullTest } from "./typer/params.js";

export type CheckCarried<
	DB,
	TM,
	X extends string,
	K extends readonly unknown[],
> = K extends readonly []
	? true
	: number extends K["length"]
		? true
		: CarriedLoop<DB, X, K, ParamsOf<DB, TM, X>, 0>;

type CarriedLoop<
	DB,
	X extends string,
	K extends readonly unknown[],
	P extends readonly unknown[],
	I extends number,
> = I extends K["length"]
	? true
	: K[I] extends infer E extends string
		? Extract<
				CheckValue<DB, X, Next[I], E, P[I]>,
				string
			> extends infer M extends string
			? [M] extends [never]
				? CarriedLoop<DB, X, K, P, Next[I]>
				: SqlError<`parameter $${Next[I]}: ${M}`, FindParam<Lex<X>, Next[I], 0>>
			: CarriedLoop<DB, X, K, P, Next[I]>
		: CarriedLoop<DB, X, K, P, Next[I]>;

type CheckValue<
	DB,
	X extends string,
	N extends number,
	E extends string,
	P,
> = E extends `J${infer R}`
	? JsonContext<ParamUses<DB, X, N>> extends false
		? `a sql.json() value cannot be used as ${Expected<DB, X, N>}`
		: CheckEnc<R, P> extends true
			? true
			: `a sql.json() ${DescribeEnc<R>} value cannot be used as ${Expected<DB, X, N>}`
	: CheckEnc<E, P> extends true
		? E extends `${string}[${string}`
			? IsJsonParam<ParamUses<DB, X, N>> extends true
				? `an array for ${Expected<DB, X, N>} must be passed as sql.json(value) (node-postgres sends a JS array as a Postgres array)`
				: true
			: true
		: `a ${DescribeEnc<E>} value cannot be used as ${Expected<DB, X, N>}`;

type ParamUses<DB, X extends string, N extends number> =
	Analysis<DB, X> extends { readonly params: infer M }
		? N extends keyof M
			? Exclude<M[N], NullTest>
			: never
		: never;
type IsJsonParam<U> = [
	Extract<U, { readonly type: "json" | "jsonb" }>,
] extends [never]
	? false
	: true;
type JsonContext<U> = [U] extends [never]
	? true
	: [Extract<U, { readonly type: "json" | "jsonb" | "unknown" }>] extends [
				never,
			]
		? false
		: true;

type Expected<DB, X extends string, N extends number> =
	Analysis<DB, X> extends { readonly params: infer M }
		? N extends keyof M
			? First<M[N]> extends {
					readonly type: infer T extends string;
					readonly nullable: infer Nl;
				}
				? `${StripShape<T>}${Nl extends true ? "" : " NOT NULL"}`
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
