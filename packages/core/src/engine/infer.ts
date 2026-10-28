import type { TsOf, TsParamTypeOf } from "../type-map/index.js";
import type { DmlStmt, SelectStmt, Stmt } from "./ast.js";
import type {
	CachedAnalysis,
	CachedDdl,
	DdlCacheKeys,
	QueryCacheKeys,
} from "./cache.js";
import type { ApplyDdlAll } from "./ddl/apply.js";
import type { AnyErr, SqlError } from "./errors.js";
import type { JsonValue } from "./inline.js";
import type { Lex } from "./lexer/lex.js";
import type { IdTok, Toks, WordTok } from "./lexer/tokens.js";
import type { NamedParams, RewriteNamed } from "./named.js";
import type { FastSelect } from "./parser/fast.js";
import type { IntoName } from "./parser/select.js";
import type { ParseProgram } from "./parser/stmt.js";
import type { Nx } from "./parser/util.js";
import type { ParamsOfDml } from "./project/dml.js";
import type { ProjectStmt } from "./project/stmt.js";
import type { WithHint } from "./suggest.js";
import type { IntLitValue } from "./typer/operators.js";
import type {
	MaxParam,
	NullTest,
	ParamsOfSelect,
	ParamsToMap,
} from "./typer/params.js";
import type { Cols, ColsToMap, Simplify } from "./types.js";

/**
 * Full pipeline for one statement. Cached by TypeScript per `(DB, Q)`, so the three
 * public projections (`RowOf`, `ParamsOf`, `Validate`) share one evaluation.
 *
 * Result: `{ kind, cols, params, max, names, stmt }` or `SqlError<Message, TokenIndex>`.
 * `names` lists `:name` parameters in order of first appearance (`[]` for `$n` statements).
 */
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
									// the parameter pass re-types expressions; skip it when there are no `$n`
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

/**
 * `Analyze` without `stmt`, from the type cache when it has a fresh entry for `(DB, Q)` (see
 * cache.ts). What the projections below read; `Analyze` itself is never cached.
 */
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

/**
 * Error positions are token indexes. Parser errors already carry the index of the
 * offending token. Semantic errors carry `null` and name the offending identifier in
 * the message (`column "nme" …`, `column u.nme …`, `relation "x" …`, `table "x"`); the
 * first occurrence of that identifier in the token stream is used. Unknown columns and
 * relations get a "Perhaps you meant …" hint when a close name exists (see suggest.ts).
 */
type Reposition<E, T extends Toks, DB = never> =
	E extends SqlError<infer M, infer At>
		? At extends null
			? SqlError<WithHint<M, T, DB>, LocateIdent<M, T>>
			: SqlError<M, At>
		: E;

/**
 * Token index for a semantic error: the function of `function f(…) does not exist` and of a
 * call decoration it does not take or needs (`FILTER specified, but f is not …`), the
 * first quoted name in the message that occurs in the statement (`null value in column
 * "email" of relation "users"` → `users` when `email` is absent), then `column t.c` forms, then the keyword of `each UNION query …` and
 * `UNION|INTERSECT|EXCEPT|VALUES|CYCLE types … cannot be matched`. A keyword is looked up
 * among the words only: a quoted identifier spelled like it (`AS "union"`) is a name.
 */
type LocateIdent<
	M extends string,
	T extends Toks,
> = M extends `function ${infer Name}(${string}`
	? FindTokOr<T, Name, 0>
	: M extends
				| `${infer Name}(*) ${string}`
				| `window function ${infer Name} requires ${string}`
				| `WITHIN GROUP is required for ordered-set aggregate ${infer Name}`
				| `${string} specified, but ${infer Name} is not ${string}`
		? FindTokOr<T, Name, 0>
		: M extends `column ${string}.${infer Name} ${string}`
			? FindTokOr<T, Name, LocateQuoted<M, T>>
			: M extends "DEFAULT is not allowed in this context"
				? FindKwOr<T, "default", 0>
				: M extends "SELECT ... INTO is not allowed here"
					? FindSelectInto<T, 0, null>
					: M extends `${infer Cl} ${string} position ${infer N} is not in select list`
						? FindNumFrom<
								T,
								FindKwOr<T, Lowercase<Cl>, 0>,
								N extends `-${infer D}` ? D : N,
								null
							>
						: M extends `each ${infer Op} query ${string}`
							? FindKwOr<T, Lowercase<Op>, 0>
							: M extends `${infer Op} types ${string} cannot be matched`
								? FindKwOr<T, Lowercase<Op>, 0>
								: LocateQuoted<M, T>;
type LocateQuoted<
	M extends string,
	T extends Toks,
> = M extends `${string}"${infer Name}"${infer Rest}`
	? FindTokOr<
			T,
			Name,
			// a qualified name (`relation "public.t"`) is at its first part, as in Postgres
			Name extends `${infer First}.${string}`
				? FindTokOr<T, First, LocateQuoted<Rest, T>>
				: LocateQuoted<Rest, T>
		>
	: 0;
/** The first word or quoted identifier `Name`, or `Else`. */
type FindTokOr<
	T extends Toks,
	Name extends string,
	Else extends number,
> = FindOr<T, WordTok<Name> | IdTok<Name>, Else>;
/** The first keyword `Kw` (a word, not a quoted identifier), or `Else`. */
type FindKwOr<T extends Toks, Kw extends string, Else extends number> = FindOr<
	T,
	WordTok<Kw>,
	Else
>;
type FindOr<T extends Toks, P, Else extends number> =
	FindTok<T, P, 0> extends infer I extends number
		? I extends -1
			? Else
			: I
		: Else;
/** Index of the first token from `I` on that is a `P`, or -1. */
type FindTok<T extends Toks, P, I extends number> = T[I] extends {
	readonly k: string;
}
	? T[I] extends P
		? I
		: T[Nx<I>] extends P
			? Nx<I>
			: T[Nx<Nx<I>>] extends P
				? Nx<Nx<I>>
				: T[Nx<Nx<Nx<I>>>] extends P
					? Nx<Nx<Nx<I>>>
					: FindTok<T, P, Nx<Nx<Nx<Nx<I>>>>>
	: -1;
/**
 * The name after the first `INTO` keyword that does not follow `INSERT` / `MERGE` (`Prev`: the
 * token before `I`), where Postgres reports it. Only called for a statement that has one.
 */
type FindSelectInto<T extends Toks, I extends number, Prev> =
	T[I] extends WordTok<"into">
		? Prev extends WordTok<"insert" | "merge">
			? FindSelectInto<T, Nx<I>, T[I]>
			: IntoName<T, I>
		: FindSelectInto<T, Nx<I>, T[I]>;
/**
 * The first integer constant from `I` on whose value is `N` (`0x10`, `016` and `1_6` are 16), or 0;
 * under unary minuses (`-16`, `- -16`, `-(16)`) the first minus, where Postgres reports it.
 * `Minus`: the first `-` of the run of `-` and `(` before the current token.
 */
type FindNumFrom<
	T extends Toks,
	I extends number,
	N extends string,
	Minus extends number | null,
> = T[I] extends {
	readonly k: string;
}
	? T[I] extends { readonly k: "n"; readonly v: infer V extends string }
		? IntLitValue<V> extends N
			? Minus extends number
				? Minus
				: I
			: FindNumFrom<T, Nx<I>, N, null>
		: T[I] extends { readonly k: "o"; readonly v: "-" | "(" }
			? FindNumFrom<
					T,
					Nx<I>,
					N,
					Minus extends number
						? Minus
						: T[I] extends { readonly v: "-" }
							? I
							: null
				>
			: FindNumFrom<T, Nx<I>, N, null>
	: 0;
/** Row type of a statement (`never` for DML without RETURNING and for DDL). */
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

/**
 * Parameter tuple of a statement. Untyped params are `unknown`.
 * Read the parameter map by indexed access: inferring or constraining the whole map forces
 * every nested parameter pass to resolve while relating union analyses from SQL fragments.
 */
export type ParamsOf<DB, TM, Q extends string> =
	Analysis<DB, Q> extends { readonly max: infer N extends number }
		? BuildParams<
				Analysis<DB, Q>["params" & keyof Analysis<DB, Q>],
				N,
				TM,
				DB,
				1,
				[]
			>
		: [];

type BuildParams<
	P,
	N extends number,
	TM,
	DB,
	I extends number,
	Acc extends unknown[],
> = Acc["length"] extends N
	? Acc
	: BuildParams<
			P,
			N,
			TM,
			DB,
			Inc<I>,
			[...Acc, ParamTs<P[I & keyof P], TM, DB>]
		>;
/**
 * A parameter used in several places has a union of `ColInfo`s; its TS type is the
 * intersection of each use's TS type (without null), plus `| null` when every use accepts
 * null, or when the statement tests the `$n` with `IS [NOT] NULL` (a `NullTest` entry).
 * Uses with conflicting types (`id = $1 AND label = $1`) give `never`, not `null`. A `$n` with no
 * typed use (unused, or only tested for NULL) is `unknown`, the intersection of no types.
 */
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
type Inc<I extends number> = Nx<I>;

/**
 * What a call site passes for each parameter (`ParamsOf`, except for json / jsonb parameters):
 * node-postgres sends a JS array as a Postgres array literal, so a json / jsonb parameter takes
 * no raw array, but a `sql.json(value)` (sent as JSON text by every driver) or any other value.
 */
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
/**
 * A json / jsonb argument: `X` without arrays, or a `sql.json()` value. (Named so that the
 * error for a raw array says what to do; `ArraysNeedSqlJson` keeps it a union, which TS shows
 * by its alias.)
 */
export type NonArrayOrSqlJson<X> =
	| (unknown extends X ? NonArrayValue : Exclude<X, readonly unknown[]>)
	| JsonValue
	| ArraysNeedSqlJson;
/**
 * Any value but an array (or another object with a `length`). The index-signature member
 * accepts object literals (no excess-property error), the `object` one interfaces.
 */
type NonArrayValue =
	| string
	| number
	| boolean
	| bigint
	| null
	| undefined
	| (object & { readonly length?: never })
	| { readonly length?: never; readonly [key: string]: unknown };
/** No value has this type: see `NonArrayOrSqlJson`. */
interface ArraysNeedSqlJson {
	readonly "pass a JSON array as sql.json(value)": never;
}

/** Named parameter names of a statement in order of first appearance (`[]` when positional). */
export type NamesOf<DB, Q extends string> =
	Analysis<DB, Q> extends { readonly names: infer N } ? N : [];

/**
 * Argument list a call site must pass after the query: a single object for `:name`
 * statements, the positional tuple otherwise.
 */
export type ParamsArgs<DB, TM, Q extends string> =
	NamesOf<DB, Q> extends infer N extends readonly string[]
		? N extends readonly []
			? ArgsOf<DB, TM, Q>
			: [params: NamedParams<N, ArgsOf<DB, TM, Q>>]
		: never;

/**
 * `Validate<DB, Q>` is `Q` when the statement is valid, otherwise the `SqlError`.
 * Used as `query: Validate<DB, Q> & Q` so the error lands on the string literal. The error
 * comes first so it survives TypeScript's truncation of long types in diagnostics.
 */
export type Validate<DB, Q extends string> =
	Analysis<DB, Q> extends infer R ? (R extends AnyErr ? R : Q) : never;

/** Kind of statement: "select" | "insert" | ... */
export type KindOf<DB, Q extends string> =
	Analysis<DB, Q> extends { readonly kind: infer K } ? K : never;

/**
 * Apply a DDL script (one or more `;`-separated statements) to a schema: the new schema,
 * or `SqlError<message, tokenIndex>`. See engine/ddl/apply.ts. From the type cache (`DdlCache`)
 * when it has a fresh entry for the step.
 */
export type ApplyDdl<DB, Q extends string> = [Q] extends [keyof DdlCacheKeys]
	? CachedDdl<DB, Q> extends infer C
		? [C] extends [never]
			? ApplyDdlAll<DB, Q>
			: C
		: never
	: ApplyDdlAll<DB, Q>;
