import type { AnyErr } from "../../errors.js";
import type { JsonValue } from "../../sql/inline.js";
import type { NamedParams, RewriteNamed } from "../../sql/named.js";
import type { UnknownTuple } from "../../sql/splice.js";
import type { TsOf, TsParamTypeOf } from "../type-map/index.js";
import type { DmlStmt, SelectStmt, Stmt } from "./ast.js";
import type {
	CachedAnalysis,
	CachedDdl,
	DdlCacheKeys,
	QueryCacheKeys,
} from "./cache.js";
import type { ApplyDdlAll } from "./ddl/script.js";
import type { Reposition } from "./diagnostics.js";
import type { Lex } from "./lexer/lex.js";
import type { Toks } from "./lexer/tokens.js";
import type { FastSelect } from "./parser/fast.js";
import type { ParseProgram } from "./parser/stmt.js";
import type { Nx } from "./parser/util.js";
import type { ParamsOfDml } from "./project/dml.js";
import type { ProjectStmt } from "./project/stmt.js";
import type {
	MaxParam,
	NullTest,
	ParamsOfSelect,
	ParamsToMap,
} from "./typer/params.js";
import type { Cols, ColsToMap, Simplify } from "./types.js";

export type Analyze<DB, Q extends string> =
	RewriteNamed<Q> extends infer RN
		? RN extends [infer Q1 extends string, infer Names]
			? FastSelect<Q1> extends infer F
				? [F] extends [never]
					? AnalyzeGeneral<DB, Q1, Names>
					: F extends {
								stmt: infer S extends Stmt;
								max: infer M extends number;
							}
						? ProjectStmt<S, DB, [], {}> extends infer C
							? C extends Cols | null
								? {
										readonly kind: S["t"];
										readonly cols: C;
										readonly params: M extends 0
											? {}
											: ParamsToMap<ParamsOfStmt<S, DB>>;
										readonly max: M;
										readonly names: Names;
										readonly stmt: S;
									}
								: AnalyzeGeneral<DB, Q1, Names>
							: never
						: AnalyzeGeneral<DB, Q1, Names>
				: never
			: RN
		: never;

type AnalyzeGeneral<DB, Q1 extends string, Names> =
	Lex<Q1> extends infer T
		? T extends Toks
			? ParseProgram<T> extends infer S
				? S extends Stmt
					? ProjectStmt<S, DB, [], {}> extends infer C
						? C extends Cols | null
							? {
									readonly kind: S["t"];
									readonly cols: C;
									readonly params: MaxParam<T> extends 0
										? {}
										: ParamsToMap<ParamsOfStmt<S, DB>>;
									readonly max: MaxParam<T>;
									readonly names: Names;
									readonly stmt: S;
								}
							: Reposition<C, T, DB>
						: never
					: Reposition<S, T, DB>
				: never
			: T
		: never;

export type Analysis<DB, Q extends string> = [Q] extends [keyof QueryCacheKeys]
	? CachedAnalysis<DB, Q> extends infer C
		? [C] extends [never]
			? Analyze<DB, Q>
			: C
		: never
	: Analyze<DB, Q>;

type ParamsOfStmt<S extends Stmt, DB> = S extends SelectStmt
	? ParamsOfSelect<S, DB, [], {}, never>
	: S extends DmlStmt
		? ParamsOfDml<S, DB, {}, never>
		: S extends {
					readonly t: "declare_cursor";
					readonly q: infer Q extends SelectStmt;
				}
			? ParamsOfSelect<Q, DB, [], {}, never>
			: never;

export type RowOf<DB, TM, Q extends string> = Analysis<DB, Q>["cols" &
	keyof Analysis<DB, Q>] extends infer C
	? C extends Cols
		? BuildRow<ColsToMap<C>, TM, DB>
		: never
	: never;

export type BuildRow<
	M extends {
		readonly [k: string]: { readonly type: string; readonly nullable: boolean };
	},
	TM,
	DB,
> = Simplify<{ -readonly [K in keyof M]: TsOf<TM, DB, M[K]> }>;

export type ParamsOf<DB, TM, Q extends string> =
	Analysis<DB, Q> extends { readonly max: infer N extends number }
		? BuildParams<Analysis<DB, Q>["params" & keyof Analysis<DB, Q>], N, TM, DB>
		: [];

type BuildParams<P, N extends number, TM, DB> =
	UnknownTuple<N> extends infer T extends unknown[]
		? {
				[K in keyof T]: K extends `${infer I extends number}`
					? ParamTs<P[Nx<I> & keyof P], TM, DB>
					: never;
			}
		: never;

type ParamTs<U, TM, DB> =
	IntersectUses<Exclude<U, NullTest>, TM, DB> extends infer X
		? [X] extends [never]
			? never
			: [Extract<U, NullTest | { readonly nullable: false }>] extends [never]
				? X | null
				: [Extract<U, NullTest>] extends [never]
					? X
					: X | null
		: never;

type IntersectUses<U, TM, DB> = (
	U extends { readonly type: infer T extends string }
		? (u: TsParamTypeOf<TM, DB, T>) => void
		: never
) extends (u: infer X) => void
	? X
	: never;

export type ArgsOf<DB, TM, Q extends string> = JsonArgs<
	ParamsOf<DB, TM, Q>,
	Analysis<DB, Q>["params" & keyof Analysis<DB, Q>]
>;

type JsonArgs<Ps, P> = {
	[I in keyof Ps]: I extends `${infer N extends number}`
		? Nx<N> extends keyof P
			? JsonArg<Ps[I], P[Nx<N>]>
			: Ps[I]
		: Ps[I];
};

type JsonArg<X, U> = [Extract<U, { readonly type: "json" | "jsonb" }>] extends [
	never,
]
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
	| { readonly length?: never; readonly [key: string]: unknown };

interface ArraysNeedSqlJson {
	readonly "pass a JSON array as sql.json(value)": never;
}

export type NamesOf<DB, Q extends string> =
	Analysis<DB, Q> extends { readonly names: infer N } ? N : [];

export type ParamsArgs<DB, TM, Q extends string> =
	NamesOf<DB, Q> extends infer N extends readonly string[]
		? N extends readonly []
			? ArgsOf<DB, TM, Q>
			: [params: NamedParams<N, ArgsOf<DB, TM, Q>>]
		: never;

export type Validate<DB, Q extends string> =
	Analysis<DB, Q> extends infer R ? (R extends AnyErr ? R : Q) : never;

export type KindOf<DB, Q extends string> =
	Analysis<DB, Q> extends { readonly kind: infer K } ? K : never;

export type ApplyDdl<DB, Q extends string> = [Q] extends [keyof DdlCacheKeys]
	? CachedDdl<DB, Q> extends infer C
		? [C] extends [never]
			? ApplyDdlAll<DB, Q>
			: C
		: never
	: ApplyDdlAll<DB, Q>;
