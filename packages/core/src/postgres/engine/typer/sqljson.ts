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
} from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Expr, FromJsonTable, SelectStmt } from "../ast.js";
import type { TypeDisplay } from "../binder/clauses.js";
import type { CheckAlias, RenameCols } from "../binder/from.js";
import type { BuildObject, JsonLitCast, JsonRet } from "../json.js";
import type { Nx } from "../parser/util.js";
import type { BaseOf } from "../shape.js";
import type { DateTimeT, NumT } from "./operators.js";
import type { ParamsOfList, ParamsOfOpt, ParamsOfSelect } from "./params.js";
import type { FirstColOf, Or, TypeList, TypeOf } from "./typeof.js";

export type TypeSqlJson<E extends Expr, C extends Ctx> = E extends TagJsonfmt
	? TypeFormat<TypeOf<E["e"], C>>
	: E extends TagIsjson
		? TypeIsJson<TypeOf<E["e"], C>>
		: E extends TagJsonagg
			? AggResult<TypeOf<E["e"], C>, E["ret"]>
			: TypeFn<E, C>;

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

type AggResult<A, Ret> = A extends ColInfo
	? Ret extends string
		? Ret extends "json" | "jsonb"
			? A
			: Info<Ret, A["nullable"]>
		: A
	: A;

type RetOr<R, D extends string> = R extends string ? R : D;

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

type CheckKeys<
	As extends readonly ColInfo[],
	I extends number,
> = As[I] extends ColInfo
	? As[I]["type"] extends "json" | "jsonb" | "record" | `${string}[]`
		? SqlError<"key value must be scalar, not array, composite, or json", null>
		: CheckKeys<As, Nx<Nx<I>>>
	: true;
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

type TypeArrayQuery<R extends string, A> = A extends ColInfo
	? Info<R extends "json" | "jsonb" ? JsonRet<`arrnn:${R}`, [A]> : R, true>
	: A;

export type ParamsOfSqlJson<
	E extends Expr,
	C extends Ctx,
	M,
> = E extends TagJsonfmtIsjson
	? ParamsOfOpt<E["e"], C, M, Info<"text", true>>
	: E extends TagJsonagg
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

export type BindJsonTable<
	J extends FromJsonTable["jt"],
	Alias extends string | null,
	CA extends readonly string[] | null,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = J["path"] extends TagStr
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
type DuplicateName<Ns extends readonly string[], Seen> = Ns extends readonly [
	infer N,
	...infer R extends readonly string[],
]
	? N extends Seen
		? N
		: DuplicateName<R, Seen | N>
	: null;

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

type TagJsonfmt = { readonly t: "jsonfmt" };
type TagIsjson = { readonly t: "isjson" };
type TagJsonagg = { readonly t: "jsonagg" };
type TagJsonfmtIsjson = { readonly t: "jsonfmt" | "isjson" };
type TagStr = { readonly t: "str" };
