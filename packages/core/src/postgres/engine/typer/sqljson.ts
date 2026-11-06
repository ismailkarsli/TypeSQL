import type { Next } from "../../../engine/next.js";
import type { Or } from "../../../engine/object.js";
import type { ColInfo, Info } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { DateTimeT, JsonT, NumT } from "../../schema/type-facts.js";
import type {
	Expr,
	FromJsonTable,
	IsJson,
	JsonAgg,
	JsonFn,
	JsonFormat,
	SelectStmt,
	Tag,
} from "../ast.js";
import type { BuildObject, JsonLitCast, JsonRet } from "../json.js";
import type { BaseOf, TypeDisplay } from "../shape.js";
import type { Ctx } from "../types.js";
import type { ParamsOfList, ParamsOfOpt, ParamsOfSelect } from "./params.js";
import type { FirstColOf, TypeList, TypeOf } from "./typeof.js";

export type SqlJsonExpr = JsonFormat | IsJson | JsonAgg | JsonFn;

export type TypeSqlJson<E extends SqlJsonExpr, C extends Ctx> =
	E extends Tag<"jsonfmt">
		? TypeFormat<TypeOf<E["e"], C>>
		: E extends Tag<"isjson">
			? TypeIsJson<TypeOf<E["e"], C>>
			: E extends Tag<"jsonagg">
				? AggResult<TypeOf<E["e"], C>, E["ret"]>
				: TypeFn<Extract<E, JsonFn>, C>;

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
	? BaseOf<A["type"]> extends JsonT
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
		? Ret extends JsonT
			? A
			: Info<Ret, A["nullable"]>
		: A
	: A;

type RetOr<R, D extends string> = R extends string ? R : D;

type TypeFn<E extends JsonFn, C extends Ctx> =
	TypeList<E["args"], C, []> extends infer As extends readonly ColInfo[]
		? TypeList<
				[...E["passing"], ...E["defaults"]],
				C,
				[]
			> extends readonly ColInfo[]
			? FnResult<E, As, C>
			: TypeList<[...E["passing"], ...E["defaults"]], C, []>
		: TypeList<E["args"], C, []>;

type FnResult<
	E extends JsonFn,
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
	? As[I]["type"] extends JsonT | "record" | `${string}[]`
		? SqlError<"key value must be scalar, not array, composite, or json", null>
		: CheckKeys<As, Next<Next<I>>>
	: true;
type NullableValue<
	As extends readonly ColInfo[],
	I extends number,
> = As[I] extends ColInfo
	? As[I]["nullable"] extends true
		? true
		: NullableValue<As, Next<Next<I>>>
	: false;

type TypeObject<
	R extends string,
	Args extends readonly Expr[],
	As extends readonly ColInfo[],
	Absent,
> =
	CheckKeys<As, 0> extends AnyErr
		? CheckKeys<As, 0>
		: BuildObject<
					R extends "jsonb" ? "jsonb" : "json",
					Args,
					As
				> extends infer O
			? O extends ColInfo
				? R extends JsonT
					? Absent extends true
						? NullableValue<As, 1> extends true
							? Info<R>
							: O
						: O
					: Info<R>
				: O
			: never;

type AnyNull<As extends readonly ColInfo[]> =
	As[number]["nullable"] extends false ? false : true;
type TypeArray<
	R extends string,
	As extends readonly ColInfo[],
	Absent,
> = R extends JsonT
	? Absent extends true
		? AnyNull<As> extends true
			? Info<R>
			: Info<JsonRet<`tup:${R}`, As>>
		: Info<JsonRet<`tup:${R}`, As>>
	: Info<R>;

type TypeArrayQuery<R extends string, A> = A extends ColInfo
	? Info<R extends JsonT ? JsonRet<`arrnn:${R}`, [A]> : R, true>
	: A;

export type ParamsOfSqlJson<E extends SqlJsonExpr, C extends Ctx> =
	E extends Tag<"jsonfmt" | "isjson">
		? ParamsOfOpt<E["e"], C, Info<"text", true>>
		: E extends Tag<"jsonagg">
			?
					| ParamsOfList<E["e"]["args"], C, Info<"text", true>>
					| ParamsOfOpt<E["e"]["filter"], C, Info<"bool", true>>
			: ParamsOfJsonFn<Extract<E, JsonFn>, C>;

type ParamsOfJsonFn<E extends JsonFn, C extends Ctx> =
	| (E["q"] extends SelectStmt ? ParamsOfSelect<E["q"], C> : never)
	| ParamsOfList<
			[...E["args"], ...E["passing"], ...E["defaults"]],
			C,
			Info<"text", true>
	  >;

export type ParamsOfJsonTable<
	J extends FromJsonTable["jt"],
	C extends Ctx,
> = ParamsOfList<
	[J["ctx"], ...J["passing"], ...J["defs"]],
	C,
	Info<"text", true>
>;
