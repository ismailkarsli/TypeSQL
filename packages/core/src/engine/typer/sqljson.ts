import type { Expr, FromJsonTable, SelectStmt } from "../ast.js";
import type { TypeDisplay } from "../binder/clauses.js";
import type { CheckAlias, RenameCols } from "../binder/from.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { BuildObject, JsonLitCast, JsonRet } from "../json.js";
import type { Nx } from "../parser/util.js";
import type { BaseOf } from "../shape.js";
import type {
	ColInfo,
	Cols,
	ColsToMap,
	CteMap,
	Ctx,
	Info,
	MkCtx,
	Scope,
	ScopeLevel,
} from "../types.js";
import type { DateTimeT, NumT } from "./operators.js";
import type { ParamsOfList, ParamsOfOpt, ParamsOfSelect } from "./params.js";
import type { FirstColOf, Or, TypeList, TypeOf } from "./typeof.js";

/**
 * Typing of the SQL/JSON syntax (parser/json.ts), verified against PostgreSQL 18:
 *
 *   JSON(v)                    json, nullable iff v is (a JSON-looking literal keeps its value)
 *   JSON_SCALAR(v)             json holding v serialized (like to_json), nullable iff v is
 *   JSON_SERIALIZE(v)          text or the RETURNING type (a string type or bytea), nullable iff v is
 *   JSON_OBJECT(k : v, …)      json or the RETURNING type, never NULL; json / jsonb with literal keys
 *                              is an object shape like json_build_object (plain JSON when a nullable
 *                              value can be left out by ABSENT ON NULL)
 *   JSON_ARRAY(v, …)           json or the RETURNING type, never NULL; a tuple shape like
 *                              json_build_array unless a nullable value can be skipped (the default)
 *   JSON_ARRAY(query)          the query's single column as an array (NULLs skipped); NULL for no rows
 *   JSON_ARRAYAGG / OBJECTAGG  json_agg[_strict] / json_object_agg[_strict] (jsonb_… for RETURNING
 *                              jsonb), so shapes and aggregate nullability follow those
 *   JSON_EXISTS                bool, nullable when the context item or path is, or UNKNOWN ON ERROR
 *   JSON_VALUE                 text or the RETURNING type, nullable (no item → NULL by default)
 *   JSON_QUERY                 jsonb or the RETURNING type, nullable
 *   v IS [NOT] JSON …          bool, nullable iff v is
 *   v FORMAT JSON              v as json (json / jsonb values keep their type)
 *
 * Inputs follow Postgres's checks: non-string types are rejected by IS JSON, JSON(),
 * FORMAT JSON and JSON_SERIALIZE's RETURNING; objects reject NULL and non-scalar keys.
 */
export type TypeSqlJson<E extends Expr, C extends Ctx> = E extends {
	readonly t: "jsonfmt";
}
	? TypeFormat<TypeOf<E["e"], C>>
	: E extends { readonly t: "isjson" }
		? TypeIsJson<TypeOf<E["e"], C>>
		: E extends { readonly t: "jsonagg" }
			? AggResult<TypeOf<E["e"], C>, E["ret"]>
			: TypeFn<E, C>;

/** Built-in types Postgres does not read JSON text from (it reports them; other types are string-like or unknown here). */
type NonString =
	| NumT
	| "bool"
	| DateTimeT
	| "interval"
	| "uuid"
	| "money"
	| "oid"
	| "record"
	| `${string}[]`
	| `${string}range`;

type TypeFormat<A> = A extends ColInfo
	? BaseOf<A["type"]> extends "json" | "jsonb"
		? A
		: A["type"] extends NonString
			? SqlError<
					"cannot use non-string types with explicit FORMAT JSON clause",
					null
				>
			: Info<"json", A["nullable"]>
	: A;

type TypeIsJson<A> = A extends ColInfo
	? A["type"] extends NonString
		? SqlError<
				`cannot use type ${TypeDisplay<A["type"]>} in IS JSON predicate`,
				null
			>
		: Info<"bool", A["nullable"]>
	: A;

/** A RETURNING type other than json / jsonb is a cast of the aggregate's value. */
type AggResult<A, Ret> = A extends ColInfo
	? Ret extends string
		? Ret extends "json" | "jsonb"
			? A
			: Info<Ret, A["nullable"]>
		: A
	: A;

type RetOr<R, D extends string> = R extends string ? R : D;

/** Type the arguments, PASSING values and DEFAULT expressions (errors), then the function. */
type TypeFn<E extends Expr, C extends Ctx> =
	TypeList<E["args"], C, []> extends infer As
		? As extends readonly ColInfo[]
			? TypeList<[...E["passing"], ...E["defaults"]], C, []> extends infer Ms
				? Ms extends readonly ColInfo[]
					? FnResult<E, As, C>
					: Ms
				: never
			: As
		: never;

type FnResult<
	E extends Expr,
	As extends readonly ColInfo[],
	C extends Ctx,
> = E["fn"] extends "json_value"
	? Info<RetOr<E["ret"], "text">, true>
	: E["fn"] extends "json_query"
		? Info<RetOr<E["ret"], "jsonb">, true>
		: E["fn"] extends "json_exists"
			? Info<
					"bool",
					Or<Or<As[0]["nullable"], As[1]["nullable"]>, E["unknownOnError"]>
				>
			: E["fn"] extends "json"
				? TypeParse<E["args"][0], As[0]>
				: E["fn"] extends "json_scalar"
					? Info<JsonRet<"val:json", As>, As[0]["nullable"]>
					: E["fn"] extends "json_serialize"
						? TypeSerialize<RetOr<E["ret"], "text">, As[0]>
						: E["fn"] extends "json_object"
							? TypeObject<RetOr<E["ret"], "json">, E["args"], As, E["absent"]>
							: E["q"] extends SelectStmt
								? TypeArrayQuery<RetOr<E["ret"], "json">, FirstColOf<E["q"], C>>
								: TypeArray<RetOr<E["ret"], "json">, As, E["absent"]>;

/** `JSON(v)`: text / bytea / json input; a JSON literal keeps its value (`JSON('[]')`). */
type TypeParse<V, A extends ColInfo> = A["type"] extends NonString
	? SqlError<`cannot cast type ${TypeDisplay<A["type"]>} to json`, null>
	: (
				V extends { readonly t: "jsonfmt"; readonly e: infer In }
					? In
					: V
			) extends { readonly t: "str"; readonly v: infer S extends string }
		? Info<
				JsonLitCast<"json", S> extends infer J extends string ? J : "json",
				A["nullable"]
			>
		: Info<"json", A["nullable"]>;

type TypeSerialize<R extends string, A extends ColInfo> = R extends
	| "json"
	| "jsonb"
	| NonString
	? SqlError<
			`cannot use type ${TypeDisplay<R>} in RETURNING clause of JSON_SERIALIZE()`,
			null
		>
	: Info<R, A["nullable"]>;

/** Object keys must be non-NULL scalars (`BuildObject` reports NULL literals). */
type CheckKeys<
	As extends readonly ColInfo[],
	I extends number,
> = As[I] extends ColInfo
	? As[I]["type"] extends "json" | "jsonb" | "record" | `${string}[]`
		? SqlError<"key value must be scalar, not array, composite, or json", null>
		: CheckKeys<As, Nx<Nx<I>>>
	: true;
/** Is a value (odd position) nullable? */
type NullableValue<
	As extends readonly ColInfo[],
	I extends number,
> = As[I] extends ColInfo
	? As[I]["nullable"] extends true
		? true
		: NullableValue<As, Nx<Nx<I>>>
	: false;

type TypeObject<
	R extends string,
	Args extends readonly Expr[],
	As extends readonly ColInfo[],
	Absent,
> =
	CheckKeys<As, 0> extends infer K
		? K extends AnyErr
			? K
			: BuildObject<
						R extends "jsonb" ? "jsonb" : "json",
						Args,
						As
					> extends infer O
				? O extends ColInfo
					? R extends "json" | "jsonb"
						? Absent extends true
							? NullableValue<As, 1> extends true
								? Info<R>
								: O
							: O
						: Info<R>
					: O
				: never
		: never;

type AnyNull<As extends readonly ColInfo[]> =
	As[number]["nullable"] extends false ? false : true;
type TypeArray<
	R extends string,
	As extends readonly ColInfo[],
	Absent,
> = R extends "json" | "jsonb"
	? Absent extends true
		? AnyNull<As> extends true
			? Info<R>
			: Info<JsonRet<`tup:${R}`, As>>
		: Info<JsonRet<`tup:${R}`, As>>
	: Info<R>;

/** `JSON_ARRAY(query)` is `(SELECT JSON_ARRAYAGG(col) FROM (query) q(col))`: NULL for no rows. */
type TypeArrayQuery<R extends string, A> = A extends ColInfo
	? Info<R extends "json" | "jsonb" ? JsonRet<`arrnn:${R}`, [A]> : R, true>
	: A;

// ───────────────────────────── parameters ─────────────────────────────

/**
 * `$n` in SQL/JSON syntax: values, keys, context items, paths and PASSING values are text
 * (Postgres coerces an unknown value to text); `FILTER (WHERE $n)` is bool. A DEFAULT … ON
 * EMPTY / ON ERROR is never a bare parameter (the parser rejects one, as Postgres does).
 */
export type ParamsOfSqlJson<E extends Expr, C extends Ctx, M> = E extends {
	readonly t: "jsonfmt" | "isjson";
}
	? ParamsOfOpt<E["e"], C, M, Info<"text", true>>
	: E extends { readonly t: "jsonagg" }
		? ParamsOfOpt<
				E["e"]["filter"],
				C,
				ParamsOfList<E["e"]["args"], C, M, Info<"text", true>>,
				Info<"bool", true>
			>
		: ParamsOfList<
				[...E["args"], ...E["passing"], ...E["defaults"]],
				C,
				E["q"] extends SelectStmt
					? ParamsOfSelect<E["q"], C["db"], C["scope"], C["ctes"], M>
					: M,
				Info<"text", true>
			>;

// ───────────────────────────── JSON_TABLE ─────────────────────────────

/**
 * Bind `JSON_TABLE(…) [alias [(cols)]]` (always lateral: it sees the FROM items before it).
 * The default alias is `json_table`. Column types come from the declarations (parser/json.ts).
 * Errors come in Postgres's order: a path that is not a string constant, a repeated name, the
 * context item, PASSING values and DEFAULTs, then the alias.
 */
export type BindJsonTable<
	J extends FromJsonTable["jt"],
	Alias extends string | null,
	CA extends readonly string[] | null,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = J["path"] extends { readonly t: "str" }
	? DuplicateName<J["names"], never> extends infer D
		? D extends string
			? SqlError<`duplicate JSON_TABLE column or path name: ${D}`, null>
			: TypeList<
						[J["ctx"], ...J["passing"], ...J["defs"]],
						MkCtx<DB, [Sofar, ...Outer], Ctes, false>,
						[]
					> extends infer Ts
				? Ts extends readonly ColInfo[]
					? CheckAlias<
							Alias extends string ? Alias : "json_table",
							Sofar
						> extends infer A
						? A extends string
							? (
									CA extends readonly string[]
										? RenameCols<J["cols"], CA, [], "JSON_TABLE function">
										: J["cols"]
								) extends infer C2
								? C2 extends Cols
									? [
											{
												readonly alias: A;
												readonly cols: ColsToMap<C2>;
												readonly skip: [];
											},
										]
									: C2
								: never
							: A
						: never
					: Ts
				: never
		: never
	: SqlError<
			"only string constants are supported in JSON_TABLE path specification",
			null
		>;
/** The first name that repeats an earlier one, or null. */
type DuplicateName<Ns extends readonly string[], Seen> = Ns extends readonly [
	infer N,
	...infer R extends readonly string[],
]
	? N extends Seen
		? N
		: DuplicateName<R, Seen | N>
	: null;

/** Parameters of a JSON_TABLE: the context item and PASSING values are text (the path is a string constant). */
export type ParamsOfJsonTable<
	J extends FromJsonTable["jt"],
	C extends Ctx,
	M,
> = ParamsOfList<
	[J["ctx"], ...J["passing"], ...J["defs"]],
	C,
	M,
	Info<"text", true>
>;
