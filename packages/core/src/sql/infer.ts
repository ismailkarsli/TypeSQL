import type { Next } from "../engine/next.js";
import type { Tup } from "../engine/num.js";
import type { NullTest } from "../engine/params.js";
import type { Cols, ColsToMap } from "../engine/types.js";
import type { AnyErr } from "../errors.js";
import type {
	AnalysisOf,
	EngineTypes,
	RowTypeOf,
	TsParamTypeOf,
} from "./contract.js";
import type { JsonValue } from "./inline.js";
import type { NamedArgs } from "./named.js";

export type RowOf<E extends EngineTypes, DB, TM, Q extends string> = AnalysisOf<
	E,
	DB,
	Q
>["cols" & keyof AnalysisOf<E, DB, Q>] extends infer C
	? C extends Cols
		? RowTypeOf<E, ColsToMap<C>, TM, DB>
		: never
	: never;

// Share parameter uses and conversions across arguments, carried values and results.
interface ParamData {
	readonly type: unknown;
	readonly arg: unknown;
	readonly uses: unknown;
}
type ParamDataOf<E extends EngineTypes, DB, TM, Q extends string> =
	AnalysisOf<E, DB, Q> extends { readonly max: infer N extends number }
		? BuildParamData<
				E,
				AnalysisOf<E, DB, Q>["params" & keyof AnalysisOf<E, DB, Q>],
				N,
				TM,
				DB
			>
		: [];
type BuildParamData<E extends EngineTypes, P, N extends number, TM, DB> =
	Tup<N, unknown> extends infer T extends unknown[]
		? {
				[K in keyof T]: K extends `${infer I extends number}`
					? DataFor<E, P[Next<I> & keyof P], TM, DB>
					: never;
			}
		: never;
interface DataFor<E extends EngineTypes, U, TM, DB> {
	readonly type: ParamTs<E, U, TM, DB>;
	readonly uses: U;
	readonly arg: JsonArg<E, ParamTs<E, U, TM, DB>, U>;
}
export type ParamsOf<
	E extends EngineTypes,
	DB,
	TM,
	Q extends string,
> = ParamTypes<ParamDataOf<E, DB, TM, Q>>;
type ParamTypes<P extends readonly ParamData[]> = {
	[K in keyof P]: P[K]["type"];
};

export type ParamTs<E extends EngineTypes, U, TM, DB> =
	IntersectUses<E, U, TM, DB> extends infer X
		? [X] extends [never]
			? never
			: [Extract<U, NullTest | { readonly nullable: false }>] extends [never]
				? X | null
				: [Extract<U, NullTest>] extends [never]
					? X
					: X | null
		: never;

type IntersectUses<E extends EngineTypes, U, TM, DB> = (
	U extends NullTest
		? never
		: U extends { readonly type: infer T extends string }
			? (u: TsParamTypeOf<E, TM, DB, T>) => void
			: never
) extends (u: infer X) => void
	? X
	: never;

export type ArgsOf<E extends EngineTypes, DB, TM, Q extends string> = ParamArgs<
	ParamDataOf<E, DB, TM, Q>
>;
type ParamArgs<P extends readonly ParamData[]> = {
	[K in keyof P]: P[K]["arg"];
};

type JsonArg<E extends EngineTypes, X, U> = [
	Extract<U, { readonly type: E["json"] }>,
] extends [never]
	? X
	: NonArrayOrSqlJson<X>;

export type NonArrayOrSqlJson<X> =
	| (unknown extends X ? NonArrayValue : Exclude<X, readonly unknown[]>)
	| JsonValue
	| ArraysNeedSqlJson;

type NonArrayValue =
	| string
	| number
	| boolean
	| bigint
	| null
	| undefined
	| (object & { readonly length?: never })
	// biome-ignore lint/plugin: object literals of any shape are valid JSON parameters.
	| { readonly length?: never; readonly [key: string]: unknown };

interface ArraysNeedSqlJson {
	readonly "pass a JSON array as sql.json(value)": never;
}

export type NamesOf<E extends EngineTypes, DB, Q extends string> =
	AnalysisOf<E, DB, Q> extends { readonly names: infer N } ? N : [];

export type ParamsArgs<E extends EngineTypes, DB, TM, Q extends string> =
	NamesOf<E, DB, Q> extends infer N extends readonly string[]
		? N extends readonly []
			? ArgsOf<E, DB, TM, Q>
			: NamedArgs<N, ArgsOf<E, DB, TM, Q>>
		: never;

export type Validate<E extends EngineTypes, DB, Q extends string> =
	AnalysisOf<E, DB, Q> extends AnyErr ? AnalysisOf<E, DB, Q> : Q;

export type KindOf<E extends EngineTypes, DB, Q extends string> =
	AnalysisOf<E, DB, Q> extends { readonly kind: infer K } ? K : never;
