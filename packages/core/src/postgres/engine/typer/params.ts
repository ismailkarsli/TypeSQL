import type { AddParam, NullTest } from "../../../engine/params.js";
import type {
	ColInfo,
	CteMap,
	Ctx,
	Info,
	MkCtx,
	Scope,
	ScopeLevel,
} from "../../../engine/types.js";
import type {
	Call,
	Expr,
	FromItem,
	NamedWindow,
	SelectBody,
	SelectStmt,
	SimpleSelect,
	Tag,
	Target,
	WindowSpec,
} from "../ast.js";
import type { BindFrom } from "../binder/from.js";
import type { ParamsOfWith } from "../project/dml.js";
import type { BindWith } from "../project/select.js";
import type { AnySig, LookupFn, PickSig } from "./catalog.js";
import type { CommonType, DateTimeT } from "./operators.js";
import type { ParamsOfJsonTable, ParamsOfSqlJson } from "./sqljson.js";
import type { NonStarArgs, TypeList, TypeOf } from "./typeof.js";
import type { ParamsOfXml, ParamsOfXmlTable } from "./xml.js";

type NullTested<E extends Expr, M> =
	E extends ParamOf<infer N extends number>
		? AddParam<M, N, NullTest>
		: E extends CastParamOf<infer N extends number>
			? AddParam<M, N, NullTest>
			: M;

type IsComparison<Op extends string> = Op extends
	| "="
	| "<"
	| ">"
	| "<="
	| ">="
	| "<>"
	| "!="
	| "~"
	| "~*"
	| "!~"
	| "!~*"
	| "~~"
	| "~~*"
	| "!~~"
	| "!~~*"
	? true
	: false;
type NullableOf<T> = T extends ColInfo
	? Mk<T["type"], true>
	: Mk<"unknown", true>;
type Mk<T, N extends boolean> = { readonly type: T; readonly nullable: N };
export type ParamOf<N extends number> = { readonly t: "param"; readonly n: N };
type CastParamOf<N extends number, T = unknown> = {
	readonly t: "cast";
	readonly to: T;
	readonly e: ParamOf<N>;
};

export type ParamsOfExpr<E extends Expr, C extends Ctx, M> = E extends {
	readonly t:
		| "col"
		| "star"
		| "num"
		| "str"
		| "bool"
		| "null"
		| "typed"
		| "default";
}
	? M
	: ParamsOfExprComplex<E, C, M>;

type ParamsOfExprComplex<E extends Expr, C extends Ctx, M> =
	E extends Tag<"param">
		? M
		: E extends Tag<"bin">
			? ParamsOfBin<E["op"], E["l"], E["r"], C, M>
			: E extends Tag<"un">
				? E["e"] extends ParamOf<infer N extends number>
					? E["op"] extends "not"
						? AddParam<M, N, Info<"bool", true>>
						: M
					: ParamsOfExpr<E["e"], C, M>
				: E extends Tag<"cast">
					? E["e"] extends ParamOf<infer N extends number>
						? AddParam<M, N, Info<E["to"], false>>
						: E["e"] extends {
									readonly t: "array";
									readonly items: infer Items extends readonly Expr[];
								}
							? E["to"] extends `${infer El}[]`
								? CastArrayParams<Items, C, M, El>
								: ParamsOfExpr<E["e"], C, M>
							: ParamsOfExpr<E["e"], C, M>
					: E extends Tag<"call">
						? ParamsOfCall<Extract<E, Call>, C, M>
						: E extends Tag<"case">
							? ParamsOfCase<E["operand"], E["whens"], E["else"], C, M>
							: E extends Tag<"is">
								? E["what"] extends "null"
									? NullTested<E["e"], ParamsOfExpr<E["e"], C, M>>
									: ParamsOfExpr<E["e"], C, M>
								: E extends Tag<"isdistinct">
									? ParamsOfBin<"=", E["l"], E["r"], C, M>
									: E extends Tag<"between">
										? ParamsOfMember<
												E["e"],
												[E["lo"], E["hi"]],
												[E["lo"]],
												C,
												M
											>
										: E extends Tag<"in">
											? ParamsOfMember<E["e"], E["list"], E["list"], C, M>
											: E extends Tag<"insub">
												? ParamsOfSelect<
														E["q"],
														C["db"],
														C["scope"],
														C["ctes"],
														ParamsOfExpr<E["e"], C, M>
													>
												: E extends Tag<"like">
													? ParamsOfList<
															[E["e"], E["pat"]],
															C,
															M,
															Info<"text", true>
														>
													: E extends Tag<"quant">
														? ParamsOfQuant<E["l"], E["r"], C, M>
														: E extends Tag<"sub" | "exists" | "arraysub">
															? ParamsOfSelect<
																	E["q"],
																	C["db"],
																	C["scope"],
																	C["ctes"],
																	M
																>
															: ParamsOfExprMore<E, C, M>;
type ParamsOfExprMore<E extends Expr, C extends Ctx, M> =
	E extends Tag<"array">
		? ParamsOfList<
				E["items"],
				C,
				M,
				Mk<UntypedText<CommonOfExprs<E["items"], C>>, true>
			>
		: E extends Tag<"row">
			? ParamsOfList<E["items"], C, M, null>
			: E extends Tag<"idx">
				? ParamsOfList<[E["i"]], C, ParamsOfExpr<E["e"], C, M>, Info<"int4">>
				: E extends Tag<"slice">
					? ParamsOfOpt<
							E["hi"],
							C,
							ParamsOfOpt<E["lo"], C, ParamsOfExpr<E["e"], C, M>, Info<"int4">>,
							Info<"int4">
						>
					: E extends Tag<"extract">
						? ParamsOfOpt<E["e"], C, M, Info<"timestamptz", true>>
						: E extends Tag<"position">
							? ParamsOfList<[E["sub"], E["in"]], C, M, Info<"text", true>>
							: E extends Tag<"substring">
								? SubstrPosType<E["e"], E["from"], E["for"], C> extends infer PT
									? ParamsOfOpt<
											E["for"],
											C,
											ParamsOfOpt<
												E["from"],
												C,
												ParamsOfOpt<E["e"], C, M, Info<"text", true>>,
												PT
											>,
											PT
										>
									: never
								: E extends Tag<"trim">
									? ParamsOfOpt<
											E["chars"],
											C,
											ParamsOfOpt<E["e"], C, M, Info<"text", true>>,
											Info<"text", true>
										>
									: E extends Tag<"overlay">
										? ParamsOfOpt<
												E["for"],
												C,
												ParamsOfOpt<
													E["from"],
													C,
													ParamsOfOpt<
														E["placing"],
														C,
														ParamsOfOpt<E["e"], C, M, Info<"text", true>>,
														Info<"text", true>
													>,
													Info<"int4", true>
												>,
												Info<"int4", true>
											>
										: E extends Tag<"attz">
											? ParamsOfOpt<
													E["zone"],
													C,
													ParamsOfOpt<E["e"], C, M, Info<"timestamptz", true>>,
													Info<"text", true>
												>
											: E extends Tag<
														"collate" | "field" | "named" | "variadic"
													>
												? ParamsOfExpr<E["e"], C, M>
												: E extends Tag<"xml">
													? ParamsOfXml<E, C, M>
													: E extends Tag<
																"jsonfn" | "jsonagg" | "isjson" | "jsonfmt"
															>
														? ParamsOfSqlJson<E, C, M>
														: M;
type ParamsOfMember<
	X extends Expr,
	Es extends readonly Expr[],
	Common extends readonly Expr[],
	C extends Ctx,
	M,
> =
	X extends ParamOf<infer N extends number>
		? ParamsOfList<
				Es,
				C,
				AddParam<M, N, Mk<CommonOfExprs<Common, C>, true>>,
				null
			>
		: ParamsOfList<Es, C, ParamsOfExpr<X, C, M>, NullableOf<TypeOf<X, C>>>;

type SubstrPosType<
	S extends Expr,
	From extends Expr | null,
	For extends Expr | null,
	C extends Ctx,
> =
	TypeOf<S, C> extends { readonly type: "bytea" | "bit" | "varbit" }
		? Info<"int4", true>
		: From extends null
			? Info<"int4", true>
			: (From extends Tag<"param"> ? For : From) extends infer Sib
				? Sib extends Expr
					? TypeOf<Sib, C> extends { readonly type: "int2" | "int4" }
						? Info<"int4", true>
						: Info<"text", true>
					: Info<"text", true>
				: never;

export type ParamsOfOpt<E extends Expr | null, C extends Ctx, M, T> =
	E extends ParamOf<infer N extends number>
		? T extends ColInfo
			? AddParam<M, N, T>
			: M
		: E extends CastParamOf<infer N extends number>
			? T extends ColInfo
				? AddParam<M, N, Mk<E["to"], T["nullable"]>>
				: ParamsOfExpr<E, C, M>
			: E extends Expr
				? ParamsOfExpr<E, C, M>
				: M;

export type ParamsOfList<
	Es extends readonly Expr[],
	C extends Ctx,
	M,
	T,
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? ParamsOfList<R, C, ParamsOfOpt<E, C, M, T>, T>
	: M;

type UntypedText<T> = T extends "unknown" ? "text" : T;
type CastArrayParams<
	Items extends readonly Expr[],
	C extends Ctx,
	M,
	El extends string,
> = Items extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? CastArrayParams<
			R,
			C,
			E extends {
				readonly t: "array";
				readonly items: infer I extends readonly Expr[];
			}
				? CastArrayParams<I, C, M, El>
				: ParamsOfOpt<E, C, M, Mk<El, true>>,
			El
		>
	: M;

type CommonOfExprs<Es extends readonly Expr[], C extends Ctx> =
	TypeList<NonParams<Es, []>, C, []> extends infer Ts extends readonly ColInfo[]
		? CommonOfInfos<Ts, "unknown">
		: "unknown";
type NonParams<
	Es extends readonly Expr[],
	Acc extends readonly Expr[],
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? E extends Tag<"null">
		? NonParams<R, Acc>
		: NonParams<R, [...Acc, E]>
	: Acc;
type CommonOfInfos<
	Ts extends readonly ColInfo[],
	Acc extends string,
> = Ts extends readonly [
	infer T extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? CommonOfInfos<R, CommonType<Acc, T["type"]>>
	: Acc;

type ParamsOfBin<
	Op extends string,
	L extends Expr,
	R extends Expr,
	C extends Ctx,
	M,
> =
	L extends ParamOf<infer N extends number>
		? R extends Tag<"param">
			? Op extends "and" | "or"
				? AddParam<
						AddParam<M, N, Info<"bool", true>>,
						R["n"],
						Info<"bool", true>
					>
				: M
			: AddParam<
					ParamsOfOperand<Op, R, L, C, M>,
					N,
					BinParamType<Op, TypeOf<R, C>>
				>
		: R extends ParamOf<infer N extends number>
			? AddParam<
					ParamsOfOperand<Op, L, R, C, M>,
					N,
					BinParamType<Op, TypeOf<L, C>>
				>
			: ParamsOfOperand<Op, R, L, C, ParamsOfOperand<Op, L, R, C, M>>;
type ParamsOfOperand<
	Op extends string,
	X extends Expr,
	Other extends Expr,
	C extends Ctx,
	M,
> =
	X extends CastParamOf<infer N extends number, infer T>
		? AddParam<M, N, Mk<T, BinNullable<Op, Other, C>>>
		: ParamsOfExpr<X, C, M>;
type BinNullable<Op extends string, Other extends Expr, C extends Ctx> =
	BinParamType<Op, TypeOf<Other, C>> extends {
		readonly nullable: infer Nl extends boolean;
	}
		? Nl
		: true;

type BinParamType<Op extends string, Other> = Other extends {
	readonly type: infer OT;
	readonly nullable: boolean;
}
	? IsComparison<Op> extends true
		? Mk<OT, true>
		: Op extends "and" | "or"
			? Info<"bool", true>
			: Op extends "->" | "->>" | "?"
				? Info<"text", true>
				: Op extends "#>" | "#>>" | "?|" | "?&"
					? Info<"text[]", true>
					: Op extends "@?" | "@@"
						? OT extends "jsonb"
							? Info<"text", true>
							: OT extends "tsvector"
								? Info<"tsquery", true>
								: OT extends "tsquery"
									? Info<"tsvector", true>
									: Other
						: Op extends "+" | "-"
							? OT extends DateTimeT
								? Mk<
										Op extends "-"
											? OT extends "timetz"
												? "interval"
												: OT
											: "interval",
										Other["nullable"]
									>
								: OT extends "jsonb"
									? Mk<"text", Other["nullable"]>
									: Other
							: Op extends "*" | "/"
								? OT extends "interval"
									? Mk<"float8", Other["nullable"]>
									: Other
								: Op extends "||"
									? OT extends
											| "jsonb"
											| "bytea"
											| "tsvector"
											| "tsquery"
											| `${string}[]`
										? Other
										: Mk<"text", Other["nullable"]>
									: Other
	: Mk<"unknown", true>;

type ParamsOfQuant<
	L extends Expr,
	R extends SelectStmt | Expr,
	C extends Ctx,
	M,
> =
	R extends ParamOf<infer N extends number>
		? AddParam<
				ParamsOfExpr<L, C, M>,
				N,
				TypeOf<L, C> extends infer LT extends ColInfo
					? Mk<`${LT["type"]}[]`, true>
					: Mk<"unknown", true>
			>
		: R extends CastParamOf<infer N extends number, infer T>
			? AddParam<ParamsOfExpr<L, C, M>, N, Mk<T, true>>
			: L extends ParamOf<infer N extends number>
				? R extends SelectStmt
					? ParamsOfSelect<R, C["db"], C["scope"], C["ctes"], M>
					: R extends Expr
						? AddParam<
								ParamsOfExpr<R, C, M>,
								N,
								TypeOf<R, C> extends { readonly type: `${infer El}[]` }
									? Mk<El, true>
									: Mk<"unknown", true>
							>
						: M
				: R extends SelectStmt
					? ParamsOfSelect<
							R,
							C["db"],
							C["scope"],
							C["ctes"],
							ParamsOfExpr<L, C, M>
						>
					: R extends Expr
						? ParamsOfExpr<R, C, ParamsOfExpr<L, C, M>>
						: M;

type ParamsOfCase<
	Operand extends Expr | null,
	Whens extends readonly { when: Expr; then: Expr }[],
	Else extends Expr | null,
	C extends Ctx,
	M,
> = ParamsOfOpt<
	Else,
	C,
	ParamsOfWhens<
		Whens,
		C,
		ParamsOfOpt<Operand, C, M, null>,
		Operand extends Expr ? NullableOf<TypeOf<Operand, C>> : Info<"bool", true>,
		Mk<CommonOfExprs<ThenExprs<Whens, Else, []>, C>, true>
	>,
	Mk<CommonOfExprs<ThenExprs<Whens, Else, []>, C>, true>
>;
type ThenExprs<
	Whens extends readonly { when: Expr; then: Expr }[],
	Else extends Expr | null,
	Acc extends readonly Expr[],
> = Whens extends readonly [
	infer W extends { when: Expr; then: Expr },
	...infer R extends readonly { when: Expr; then: Expr }[],
]
	? ThenExprs<R, Else, [...Acc, W["then"]]>
	: Else extends Expr
		? [...Acc, Else]
		: Acc;
type ParamsOfWhens<
	Whens extends readonly { when: Expr; then: Expr }[],
	C extends Ctx,
	M,
	WT,
	TT,
> = Whens extends readonly [
	infer W extends { when: Expr; then: Expr },
	...infer R extends readonly { when: Expr; then: Expr }[],
]
	? ParamsOfWhens<
			R,
			C,
			ParamsOfOpt<W["then"], C, ParamsOfOpt<W["when"], C, M, WT>, TT>,
			WT,
			TT
		>
	: M;

type ParamsOfCall<E extends Call, C extends Ctx, M> =
	LookupFn<C["db"], E["name"]> extends null
		? ParamsOfCallRest<E, C, ParamsOfList<E["args"], C, M, null>>
		: TypeList<NonStarArgs<E["args"]>, C, []> extends infer As extends
					readonly ColInfo[]
			? PickSig<LookupFn<C["db"], E["name"]>, As> extends infer S extends AnySig
				? ParamsOfCallRest<
						E,
						C,
						ParamsOfArgs<
							E["args"],
							S["args"],
							C,
							M,
							PolyOf<E["args"], S["args"], C, "unknown">
						>
					>
				: ParamsOfCallRest<E, C, ParamsOfList<E["args"], C, M, null>>
			: ParamsOfCallRest<E, C, ParamsOfList<E["args"], C, M, null>>;
type ParamsOfCallRest<E extends Call, C extends Ctx, M> = ParamsOfWin<
	E["win"],
	C,
	ParamsOfOpt<
		E["withinGroup"],
		C,
		ParamsOfOpt<E["filter"], C, M, Info<"bool", true>>,
		null
	>
>;
type ParamsOfWin<
	W extends WindowSpec | null,
	C extends Ctx,
	M,
> = W extends WindowSpec
	? ParamsOfOrder<W["order"], C, ParamsOfOrder<W["partition"], C, M>>
	: M;
type ParamsOfWins<
	Ws extends readonly NamedWindow[],
	C extends Ctx,
	M,
> = Ws extends readonly [
	infer W extends NamedWindow,
	...infer R extends readonly NamedWindow[],
]
	? ParamsOfWins<R, C, ParamsOfWin<W["spec"], C, M>>
	: M;
// Sort and partition keys never reach a result column, so their parameters
// accept null, as PostgreSQL does: ORDER BY c - $1::timestamptz sorts NULL last.
// The keys' entries are collected on their own and added to M marked as sort
// keys; SettleSortKeys makes them nullable once every use is known. Collecting
// into M itself would nest everything gathered so far into each level of a
// query (TS5115 on nested subqueries).
type ParamsOfOrder<
	Es extends readonly Expr[],
	C extends Ctx,
	M,
> = Es extends readonly [] ? M : M | SortKeys<ParamsOfList<Es, C, never, null>>;
type SortKeys<E> = E extends unknown ? { readonly sortKey: E } : never;
/**
 * A sort key's entry is dropped when another use already has the same entry,
 * and accepts null otherwise.
 */
export type SettleSortKeys<U> =
	| Exclude<U, { readonly sortKey: unknown }>
	| AcceptNull<
			SortKeyEntries<
				Extract<U, { readonly sortKey: unknown }>,
				Exclude<U, { readonly sortKey: unknown }>
			>
	  >;
type SortKeyEntries<S, Uses> = S extends { readonly sortKey: infer E }
	? E extends Uses
		? never
		: E
	: never;
type AcceptNull<E> = E extends {
	readonly n: infer N extends number;
	readonly t: Info<infer T, false>;
}
	? AddParam<never, N, Info<T, true>>
	: E;

type PolyOf<
	Args extends readonly Expr[],
	Ps extends readonly string[],
	C extends Ctx,
	Acc extends string,
> = Args extends readonly [
	infer A extends Expr,
	...infer AR extends readonly Expr[],
]
	? Ps extends readonly [
			infer P extends string,
			...infer PR extends readonly string[],
		]
		? PolyOf<
				AR,
				P extends "..." ? Ps : PR,
				C,
				P extends "any" | "..." | "anyarray"
					? A extends Tag<"null">
						? Acc
						: PolyStep<P, TypeOf<A, C>, Acc>
					: Acc
			>
		: Acc
	: Acc;
type PolyStep<P extends string, T, Acc extends string> = T extends {
	readonly type: infer AT extends string;
}
	? P extends "any" | "..."
		? CommonType<Acc, AT>
		: P extends "anyarray"
			? AT extends `${infer El}[]`
				? CommonType<Acc, El>
				: Acc
			: Acc
	: Acc;

type ParamsOfArgs<
	Args extends readonly Expr[],
	Ps extends readonly string[],
	C extends Ctx,
	M,
	Poly,
> = Args extends readonly [
	infer A extends Expr,
	...infer AR extends readonly Expr[],
]
	? Ps extends readonly [
			infer P extends string,
			...infer PR extends readonly string[],
		]
		? ParamsOfArgs<
				AR,
				P extends "..." ? Ps : PR,
				C,
				ParamsOfOpt<A, C, M, PatternType<P, Poly>>,
				Poly
			>
		: ParamsOfArgs<AR, [], C, ParamsOfOpt<A, C, M, Mk<Poly, true>>, Poly>
	: M;
type PatternType<P extends string, Poly> = P extends "any" | "..."
	? Mk<Poly, true>
	: P extends "anyarray"
		? Mk<
				Poly extends "unknown"
					? "unknown"
					: Poly extends `${string}[]`
						? Poly
						: Poly extends string
							? `${Poly}[]`
							: "unknown",
				true
			>
		: P extends "anystring" | "jsonpath"
			? Info<"text", true>
			: P extends "anynumeric"
				? Info<"float8", true>
				: P extends "anydatetime"
					? Info<"timestamptz", true>
					: P extends "anyrange"
						? Info<"unknown", true>
						: Mk<P, true>;

export type ParamsOfTargets<
	Ts extends readonly Target[],
	C extends Ctx,
	M,
> = Ts extends readonly [
	infer T extends Target,
	...infer R extends readonly Target[],
]
	? ParamsOfTargets<R, C, ParamsOfExpr<T["e"], C, M>>
	: M;

export type ParamsOfFromItems<
	Fs extends readonly FromItem[],
	C extends Ctx,
	M,
> = Fs extends readonly [
	infer F extends FromItem,
	...infer R extends readonly FromItem[],
]
	? ParamsOfFromItems<R, C, ParamsOfFromItem<F, C, M>>
	: M;
type ParamsOfFromItem<F extends FromItem, C extends Ctx, M> =
	F extends Tag<"join">
		? ParamsOfOpt<
				F["on"],
				C,
				ParamsOfFromItem<F["r"], C, ParamsOfFromItem<F["l"], C, M>>,
				Info<"bool">
			>
		: F extends Tag<"sub">
			? ParamsOfSelect<F["q"], C["db"], C["scope"], C["ctes"], M>
			: F extends Tag<"func">
				? ParamsOfExpr<F["call"], C, M>
				: F extends Tag<"xmltable">
					? ParamsOfXmlTable<F, C, M>
					: F extends Tag<"jsontable">
						? ParamsOfJsonTable<F["jt"], C, M>
						: F extends Tag<"sample">
							? ParamsOfOpt<
									F["repeatable"],
									C,
									ParamsOfList<
										F["args"],
										C,
										M,
										Info<
											F["method"] extends "system_rows"
												? "int8"
												: F["method"] extends "system_time"
													? "float8"
													: "float4"
										>
									>,
									Info<"float8">
								>
							: F extends Tag<"rowsfrom">
								? ParamsOfRowsFrom<F["funcs"], C, M>
								: M;
type ParamsOfRowsFrom<
	Fs extends readonly { readonly call: Expr }[],
	C extends Ctx,
	M,
> = Fs extends readonly [
	infer F extends { readonly call: Expr },
	...infer R extends readonly { readonly call: Expr }[],
]
	? ParamsOfRowsFrom<R, C, ParamsOfExpr<F["call"], C, M>>
	: M;

export type ParamsOfSelect<
	Q extends SelectStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	M,
	SkipTargets extends boolean = false,
> =
	BindWith<Q["with"], DB, Outer, Ctes> extends infer C2 extends CteMap
		? ParamsOfBody<
				Q["body"],
				DB,
				Outer,
				C2,
				| ParamsOfWith<Q["with"], DB, C2, M>
				| LimitParam<Q["limit"]>
				| LimitParam<Q["offset"]>,
				SkipTargets,
				Q["orderBy"]
			>
		: M;
/**
 * A LIMIT or OFFSET parameter's entry, added to the accumulator before the
 * body is walked, so the walk stays a tail call through nested queries.
 */
type LimitParam<E extends Expr | null> =
	E extends ParamOf<infer N extends number>
		? AddParam<never, N, Info<"int4", true>>
		: E extends CastParamOf<infer N extends number, infer T>
			? AddParam<never, N, Mk<T, true>>
			: never;

type ParamsOfBody<
	B extends SelectBody,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	M,
	SkipTargets extends boolean = false,
	Order extends readonly Expr[] = [],
> =
	B extends Tag<"simple">
		? BindFrom<B["from"], DB, Outer, Ctes> extends infer L extends ScopeLevel
			? ParamsOfSimple<
					Extract<B, SimpleSelect>,
					MkCtx<
						DB,
						[L, ...Outer],
						Ctes,
						B["groupBy"] extends null ? false : true
					>,
					M,
					SkipTargets,
					Order
				>
			: ParamsOfSimple<
					Extract<B, SimpleSelect>,
					MkCtx<DB, Outer, Ctes, false>,
					M,
					SkipTargets,
					Order
				>
		: ParamsOfCompound<
				B,
				DB,
				Outer,
				Ctes,
				ParamsOfOrder<Order, MkCtx<DB, Outer, Ctes, false>, M>
			>;
type ParamsOfCompound<
	B extends SelectBody,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	M,
> =
	B extends Tag<"setop">
		? ParamsOfBody<
				B["r"],
				DB,
				Outer,
				Ctes,
				ParamsOfBody<B["l"], DB, Outer, Ctes, M>
			>
		: B extends Tag<"paren">
			? ParamsOfSelect<B["q"], DB, Outer, Ctes, M>
			: B extends Tag<"values">
				? ParamsOfRows<B["rows"], MkCtx<DB, Outer, Ctes, false>, M>
				: M;
type ParamsOfRows<
	Rows extends readonly (readonly Expr[])[],
	C extends Ctx,
	M,
> = Rows extends readonly [
	infer R extends readonly Expr[],
	...infer Rest extends readonly (readonly Expr[])[],
]
	? ParamsOfRows<Rest, C, ParamsOfList<R, C, M, null>>
	: M;
type ParamsOfSimple<
	B extends SimpleSelect,
	C extends Ctx,
	M,
	SkipTargets extends boolean = false,
	Order extends readonly Expr[] = [],
> = B extends {
	readonly targets: infer Ts extends readonly Target[];
	readonly from: infer Fs extends readonly FromItem[];
	readonly where: infer W extends Expr | null;
	readonly having: infer H extends Expr | null;
	readonly groupBy: infer G;
	readonly distinct: infer D;
	readonly windows: infer Ws extends readonly NamedWindow[];
}
	? SimpleParts<
			[
				["sort", SortParams<Ws, D, Order>],
				["from", Fs],
				SkipTargets extends true ? ["skip", null] : ["targets", Ts],
				["cond", W],
				["list", G extends readonly Expr[] ? G : []],
				["cond", H],
			],
			C,
			M
		>
	: M;
type SortParams<
	Ws extends readonly NamedWindow[],
	D,
	Order extends readonly Expr[],
> = {
	readonly ws: Ws;
	readonly d: D extends readonly Expr[] ? D : [];
	readonly order: Order;
};

/**
 * A select's parts walked one after another by a tail-recursive loop, so each
 * part, and the nested queries in it, costs one level of nesting however many
 * parts come before it. Entries only accumulate, so the order is free.
 */
type SimpleParts<
	Ps extends readonly unknown[],
	C extends Ctx,
	M,
> = Ps extends readonly [infer P, ...infer R]
	? SimpleParts<R, C, SimplePart<P, C, M>>
	: M;
type SimplePart<P, C extends Ctx, M> = P extends readonly [
	"from",
	infer Fs extends readonly FromItem[],
]
	? ParamsOfFromItems<Fs, C, M>
	: P extends readonly ["targets", infer Ts extends readonly Target[]]
		? ParamsOfTargets<Ts, C, M>
		: P extends readonly ["cond", infer E extends Expr | null]
			? ParamsOfOpt<E, C, M, Info<"bool">>
			: P extends readonly ["list", infer Es extends readonly Expr[]]
				? ParamsOfList<Es, C, M, null>
				: P extends readonly [
							"sort",
							{
								readonly ws: infer Ws extends readonly NamedWindow[];
								readonly d: infer D extends readonly Expr[];
								readonly order: infer O extends readonly Expr[];
							},
						]
					? ParamsOfWins<Ws, C, ParamsOfOrder<D, C, ParamsOfOrder<O, C, M>>>
					: M;
