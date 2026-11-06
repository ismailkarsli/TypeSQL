import type { NarrowKeys, NarrowLevel } from "../../../engine/narrow.js";
import type { Next } from "../../../engine/next.js";
import type { IsUnion, Or } from "../../../engine/object.js";
import type {
	ColInfo,
	ColMap,
	Cols,
	Info,
	Scope,
	ScopeLevel,
} from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type {
	JsonT,
	KnownType,
	StrT,
	TypeFact,
} from "../../schema/type-facts.js";
import type {
	Call,
	CaseWhen,
	Expr,
	NamedArg,
	SelectStmt,
	Tag,
	VariadicArg,
	XmlExpr,
} from "../ast.js";
import type { HasStar } from "../binder/clauses.js";
import type { ResolveColumn, WholeRow } from "../binder/resolve.js";
import type { SchemaTypes } from "../db.js";
import type { BuildObject, JsonArrow, JsonLitCast, LitType } from "../json.js";
import type { NumLitType } from "../literals.js";
import type { CompareOp, JsonGetOp, NonBoolOp } from "../ops.js";
import type { ProjectSelect } from "../project/select.js";
import type {
	ArrInfo,
	BaseOf,
	ElemNull,
	HasNullElems,
	LitToText,
	ObjShape,
	Shaped,
	TypeDisplay,
} from "../shape.js";
import type { Ctx, MkCtx } from "../types.js";
import type { WidthCheck } from "../util.js";
import type { AnyNullable, CallType, CommonOf } from "./catalog.js";
import type {
	BinOpType,
	SelectCommon,
	Unmatchable,
	UnmatchedErr,
	UnOpType,
} from "./operators.js";
import type { SqlJsonExpr, TypeSqlJson } from "./sqljson.js";
import type { TypeXml } from "./xml.js";

export type TypeOf<E extends Expr, C extends Ctx> =
	E extends Tag<"col">
		? ResolveColumn<C["scope"], E["tbl"], E["name"]>
		: E extends Tag<"bin">
			? TypeBin<E["op"], E["l"], E["r"], C>
			: E extends Tag<"call">
				? TypeCall<Extract<E, Call>, C>
				: E extends Tag<"num">
					? Info<NumLitType<E["v"]>>
					: E extends Tag<"str">
						? Info<"text">
						: E extends Tag<"bool">
							? Info<"bool">
							: E extends Tag<"null">
								? Info<"null", true>
								: E extends Tag<"param">
									? Info<"unknown", true>
									: E extends Tag<"default">
										? SqlError<"DEFAULT is not allowed in this context", null>
										: E extends Tag<"typed">
											? Info<LitCast<E["type"], E["v"]>>
											: E extends Tag<"un">
												? TypeUn<E["op"], E["e"], C>
												: E extends Tag<"cast">
													? E["e"] extends {
															readonly t: "param";
															readonly n: infer N;
														}
														? ArrInfo<E["to"], ParamNullable<C["db"], N>, true>
														: E["e"] extends {
																	readonly t: "str";
																	readonly v: infer V extends string;
																}
															? Info<LitCast<E["to"], V>>
															: TypeCast<E["to"], E["e"], C>
													: E extends Tag<"case">
														? TypeCase<E["operand"], E["whens"], E["else"], C>
														: TypeOfMore<E, C>;
type TypeOfMore<E extends Expr, C extends Ctx> =
	E extends Tag<"is">
		? Check<TypeOf<E["e"], C>, Info<"bool">>
		: E extends Tag<"isdistinct">
			? Comparable<TypeOperand<E["l"], C>, TypeOperand<E["r"], C>>
			: E extends Tag<"between">
				? TypeBetween<E["e"], E["lo"], E["hi"], C>
				: E extends Tag<"in">
					? TypeIn<E["e"], E["list"], C>
					: E extends Tag<"insub">
						? SubCompare<"=", E["e"], E["q"], C, false>
						: E extends Tag<"like">
							? StrictOf<TypeOf<E["e"], C>, TypeOf<E["pat"], C>, "bool">
							: E extends {
										readonly t: "quant";
										readonly r: infer Q extends SelectStmt;
									}
								? SubCompare<E["op"], E["l"], Q, C, false>
								: E extends Tag<"quant">
									? TypeQuant<
											E["op"],
											TypeOf<E["l"], C>,
											E["r"] extends Expr ? TypeOf<E["r"], C> : never,
											E["r"] extends Tag<"str"> ? "lit" : "expr"
										>
									: E extends Tag<"sub">
										? MakeNullable<FirstColOf<E["q"], C>>
										: E extends Tag<"exists">
											? ProjectSelect<E["q"], C> extends infer R
												? R extends Cols
													? Info<"bool">
													: R
												: never
											: E extends Tag<"array">
												? TypeArrayCtor<E["items"], C>
												: E extends Tag<"arraysub">
													? ArrayOf<FirstColOf<E["q"], C>>
													: E extends Tag<"row">
														? TypeList<
																E["items"],
																C,
																[]
															> extends readonly ColInfo[]
															? Info<"record">
															: TypeList<E["items"], C, []>
														: TypeOfRest<E, C>;
type TypeOfRest<E extends Expr, C extends Ctx> =
	E extends Tag<"idx">
		? TypeIdx<E["e"], E["i"], C>
		: E extends Tag<"slice">
			? TypeSlice<E["e"], E["lo"], E["hi"], C>
			: E extends Tag<"extract">
				? TypeExtract<TypeOf<E["e"], C>, Lowercase<E["field"]>>
				: E extends Tag<"position">
					? StrictOf<TypeOf<E["sub"], C>, TypeOf<E["in"], C>, "int4">
					: E extends Tag<"substring">
						? RegexNull<
								StringResult<
									TypeOf<E["e"], C>,
									TypeOpt<E["from"], C>,
									TypeOpt<E["for"], C>
								>,
								TypeOpt<E["from"], C>
							>
						: E extends Tag<"trim">
							? StringResult<TypeOf<E["e"], C>, TypeOpt<E["chars"], C>, null>
							: E extends Tag<"overlay">
								? StringResult<
										StringResult<
											TypeOf<E["e"], C>,
											TypeOf<E["placing"], C>,
											TypeOf<E["from"], C>
										>,
										TypeOpt<E["for"], C>,
										null
									>
								: E extends Tag<"attz">
									? TypeAtTz<TypeOf<E["e"], C>, TypeOf<E["zone"], C>>
									: E extends Tag<"collate">
										? TypeOf<E["e"], C>
										: E extends Tag<"field">
											? TypeField<TypeOf<E["e"], C>, E["name"]>
											: E extends Tag<
														"jsonfn" | "jsonagg" | "isjson" | "jsonfmt"
													>
												? TypeSqlJson<Extract<E, SqlJsonExpr>, C>
												: E extends Tag<"star">
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
													: E extends Tag<"xml">
														? TypeXml<Extract<E, XmlExpr>, C>
														: TypeOf<
																Extract<E, NamedArg | VariadicArg>["e"],
																C
															>;

type Check<A, R> = A extends ColInfo ? R : A;
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
type MakeNullable<A> = A extends ColInfo
	? ArrInfo<A["type"], true, HasNullElems<A>>
	: A;
/** ARRAY(subquery): a NULL row is a NULL element; NULL arrays are rejected. */
type ArrayOf<A> = A extends ColInfo
	? ArrInfo<
			A["type"] extends `${string}[]` ? A["type"] : `${A["type"]}[]`,
			false,
			ElemNull<A>
		>
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
			? B["type"] extends KnownType
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
	: Info<"bool", Or<Or<A["nullable"], B["nullable"]>, HasNullElems<B>>>;

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

type TypeBin<Op extends string, L extends Expr, R extends Expr, C extends Ctx> =
	L extends Tag<"row">
		? R extends { readonly t: "sub"; readonly q: infer Q extends SelectStmt }
			? SubCompare<Op, L, Q, C, true>
			: R extends Tag<"row">
				? RowPairs<Op, L["items"], R["items"], C> extends infer Err extends
						AnyErr
					? Err
					: TypeBinOperands<Op, L, R, C>
				: TypeBinOperands<Op, L, R, C>
		: TypeBinOperands<Op, L, R, C>;
/** `(a, b) = (c, d)` compares each pair with the operator. */
type RowPairs<
	Op extends string,
	Ls extends readonly Expr[],
	Rs extends readonly Expr[],
	C extends Ctx,
> =
	TypeList<Ls, C, [], true> extends infer A extends readonly ColInfo[]
		? TypeList<Rs, C, [], true> extends infer B extends readonly ColInfo[]
			? NoComparePairs<Op, A, B>
			: null
		: null;
type NoComparePairs<
	Op extends string,
	A extends readonly ColInfo[],
	B extends readonly ColInfo[],
> = A extends readonly [
	infer L extends ColInfo,
	...infer AR extends readonly ColInfo[],
]
	? B extends readonly [
			infer R extends ColInfo,
			...infer BR extends readonly ColInfo[],
		]
		? NoCompare<Op, L["type"], R["type"]> extends infer Err extends AnyErr
			? Err
			: NoComparePairs<Op, AR, BR>
		: null
	: null;
type SubCompare<
	Op extends string,
	L extends Expr,
	Q extends SelectStmt,
	C extends Ctx,
	Row extends boolean,
> =
	TypeOf<L, C> extends infer A extends ColInfo
		? SubqueryOperand<L, Q, C> extends infer B extends ColInfo
			? PairwiseOp<
					Op,
					L extends {
						readonly t: "row";
						readonly items: infer Items extends readonly Expr[];
					}
						? TypeList<Items, C, [], true>
						: [TypeOperand<L, C>],
					ProjectSelect<Q, C>,
					0
				> extends infer X
				? X extends true
					? Info<
							"bool",
							Row extends true ? true : Or<A["nullable"], B["nullable"]>
						>
					: X
				: never
			: SubqueryOperand<L, Q, C>
		: TypeOf<L, C>;
type PairwiseOp<
	Op extends string,
	Ls,
	Rs,
	I extends number,
> = Ls extends readonly [infer L extends ColInfo, ...infer LR]
	? Rs extends readonly [{ readonly t: infer R extends ColInfo }, ...infer RR]
		? NoCompare<Op, L["type"], R["type"]> extends infer Err extends AnyErr
			? Err
			: BinOpType<Op, L, R>["type"] extends "bool" | "unknown"
				? PairwiseOp<Op, LR, RR, Next<I>>
				: SqlError<
						`row comparison operator must yield type boolean, not type ${TypeDisplay<BinOpType<Op, L, R>["type"]>}`,
						null
					>
		: true
	: I extends 0 | 1
		? true
		: Op extends CompareOp
			? true
			: SqlError<
					`could not determine interpretation of row comparison operator ${Op}`,
					null
				>;
/**
 * PostgreSQL has no comparison operator between two of the categories that
 * never share a common type, and casts neither side to the other implicitly.
 */
type NoCompare<
	Op extends string,
	L extends string,
	R extends string,
> = Op extends CompareOp
	? Unmatchable<L, R> extends true
		? SqlError<
				`operator does not exist: ${TypeDisplay<L>} ${Op extends "!=" ? "<>" : Op} ${TypeDisplay<R>}`,
				null
			>
		: null
	: null;
/** `IS DISTINCT FROM` compares with `=`, and is never NULL. */
type Comparable<A, B> = A extends ColInfo
	? B extends ColInfo
		? NoCompare<"=", A["type"], B["type"]> extends infer Err extends AnyErr
			? Err
			: Info<"bool">
		: B
	: A;
type NoCompareList<
	L extends string,
	Rs extends readonly ColInfo[],
> = Rs extends readonly [
	infer R extends ColInfo,
	...infer Rest extends readonly ColInfo[],
]
	? NoCompare<"=", L, R["type"]> extends infer Err extends AnyErr
		? Err
		: NoCompareList<L, Rest>
	: null;
type TypeBinOperands<
	Op extends string,
	L extends Expr,
	R extends Expr,
	C extends Ctx,
> =
	TypeOperand<L, C> extends infer LT extends ColInfo
		? TypeOperand<R, C> extends infer RT extends ColInfo
			? NoCompare<Op, LT["type"], RT["type"]> extends infer Err extends AnyErr
				? Err
				: Op extends JsonGetOp
					? JsonArrow<Op, LT, R, RT> extends infer J extends ColInfo
						? J
						: BinOpType<Op, LT, RT>
					: BinOpType<Op, LT, RT>
			: TypeOperand<R, C>
		: TypeOperand<L, C>;
type TypeUn<Op extends string, E extends Expr, C extends Ctx> = [
	Op,
	E,
] extends ["-" | "+", { readonly t: "num"; readonly v: infer V extends string }]
	? Info<NumLitType<Op extends "-" ? `-${V}` : V>>
	: TypeOf<E, C> extends infer T extends ColInfo
		? UnOpType<Op, T>
		: TypeOf<E, C>;
type TypeCast<To extends string, E extends Expr, C extends Ctx> = E extends {
	readonly t: "array";
	readonly items: infer Items;
}
	? To extends `${string}[]`
		? CastItems<Items, C> extends true
			? ArrInfo<To, false, CastItemsNull<Items, C>>
			: CastItems<Items, C>
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
type CastItemsNull<Items, C extends Ctx> = Items extends readonly Expr[]
	? TypeList<Items, C, [], true> extends infer Ls extends readonly ColInfo[]
		? AnyElemNull<Ls>
		: false
	: false;
type TypeOfCast<To extends string, E extends Expr, C extends Ctx> =
	TypeOf<E, C> extends infer T extends ColInfo
		? ArrInfo<
				To extends JsonT
					? T["type"] extends Shaped<JsonT, infer S>
						? Shaped<To, S>
						: To
					: To,
				T["nullable"],
				HasNullElems<T>
			>
		: TypeOf<E, C>;
type LitCast<To extends string, V extends string> = To extends JsonT
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
	TypeOf<E, C> extends infer A extends ColInfo
		? TypeOf<Lo, C> extends infer B extends ColInfo
			? TypeOf<Hi, C> extends infer D extends ColInfo
				? Info<"bool", Or<A["nullable"], Or<B["nullable"], D["nullable"]>>>
				: TypeOf<Hi, C>
			: TypeOf<Lo, C>
		: TypeOf<E, C>;
type TypeIn<E extends Expr, List extends readonly Expr[], C extends Ctx> =
	TypeOperand<E, C> extends infer A extends ColInfo
		? TypeList<List, C, [], true> extends infer Ls extends readonly ColInfo[]
			? NoCompareList<A["type"], Ls> extends infer Err extends AnyErr
				? Err
				: Info<"bool", Or<A["nullable"], AnyNullable<Ls>>>
			: TypeList<List, C, [], true>
		: TypeOperand<E, C>;
type TypeArrayCtor<
	Items extends readonly Expr[],
	C extends Ctx,
> = Items extends readonly [] ? EmptyArrayErr : TypeArrayItems<Items, C>;
type TypeArrayItems<Items extends readonly Expr[], C extends Ctx> =
	TypeList<Items, C, [], true> extends infer Ls extends readonly ColInfo[]
		? CommonOf<Ls> extends infer T extends string
			? ArrInfo<ArrayTypeOf<T>, false, AnyElemNull<Ls>>
			: UnmatchedErr<"ARRAY", CommonOf<Ls>>
		: TypeList<Items, C, [], true>;
/** A NULL item is a NULL element; a NULL sub-array adds no elements. */
type AnyElemNull<Ls extends readonly ColInfo[]> = Ls extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? ElemNull<A> extends true
		? true
		: AnyElemNull<R>
	: false;
type EmptyArrayErr = SqlError<"cannot determine type of empty array", null>;
type ArrayTypeOf<T extends string> = T extends `${string}[]`
	? T
	: T extends "unknown" | "null"
		? "text[]"
		: `${T}[]`;
type TypeIdx<E extends Expr, I extends Expr, C extends Ctx> =
	TypeOf<E, C> extends infer A extends ColInfo
		? TypeOf<I, C> extends infer B extends ColInfo
			? ChainOverArray<E, C> extends `${infer El}[]`
				? ChainSliced<E> extends true
					? ChainNullable<E, C> extends infer N extends boolean
						? ArrInfo<`${El}[]`, Or<B["nullable"], N>, HasNullElems<A>>
						: never
					: Info<El, true>
				: SubscriptOf<A["type"], C["db"]> extends infer E
					? E extends AnyErr
						? E
						: JsonArrow<"->", A, I, B> extends infer J extends ColInfo
							? J
							: Info<E extends string ? E : "unknown", true>
					: never
			: TypeOf<I, C>
		: TypeOf<E, C>;
type ChainOverArray<E extends Expr, C extends Ctx> =
	ChainRoot<E> extends infer R extends Expr
		? TypeOf<R, C> extends {
				readonly type: infer T extends `${string}[]`;
			}
			? T
			: null
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
type ChainSliced<E> =
	E extends Tag<"slice">
		? true
		: E extends { readonly t: "idx"; readonly e: infer X }
			? ChainSliced<X>
			: false;
/**
 * What a subscript of type T gives (its `sub` fact, null when the table has
 * none), or PostgreSQL's error for a type without subscripting, enums included.
 */
type SubscriptOf<T extends string, DB> =
	TypeFact<BaseOf<T>, "sub", null> extends infer E
		? [E, BaseOf<T>] extends [false, string] | [unknown, keyof SchemaTypes<DB>]
			? SqlError<
					`cannot subscript type ${TypeDisplay<T>} because it does not support subscripting`,
					null
				>
			: E
		: never;
type TypeSlice<
	E extends Expr,
	Lo extends Expr | null,
	Hi extends Expr | null,
	C extends Ctx,
> =
	TypeOf<E, C> extends infer A extends ColInfo
		? TypeOpt<Lo, C> extends infer B extends ColInfo | null
			? TypeOpt<Hi, C> extends infer D extends ColInfo | null
				? ChainOverArray<E, C> extends infer R extends string
					? ChainNullable<E, C> extends infer N extends boolean
						? ArrInfo<
								R,
								Or<Or<NullableOpt<B>, NullableOpt<D>>, N>,
								HasNullElems<A>
							>
						: never
					: SubscriptOf<A["type"], C["db"]> extends infer E
						? E extends AnyErr
							? E
							: BaseOf<A["type"]> extends "jsonb"
								? SqlError<"jsonb subscript does not support slices", null>
								: E extends string
									? SqlError<
											"slices of fixed-length arrays not implemented",
											null
										>
									: Info<
											A["type"],
											Or<A["nullable"], Or<NullableOpt<B>, NullableOpt<D>>>
										>
						: never
				: TypeOpt<Hi, C>
			: TypeOpt<Lo, C>
		: TypeOf<E, C>;
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
	Lit extends boolean = false,
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? (Lit extends true ? TypeOperand<E, C> : TypeOf<E, C>) extends infer T
		? T extends ColInfo
			? TypeList<R, C, [...Acc, T], Lit>
			: T
		: never
	: Acc;

type TypeOperand<E extends Expr, C extends Ctx> =
	E extends Tag<"str"> ? Info<LitType<E["v"]>> : TypeOf<E, C>;

export type FirstColOf<
	Q extends SelectStmt,
	C extends Ctx,
	TooMany extends string = "subquery must return only one column",
> =
	ProjectSelect<Q, C> extends infer R extends Cols
		? OnlyCol<R, TooMany>
		: ProjectSelect<Q, C>;

type SubqueryOperand<
	L extends Expr,
	Q extends SelectStmt,
	C extends Ctx,
> = L extends {
	readonly t: "row";
	readonly items: infer Items extends readonly unknown[];
}
	? ProjectSelect<Q, C> extends infer R extends Cols
		? HasStar<R> extends true
			? Info<"record">
			: R["length"] extends Items["length"]
				? Info<"record">
				: WidthCheck<R, Items> extends "more"
					? SqlError<"subquery has too many columns", null>
					: SqlError<"subquery has too few columns", null>
		: ProjectSelect<Q, C>
	: FirstColOf<Q, C, "subquery has too many columns">;

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
				? TypeWhens<
						Whens,
						C,
						ET["type"],
						ET["nullable"],
						HasNullElems<ET>
					> extends infer W
					? W extends readonly [
							infer T extends string,
							infer N extends boolean,
							infer NE extends boolean,
						]
						? ArrInfo<LitToText<T>, N, NE>
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
	NE extends boolean,
> = Whens extends readonly [
	infer W extends CaseWhen,
	...infer R extends readonly CaseWhen[],
]
	? TypeOf<W["when"], C> extends ColInfo
		? TypeOperand<W["then"], C> extends infer TT extends ColInfo
			? SelectCommon<T, TT["type"]> extends infer T2 extends string
				? TypeWhens<R, C, T2, Or<N, TT["nullable"]>, Or<NE, HasNullElems<TT>>>
				: UnmatchedErr<"CASE", SelectCommon<T, TT["type"]>>
			: TypeOperand<W["then"], C>
		: TypeOf<W["when"], C>
	: readonly [T, N, NE];

type TypeWithinGroup<W extends Expr | null, C extends Ctx> = W extends {
	readonly t: "row";
	readonly items: infer Items extends readonly Expr[];
}
	? TypeList<Items, C, []> extends readonly [infer F, ...ColInfo[]]
		? F
		: TypeList<Items, C, []>
	: TypeOpt<W, C>;

export type NonStarArgs<Args extends readonly Expr[]> = Args extends readonly [
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
		? E["args"] extends readonly [...unknown[], Tag<"variadic">]
			? As extends readonly [...unknown[], { readonly nullable: true }]
				? Info<R["type"], true>
				: R
			: R
		: R
	: R;

/** FILTER (WHERE x IS NOT NULL) leaves only rows where x is not NULL. */
type FilterCtx<E extends Call, C extends Ctx> = E["filter"] extends Expr
	? C["scope"] extends readonly [
			infer L extends ScopeLevel,
			...infer R extends Scope,
		]
		? MkCtx<
				C["db"],
				[NarrowLevel<L, NarrowKeys<E["filter"]>>, ...R],
				C["ctes"],
				C["grouped"]
			>
		: C
	: C;

type TypeCall<E extends Call, C extends Ctx> =
	TypeList<
		NonStarArgs<E["args"]>,
		FilterCtx<E, C>,
		[],
		true
	> extends infer As extends readonly ColInfo[]
		? E["name"] extends "json_build_object" | "jsonb_build_object"
			? BuildObject<
					E["name"] extends "jsonb_build_object" ? "jsonb" : "json",
					E["args"],
					As
				>
			: TypeOpt<E["filter"], C> extends infer F extends ColInfo | null
				? TypeWithinGroup<E["withinGroup"], C> extends infer W extends
						ColInfo | null
					? VariadicNull<
							E,
							As,
							CallType<
								E["name"],
								As,
								{
									readonly grouped: C["grouped"];
									readonly over: E["over"];
									readonly emptyFrame: E["win"] extends {
										readonly emptyFrame: true;
									}
										? true
										: false;
									readonly filter: F extends ColInfo ? true : false;
									readonly distinct: E["distinct"];
									readonly hasStar: E["args"] extends readonly [
										{ readonly t: "star"; readonly tbl: null },
									]
										? true
										: false;
									readonly withinGroup: W extends ColInfo ? true : false;
									readonly wg: W extends ColInfo ? W["type"] : "unknown";
									readonly untypedFirst: E["args"] extends readonly [
										{ readonly t: "str" | "null" },
										...unknown[],
									]
										? true
										: false;
								},
								C["db"]
							>
						>
					: TypeWithinGroup<E["withinGroup"], C>
				: TypeOpt<E["filter"], C>
		: TypeList<NonStarArgs<E["args"]>, FilterCtx<E, C>, [], true>;

type ParamNullable<DB, N> = DB extends { readonly $nullParams: infer P }
	? N extends P
		? true
		: false
	: false;
