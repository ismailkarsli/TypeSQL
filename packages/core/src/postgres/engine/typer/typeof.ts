import type { SqlError } from "../../../errors.js";
import type {
	Call,
	CaseWhen,
	Expr,
	NamedArg,
	SelectStmt,
	VariadicArg,
} from "../ast.js";
import type { TypeDisplay } from "../binder/clauses.js";
import type { ResolveColumn, WholeRow } from "../binder/resolve.js";
import type { BuildObject, JsonArrow, JsonLitCast, LitType } from "../json.js";
import type { Nx } from "../parser/util.js";
import type { NoSubscript } from "../project/dml.js";
import type { ProjectSelect } from "../project/select.js";
import type { BaseOf, ObjShape, Shaped } from "../shape.js";
import type { ColInfo, ColMap, Cols, Ctx, Info } from "../types.js";
import type { CallType } from "./catalog.js";
import type {
	BinOpType,
	CommonLit,
	LitToText,
	NumLitType,
	StrT,
	UnOpType,
} from "./operators.js";
import type { TypeSqlJson } from "./sqljson.js";
import type { TypeXml } from "./xml.js";

export type TypeOf<E extends Expr, C extends Ctx> = E extends {
	readonly t: "col";
}
	? ResolveColumn<C["scope"], E["tbl"], E["name"]>
	: E extends { readonly t: "num" }
		? Info<NumLitType<E["v"]>>
		: E extends { readonly t: "str" }
			? Info<"text">
			: E extends { readonly t: "bool" }
				? Info<"bool">
				: E extends { readonly t: "null" }
					? Info<"null", true>
					: E extends { readonly t: "param" }
						? Info<"unknown", true>
						: E extends { readonly t: "default" }
							? SqlError<"DEFAULT is not allowed in this context", null>
							: E extends { readonly t: "typed" }
								? Info<LitCast<E["type"], E["v"]>>
								: E extends { readonly t: "bin" }
									? TypeBin<E["op"], E["l"], E["r"], C>
									: E extends { readonly t: "un" }
										? TypeUn<E["op"], E["e"], C>
										: E extends { readonly t: "cast" }
											? E["e"] extends { readonly t: "param" }
												? Info<E["to"]>
												: E["e"] extends {
															readonly t: "str";
															readonly v: infer V extends string;
														}
													? Info<LitCast<E["to"], V>>
													: TypeCast<E["to"], E["e"], C>
											: E extends { readonly t: "call" }
												? TypeCall<Extract<E, Call>, C>
												: E extends { readonly t: "case" }
													? TypeCase<E["operand"], E["whens"], E["else"], C>
													: E extends { readonly t: "is" }
														? Check<TypeOf<E["e"], C>, Info<"bool">>
														: E extends { readonly t: "isdistinct" }
															? Check2<
																	TypeOf<E["l"], C>,
																	TypeOf<E["r"], C>,
																	Info<"bool">
																>
															: E extends { readonly t: "between" }
																? TypeBetween<E["e"], E["lo"], E["hi"], C>
																: E extends { readonly t: "in" }
																	? TypeIn<E["e"], E["list"], C>
																	: E extends { readonly t: "insub" }
																		? StrictBool<
																				TypeOf<E["e"], C>,
																				SubqueryOperand<E["e"], E["q"], C>
																			>
																		: E extends { readonly t: "like" }
																			? StrictBool<
																					TypeOf<E["e"], C>,
																					TypeOf<E["pat"], C>
																				>
																			: E extends {
																						readonly t: "quant";
																						readonly r: infer Q extends
																							SelectStmt;
																					}
																				? SubCompare<
																						E["op"],
																						E["l"],
																						Q,
																						C,
																						false
																					>
																				: E extends { readonly t: "quant" }
																					? TypeQuant<
																							E["op"],
																							TypeOf<E["l"], C>,
																							E["r"] extends Expr
																								? TypeOf<E["r"], C>
																								: never,
																							E["r"] extends {
																								readonly t: "str";
																							}
																								? "lit"
																								: "expr"
																						>
																					: E extends { readonly t: "sub" }
																						? MakeNullable<
																								FirstColOf<E["q"], C>
																							>
																						: E extends { readonly t: "exists" }
																							? ProjectSelect<
																									E["q"],
																									C["db"],
																									C["scope"],
																									C["ctes"]
																								> extends infer R
																								? R extends Cols
																									? Info<"bool">
																									: R
																								: never
																							: E extends {
																										readonly t: "array";
																									}
																								? TypeArrayCtor<E["items"], C>
																								: E extends {
																											readonly t: "arraysub";
																										}
																									? ArrayOf<
																											FirstColOf<E["q"], C>
																										>
																									: E extends {
																												readonly t: "row";
																											}
																										? TypeList<
																												E["items"],
																												C,
																												[]
																											> extends infer Ls
																											? Ls extends readonly ColInfo[]
																												? Info<"record">
																												: Ls
																											: never
																										: E extends {
																													readonly t: "idx";
																												}
																											? TypeIdx<
																													E["e"],
																													E["i"],
																													C
																												>
																											: E extends {
																														readonly t: "slice";
																													}
																												? TypeSlice<
																														E["e"],
																														E["lo"],
																														E["hi"],
																														C
																													>
																												: E extends {
																															readonly t: "extract";
																														}
																													? TypeExtract<
																															TypeOf<E["e"], C>,
																															Lowercase<
																																E["field"]
																															>
																														>
																													: E extends {
																																readonly t: "position";
																															}
																														? StrictOf<
																																TypeOf<
																																	E["sub"],
																																	C
																																>,
																																TypeOf<
																																	E["in"],
																																	C
																																>,
																																"int4"
																															>
																														: E extends {
																																	readonly t: "substring";
																																}
																															? RegexNull<
																																	StringResult<
																																		TypeOf<
																																			E["e"],
																																			C
																																		>,
																																		TypeOpt<
																																			E["from"],
																																			C
																																		>,
																																		TypeOpt<
																																			E["for"],
																																			C
																																		>
																																	>,
																																	TypeOpt<
																																		E["from"],
																																		C
																																	>
																																>
																															: E extends {
																																		readonly t: "trim";
																																	}
																																? StringResult<
																																		TypeOf<
																																			E["e"],
																																			C
																																		>,
																																		TypeOpt<
																																			E["chars"],
																																			C
																																		>,
																																		null
																																	>
																																: E extends {
																																			readonly t: "overlay";
																																		}
																																	? StringResult<
																																			StringResult<
																																				TypeOf<
																																					E["e"],
																																					C
																																				>,
																																				TypeOf<
																																					E["placing"],
																																					C
																																				>,
																																				TypeOf<
																																					E["from"],
																																					C
																																				>
																																			>,
																																			TypeOpt<
																																				E["for"],
																																				C
																																			>,
																																			null
																																		>
																																	: E extends {
																																				readonly t: "attz";
																																			}
																																		? TypeAtTz<
																																				TypeOf<
																																					E["e"],
																																					C
																																				>,
																																				TypeOf<
																																					E["zone"],
																																					C
																																				>
																																			>
																																		: E extends {
																																					readonly t: "collate";
																																				}
																																			? TypeOf<
																																					E["e"],
																																					C
																																				>
																																			: E extends {
																																						readonly t: "field";
																																					}
																																				? TypeField<
																																						TypeOf<
																																							E["e"],
																																							C
																																						>,
																																						E["name"]
																																					>
																																				: E extends {
																																							readonly t:
																																								| "jsonfn"
																																								| "jsonagg"
																																								| "isjson"
																																								| "jsonfmt";
																																						}
																																					? TypeSqlJson<
																																							E,
																																							C
																																						>
																																					: E extends {
																																								readonly t: "star";
																																							}
																																						? E["tbl"] extends string
																																							? WholeRow<
																																									C["scope"],
																																									E["tbl"],
																																									`missing FROM-clause entry for table "${E["tbl"]}"`
																																								>
																																							: SqlError<
																																									"* is only allowed in a target list or count(*)",
																																									null
																																								>
																																						: E extends {
																																									readonly t: "xml";
																																								}
																																							? TypeXml<
																																									E,
																																									C
																																								>
																																							: TypeOf<
																																									Extract<
																																										E,
																																										| NamedArg
																																										| VariadicArg
																																									>["e"],
																																									C
																																								>;

export type Or<A extends boolean, B extends boolean> = A extends true
	? true
	: B extends true
		? true
		: false;
export type AnyNullable<As extends readonly ColInfo[]> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? A["nullable"] extends true
		? true
		: AnyNullable<R>
	: false;
export type CommonOf<
	As extends readonly ColInfo[],
	Acc extends string,
> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? CommonOf<R, CommonLit<Acc, A["type"]>>
	: Acc;

type Check<A, R> = A extends ColInfo ? R : A;
type Check2<A, B, R> = A extends ColInfo ? (B extends ColInfo ? R : B) : A;
type StrictBool<A, B> = A extends ColInfo
	? B extends ColInfo
		? Info<"bool", Or<A["nullable"], B["nullable"]>>
		: B
	: A;
type StrictOf<A, B, T extends string> = A extends ColInfo
	? B extends ColInfo
		? Info<T, Or<A["nullable"], B["nullable"]>>
		: B
	: A;
type TypeExtract<A, F extends string> = A extends ColInfo
	? Info<"numeric", Or<A["nullable"], ExtractNull<A["type"], F>>>
	: A;
type ExtractNull<T, F> = T extends "timestamp" | "timestamptz" | "date"
	? F extends
			| "year"
			| "decade"
			| "century"
			| "millennium"
			| "julian"
			| "isoyear"
			| "epoch"
		? false
		: true
	: T extends "interval"
		? F extends
				| "year"
				| "decade"
				| "century"
				| "millennium"
				| "epoch"
				| "day"
				| "hour"
			? false
			: true
		: false;
type MakeNullable<A> = A extends ColInfo ? Info<A["type"], true> : A;
type ArrayOf<A> = A extends ColInfo
	? Info<A["type"] extends `${string}[]` ? A["type"] : `${A["type"]}[]`>
	: A;
type TypeField<A, N extends string> = A extends ColInfo
	? N extends "*"
		? SqlError<"(e).* is only supported in a target list", null>
		: A["type"] extends Shaped<"record", ObjShape<infer M>>
			? N extends keyof M
				? Info<M[N]["type"], Or<A["nullable"], M[N]["nullable"]>>
				: SqlError<`column "${N}" not found in data type record`, null>
			: Info<"unknown", true>
	: A;
type TypeOpt<E extends Expr | null, C extends Ctx> = E extends Expr
	? TypeOf<E, C>
	: null;
type NullableOpt<X> = X extends ColInfo ? X["nullable"] : false;

type TypeQuant<
	Op extends string,
	A,
	B,
	R extends "lit" | "expr",
> = A extends ColInfo
	? B extends ColInfo
		? R extends "expr"
			? B["type"] extends ScalarType
				? SqlError<"op ANY/ALL (array) requires array on right side", null>
				: QuantOp<Op, A, B>
			: QuantOp<Op, A, B>
		: B
	: A;
type QuantOp<
	Op extends string,
	A extends ColInfo,
	B extends ColInfo,
> = Op extends NonBoolOp
	? SqlError<"op ANY/ALL (array) requires operator to yield boolean", null>
	: Info<"bool", Or<A["nullable"], B["nullable"]>>;
type ScalarType =
	| "int2"
	| "int4"
	| "int8"
	| "numeric"
	| "float4"
	| "float8"
	| "bool"
	| "text"
	| "varchar"
	| "bpchar"
	| "date"
	| "time"
	| "timetz"
	| "timestamp"
	| "timestamptz"
	| "interval"
	| "uuid"
	| "bytea"
	| "json"
	| "jsonb";
type NonBoolOp = "+" | "-" | "*" | "/" | "%" | "^" | "||";

type StringResult<A, B, D> = A extends ColInfo
	? B extends ColInfo | null
		? D extends ColInfo | null
			? Info<
					A["type"] extends "bytea"
						? "bytea"
						: A["type"] extends "bit" | "varbit"
							? "bit"
							: "text",
					Or<A["nullable"], Or<NullableOpt<B>, NullableOpt<D>>>
				>
			: D
		: B
	: A;

type RegexNull<R, From> = R extends ColInfo
	? R["type"] extends "text"
		? From extends { readonly type: StrT | "unknown" }
			? Info<"text", true>
			: R
		: R
	: R;

type TypeBin<
	Op extends string,
	L extends Expr,
	R extends Expr,
	C extends Ctx,
> = L extends { readonly t: "row" }
	? R extends { readonly t: "sub"; readonly q: infer Q extends SelectStmt }
		? SubCompare<Op, L, Q, C, true>
		: TypeBinOperands<Op, L, R, C>
	: TypeBinOperands<Op, L, R, C>;
type SubCompare<
	Op extends string,
	L extends Expr,
	Q extends SelectStmt,
	C extends Ctx,
	Row extends boolean,
> =
	TypeOf<L, C> extends infer A
		? A extends ColInfo
			? SubqueryOperand<L, Q, C> extends infer B
				? B extends ColInfo
					? PairwiseOp<
							Op,
							L extends {
								readonly t: "row";
								readonly items: infer Items extends readonly Expr[];
							}
								? OperandList<Items, C, []>
								: [TypeOperand<L, C>],
							ProjectSelect<Q, C["db"], C["scope"], C["ctes"]>,
							0
						> extends infer X
						? X extends true
							? Info<
									"bool",
									Row extends true ? true : Or<A["nullable"], B["nullable"]>
								>
							: X
						: never
					: B
				: never
			: A
		: never;
type RowCompareOp = "=" | "<>" | "!=" | "<" | ">" | "<=" | ">=";
type PairwiseOp<
	Op extends string,
	Ls,
	Rs,
	I extends number,
> = Ls extends readonly [infer L extends ColInfo, ...infer LR]
	? Rs extends readonly [{ readonly t: infer R extends ColInfo }, ...infer RR]
		? BinOpType<Op, L, R>["type"] extends "bool" | "unknown"
			? PairwiseOp<Op, LR, RR, Nx<I>>
			: SqlError<
					`row comparison operator must yield type boolean, not type ${TypeDisplay<BinOpType<Op, L, R>["type"]>}`,
					null
				>
		: true
	: I extends 0 | 1
		? true
		: Op extends RowCompareOp
			? true
			: SqlError<
					`could not determine interpretation of row comparison operator ${Op}`,
					null
				>;
type TypeBinOperands<
	Op extends string,
	L extends Expr,
	R extends Expr,
	C extends Ctx,
> =
	TypeOperand<L, C> extends infer LT
		? LT extends ColInfo
			? TypeOperand<R, C> extends infer RT
				? RT extends ColInfo
					? Op extends "->" | "#>"
						? JsonArrow<Op, LT, R, RT> extends infer J extends ColInfo
							? J
							: BinOpType<Op, LT, RT>
						: BinOpType<Op, LT, RT>
					: RT
				: never
			: LT
		: never;
type TypeUn<Op extends string, E extends Expr, C extends Ctx> = Op extends
	| "-"
	| "+"
	? E extends { readonly t: "num"; readonly v: infer V extends string }
		? Info<NumLitType<Op extends "-" ? `-${V}` : V>>
		: TypeOf<E, C> extends infer T
			? T extends ColInfo
				? UnOpType<Op, T>
				: T
			: never
	: TypeOf<E, C> extends infer T
		? T extends ColInfo
			? UnOpType<Op, T>
			: T
		: never;
type TypeCast<To extends string, E extends Expr, C extends Ctx> = E extends {
	readonly t: "array";
	readonly items: infer Items;
}
	? To extends `${string}[]`
		? CastItems<Items, C> extends infer X
			? X extends true
				? Info<To>
				: X
			: never
		: TypeOfCast<To, E, C>
	: TypeOfCast<To, E, C>;
type CastItems<Items, C extends Ctx> = Items extends readonly [
	infer H extends Expr,
	...infer R,
]
	? (
			H extends { readonly t: "array"; readonly items: infer HI }
				? CastItems<HI, C>
				: Check<TypeOf<H, C>, true>
		) extends infer X
		? X extends true
			? CastItems<R, C>
			: X
		: never
	: true;
type TypeOfCast<To extends string, E extends Expr, C extends Ctx> =
	TypeOf<E, C> extends infer T
		? T extends ColInfo
			? Info<
					To extends "json" | "jsonb"
						? T["type"] extends Shaped<"json" | "jsonb", infer S>
							? Shaped<To, S>
							: To
						: To,
					T["nullable"]
				>
			: T
		: never;
type LitCast<To extends string, V extends string> = To extends "json" | "jsonb"
	? JsonLitCast<To, V> extends infer J extends string
		? J
		: To
	: To;
type TypeBetween<
	E extends Expr,
	Lo extends Expr,
	Hi extends Expr,
	C extends Ctx,
> =
	TypeOf<E, C> extends infer A
		? A extends ColInfo
			? TypeOf<Lo, C> extends infer B
				? B extends ColInfo
					? TypeOf<Hi, C> extends infer D
						? D extends ColInfo
							? Info<
									"bool",
									Or<A["nullable"], Or<B["nullable"], D["nullable"]>>
								>
							: D
						: never
					: B
				: never
			: A
		: never;
type TypeIn<E extends Expr, List extends readonly Expr[], C extends Ctx> =
	TypeOf<E, C> extends infer A
		? A extends ColInfo
			? TypeList<List, C, []> extends infer Ls
				? Ls extends readonly ColInfo[]
					? Info<"bool", Or<A["nullable"], AnyNullable<Ls>>>
					: Ls
				: never
			: A
		: never;
type TypeArrayCtor<
	Items extends readonly Expr[],
	C extends Ctx,
> = Items extends readonly [] ? EmptyArrayErr : TypeArrayItems<Items, C>;
type TypeArrayItems<Items extends readonly Expr[], C extends Ctx> =
	OperandList<Items, C, []> extends infer Ls
		? Ls extends readonly ColInfo[]
			? Info<ArrayTypeOf<LitToText<CommonOf<Ls, "unknown">>>>
			: Ls
		: never;
type EmptyArrayErr = SqlError<"cannot determine type of empty array", null>;
type ArrayTypeOf<T extends string> = T extends `${string}[]`
	? T
	: T extends "unknown" | "null"
		? "text[]"
		: `${T}[]`;
type TypeIdx<E extends Expr, I extends Expr, C extends Ctx> =
	TypeOf<E, C> extends infer A
		? A extends ColInfo
			? TypeOf<I, C> extends infer B
				? B extends ColInfo
					? ChainOverArray<E, C> extends `${infer El}[]`
						? ChainSliced<E> extends true
							? ChainNullable<E, C> extends infer N extends boolean
								? Info<`${El}[]`, Or<B["nullable"], N>>
								: never
							: Info<El, true>
						: BaseOf<A["type"]> extends NoSubscript | EnumName<C["db"]>
							? NoSubscriptErr<A["type"]>
							: JsonArrow<"->", A, I, B> extends infer J extends ColInfo
								? J
								: Info<
										BaseOf<A["type"]> extends keyof SubscriptElem
											? SubscriptElem[BaseOf<A["type"]>]
											: "unknown",
										true
									>
					: B
				: never
			: A
		: never;
type ChainOverArray<E extends Expr, C extends Ctx> =
	TypeOf<ChainRoot<E>, C> extends {
		readonly type: infer T extends `${string}[]`;
	}
		? T
		: null;
type ChainRoot<E extends Expr> = E extends {
	readonly t: "idx";
	readonly e: infer X extends Expr;
}
	? ChainRoot<X>
	: E;
type ChainNullable<E extends Expr, C extends Ctx> = E extends {
	readonly t: "idx";
	readonly e: infer X extends Expr;
	readonly i: infer I extends Expr;
}
	? TypeOf<I, C> extends infer T
		? NullableOpt<T> extends true
			? true
			: ChainNullable<X, C>
		: never
	: TypeOf<E, C> extends infer T
		? NullableOpt<T>
		: never;
type EnumName<DB> = DB extends { readonly $types: infer T } ? keyof T : never;
type ChainSliced<E> = E extends { readonly t: "slice" }
	? true
	: E extends { readonly t: "idx"; readonly e: infer X }
		? ChainSliced<X>
		: false;
type SubscriptElem = {
	jsonb: "jsonb";
	point: "float8";
	line: "float8";
	lseg: "point";
	box: "point";
	name: "char";
};
type NoSubscriptErr<T extends string> = SqlError<
	`cannot subscript type ${TypeDisplay<T>} because it does not support subscripting`,
	null
>;
type TypeSlice<
	E extends Expr,
	Lo extends Expr | null,
	Hi extends Expr | null,
	C extends Ctx,
> =
	TypeOf<E, C> extends infer A
		? A extends ColInfo
			? TypeOpt<Lo, C> extends infer B
				? B extends ColInfo | null
					? TypeOpt<Hi, C> extends infer D
						? D extends ColInfo | null
							? ChainOverArray<E, C> extends infer R extends string
								? ChainNullable<E, C> extends infer N extends boolean
									? Info<R, Or<Or<NullableOpt<B>, NullableOpt<D>>, N>>
									: never
								: BaseOf<A["type"]> extends NoSubscript | EnumName<C["db"]>
									? NoSubscriptErr<A["type"]>
									: BaseOf<A["type"]> extends "jsonb"
										? SqlError<"jsonb subscript does not support slices", null>
										: BaseOf<A["type"]> extends keyof SubscriptElem
											? SqlError<
													"slices of fixed-length arrays not implemented",
													null
												>
											: Info<
													A["type"],
													Or<A["nullable"], Or<NullableOpt<B>, NullableOpt<D>>>
												>
							: D
						: never
					: B
				: never
			: A
		: never;
type TypeAtTz<A, B> = A extends ColInfo
	? B extends ColInfo
		? Info<
				A["type"] extends "timestamp"
					? "timestamptz"
					: A["type"] extends "time" | "timetz"
						? "timetz"
						: "timestamp",
				Or<A["nullable"], B["nullable"]>
			>
		: B
	: A;

export type TypeList<
	Es extends readonly Expr[],
	C extends Ctx,
	Acc extends readonly ColInfo[],
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? TypeOf<E, C> extends infer T
		? T extends ColInfo
			? TypeList<R, C, [...Acc, T]>
			: T
		: never
	: Acc;

type TypeOperand<E extends Expr, C extends Ctx> = E extends {
	readonly t: "str";
}
	? Info<LitType<E["v"]>>
	: TypeOf<E, C>;
type OperandList<
	Es extends readonly Expr[],
	C extends Ctx,
	Acc extends readonly ColInfo[],
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? TypeOperand<E, C> extends infer T
		? T extends ColInfo
			? OperandList<R, C, [...Acc, T]>
			: T
		: never
	: Acc;

export type FirstColOf<
	Q extends SelectStmt,
	C extends Ctx,
	TooMany extends string = "subquery must return only one column",
> =
	ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
		? R extends Cols
			? OnlyCol<R, TooMany>
			: R
		: never;

type SubqueryOperand<
	L extends Expr,
	Q extends SelectStmt,
	C extends Ctx,
> = L extends {
	readonly t: "row";
	readonly items: infer Items extends readonly unknown[];
}
	? ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
		? R extends Cols
			? HasStarEntry<R> extends true
				? Info<"record">
				: R["length"] extends Items["length"]
					? Info<"record">
					: IsLonger<R, Items> extends true
						? SqlError<"subquery has too many columns", null>
						: SqlError<"subquery has too few columns", null>
			: R
		: never
	: FirstColOf<Q, C, "subquery has too many columns">;
type HasStarEntry<R extends Cols> = R extends readonly [
	infer H,
	...infer Rest extends Cols,
]
	? H extends { readonly star: unknown }
		? true
		: HasStarEntry<Rest>
	: false;
type IsLonger<
	A extends readonly unknown[],
	B extends readonly unknown[],
> = A extends readonly [unknown, ...infer AR]
	? B extends readonly [unknown, ...infer BR]
		? IsLonger<AR, BR>
		: true
	: false;

type OnlyCol<R extends Cols, TooMany extends string> = R extends readonly [
	infer H,
]
	? H extends { readonly t: infer T }
		? T
		: StarCol<Extract<H, { readonly star: ColMap }>["star"], TooMany>
	: R extends readonly []
		? SqlError<TooFew<TooMany>, null>
		: SqlError<TooMany, null>;
type TooFew<TooMany extends string> =
	TooMany extends "subquery has too many columns"
		? "subquery has too few columns"
		: TooMany;
type StarCol<M extends ColMap, TooMany extends string> = [keyof M] extends [
	never,
]
	? SqlError<TooFew<TooMany>, null>
	: IsUnion<keyof M> extends true
		? SqlError<TooMany, null>
		: M[keyof M];
type IsUnion<U> = [U] extends [UnionToIntersection<U>] ? false : true;
type UnionToIntersection<U> = (
	U extends unknown
		? (u: U) => void
		: never
) extends (u: infer I) => void
	? I
	: never;

type TypeCase<
	Operand extends Expr | null,
	Whens extends readonly CaseWhen[],
	Else extends Expr | null,
	C extends Ctx,
> = (Operand extends Expr ? TypeOf<Operand, C> : Info<"bool">) extends infer OT
	? OT extends ColInfo
		? (
				Else extends Expr
					? TypeOperand<Else, C>
					: Info<"null", true>
			) extends infer ET
			? ET extends ColInfo
				? TypeWhens<Whens, C, ET["type"], ET["nullable"]> extends infer W
					? W extends readonly [infer T extends string, infer N extends boolean]
						? Info<LitToText<T>, N>
						: W
					: never
				: ET
			: never
		: OT
	: never;
type TypeWhens<
	Whens extends readonly CaseWhen[],
	C extends Ctx,
	T extends string,
	N extends boolean,
> = Whens extends readonly [
	infer W extends CaseWhen,
	...infer R extends readonly CaseWhen[],
]
	? TypeOf<W["when"], C> extends infer WT
		? WT extends ColInfo
			? TypeOperand<W["then"], C> extends infer TT
				? TT extends ColInfo
					? TypeWhens<R, C, CommonLit<T, TT["type"]>, Or<N, TT["nullable"]>>
					: TT
				: never
			: WT
		: never
	: readonly [T, N];

type TypeWithinGroup<W extends Expr | null, C extends Ctx> = W extends {
	readonly t: "row";
	readonly items: infer Items extends readonly Expr[];
}
	? TypeList<Items, C, []> extends infer Ls
		? Ls extends readonly [infer F, ...ColInfo[]]
			? F
			: Ls
		: never
	: TypeOpt<W, C>;

type NonStarArgs<Args extends readonly Expr[]> = Args extends readonly [
	{ readonly t: "star"; readonly tbl: null },
]
	? []
	: Args;

type VariadicNull<
	E extends Call,
	As extends readonly ColInfo[],
	R,
> = E["name"] extends "concat" | "concat_ws"
	? R extends ColInfo
		? E["args"] extends readonly [...unknown[], { readonly t: "variadic" }]
			? As extends readonly [...unknown[], { readonly nullable: true }]
				? Info<R["type"], true>
				: R
			: R
		: R
	: R;

type TypeCall<E extends Call, C extends Ctx> =
	OperandList<NonStarArgs<E["args"]>, C, []> extends infer As
		? As extends readonly ColInfo[]
			? E["name"] extends "json_build_object" | "jsonb_build_object"
				? BuildObject<
						E["name"] extends "jsonb_build_object" ? "jsonb" : "json",
						E["args"],
						As
					>
				: TypeOpt<E["filter"], C> extends infer F
					? F extends ColInfo | null
						? TypeWithinGroup<E["withinGroup"], C> extends infer W
							? W extends ColInfo | null
								? VariadicNull<
										E,
										As,
										CallType<
											E["name"],
											As,
											{
												readonly grouped: C["grouped"];
												readonly over: E["over"];
												readonly filter: F extends ColInfo ? true : false;
												readonly distinct: E["distinct"];
												readonly hasStar: E["args"] extends readonly [
													{ readonly t: "star"; readonly tbl: null },
												]
													? true
													: false;
												readonly withinGroup: W extends ColInfo ? true : false;
												readonly wg: W extends ColInfo ? W["type"] : "unknown";
											},
											C["db"]
										>
									>
								: W
							: never
						: F
					: never
			: As
		: never;
