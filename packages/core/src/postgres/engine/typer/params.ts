import type { NullTest, ParamEntry } from "../../../engine/params.js";
import type { ColInfo, Info, ScopeLevel } from "../../../engine/types.js";
import type { DateTimeT } from "../../schema/type-facts.js";
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
	XmlExpr,
} from "../ast.js";
import type { Grouped, SetsLevel } from "../binder/clauses.js";
import type { BindFrom, SampleMethods } from "../binder/from.js";
import type { CompareOp, MatchOp } from "../ops.js";
import type { ParamsOfWith } from "../project/dml.js";
import type { BindWith } from "../project/select.js";
import type { CteMap, Ctx, MkCtx, QueryContext } from "../types.js";
import type { AnySig, LookupFn, PickSig, PolyArgs } from "./catalog.js";
import type { CommonType } from "./operators.js";
import type {
	ParamsOfJsonTable,
	ParamsOfSqlJson,
	SqlJsonExpr,
} from "./sqljson.js";
import type { NonStarArgs, TypeList, TypeOf } from "./typeof.js";
import type { ParamsOfXml, ParamsOfXmlTable } from "./xml.js";

type NullTested<E extends Expr> =
	E extends ParamOf<infer N extends number>
		? ParamEntry<N, NullTest>
		: E extends CastParamOf<infer N extends number>
			? ParamEntry<N, NullTest>
			: never;

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

export type ParamsOfExpr<E extends Expr, C extends Ctx> = E extends {
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
	? never
	: ParamsOfExprComplex<E, C>;

type ParamsOfExprComplex<E extends Expr, C extends Ctx> =
	E extends Tag<"param">
		? never
		: E extends Tag<"bin">
			? ParamsOfBin<E["op"], E["l"], E["r"], C>
			: E extends Tag<"un">
				? E["e"] extends ParamOf<infer N extends number>
					? E["op"] extends "not"
						? ParamEntry<N, Info<"bool", true>>
						: never
					: ParamsOfExpr<E["e"], C>
				: E extends Tag<"cast">
					? E["e"] extends ParamOf<infer N extends number>
						? ParamEntry<N, Info<E["to"], false>>
						: E["e"] extends {
									readonly t: "array";
									readonly items: infer Items extends readonly Expr[];
								}
							? E["to"] extends `${infer El}[]`
								? CastArrayParams<Items, C, El>
								: ParamsOfExpr<E["e"], C>
							: ParamsOfExpr<E["e"], C>
					: E extends Tag<"call">
						? ParamsOfCall<Extract<E, Call>, C>
						: E extends Tag<"case">
							? ParamsOfCase<E["operand"], E["whens"], E["else"], C>
							: E extends Tag<"is">
								? E["what"] extends "null"
									? ParamsOfExpr<E["e"], C> | NullTested<E["e"]>
									: ParamsOfExpr<E["e"], C>
								: E extends Tag<"isdistinct">
									? ParamsOfBin<"=", E["l"], E["r"], C>
									: E extends Tag<"between">
										? ParamsOfMember<E["e"], [E["lo"], E["hi"]], [E["lo"]], C>
										: E extends Tag<"in">
											? ParamsOfMember<E["e"], E["list"], E["list"], C>
											: E extends Tag<"insub">
												? ParamsOfExpr<E["e"], C> | ParamsOfSelect<E["q"], C>
												: E extends Tag<"like">
													? ParamsOfList<
															[E["e"], E["pat"]],
															C,
															Info<"text", true>
														>
													: E extends Tag<"quant">
														? ParamsOfQuant<E["l"], E["r"], C>
														: E extends Tag<"sub" | "exists" | "arraysub">
															? ParamsOfSelect<E["q"], C>
															: ParamsOfExprMore<E, C>;
type ParamsOfExprMore<E extends Expr, C extends Ctx> =
	E extends Tag<"array">
		? ParamsOfList<
				E["items"],
				C,
				Mk<UntypedText<CommonOfExprs<E["items"], C>>, true>
			>
		: E extends Tag<"row">
			? ParamsOfList<E["items"], C, null>
			: E extends Tag<"idx">
				? ParamsOfExpr<E["e"], C> | ParamsOfList<[E["i"]], C, Info<"int4">>
				: E extends Tag<"slice">
					?
							| ParamsOfExpr<E["e"], C>
							| ParamsOfOpt<E["lo"] | E["hi"], C, Info<"int4">>
					: E extends Tag<"extract">
						? ParamsOfOpt<E["e"], C, Info<"timestamptz", true>>
						: E extends Tag<"position">
							? ParamsOfList<[E["sub"], E["in"]], C, Info<"text", true>>
							: E extends Tag<"substring">
								? SubstrPosType<E["e"], E["from"], E["for"], C> extends infer PT
									?
											| ParamsOfOpt<E["e"], C, Info<"text", true>>
											| ParamsOfOpt<E["from"] | E["for"], C, PT>
									: never
								: E extends Tag<"trim">
									? ParamsOfOpt<E["e"] | E["chars"], C, Info<"text", true>>
									: E extends Tag<"overlay">
										?
												| ParamsOfOpt<
														E["e"] | E["placing"],
														C,
														Info<"text", true>
												  >
												| ParamsOfOpt<
														E["from"] | E["for"],
														C,
														Info<"int4", true>
												  >
										: E extends Tag<"attz">
											?
													| ParamsOfOpt<E["e"], C, Info<"timestamptz", true>>
													| ParamsOfOpt<E["zone"], C, Info<"text", true>>
											: E extends Tag<
														"collate" | "field" | "named" | "variadic"
													>
												? ParamsOfExpr<E["e"], C>
												: E extends Tag<"xml">
													? ParamsOfXml<Extract<E, XmlExpr>, C>
													: E extends Tag<
																"jsonfn" | "jsonagg" | "isjson" | "jsonfmt"
															>
														? ParamsOfSqlJson<Extract<E, SqlJsonExpr>, C>
														: never;
type ParamsOfMember<
	X extends Expr,
	Es extends readonly Expr[],
	Common extends readonly Expr[],
	C extends Ctx,
> =
	X extends ParamOf<infer N extends number>
		?
				| ParamEntry<N, Mk<CommonOfExprs<Common, C>, true>>
				| ParamsOfList<Es, C, null>
		: ParamsOfExpr<X, C> | ParamsOfList<Es, C, NullableOf<TypeOf<X, C>>>;

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

export type ParamsOfOpt<E extends Expr | null, C extends Ctx, T> =
	E extends ParamOf<infer N extends number>
		? T extends ColInfo
			? ParamEntry<N, T>
			: never
		: E extends CastParamOf<infer N extends number>
			? T extends ColInfo
				? ParamEntry<N, Mk<E["to"], T["nullable"]>>
				: ParamsOfExpr<Extract<E, Expr>, C>
			: E extends Expr
				? ParamsOfExpr<E, C>
				: never;

export type ParamsOfList<
	Es extends readonly Expr[],
	C extends Ctx,
	T,
> = ParamsOfOpt<Es[number], C, T>;

type UntypedText<T> = T extends "unknown" ? "text" : T;
type CastArrayParams<
	Items extends readonly Expr[],
	C extends Ctx,
	El extends string,
> = CastArrayParam<Items[number], C, El>;
type CastArrayParam<
	E extends Expr,
	C extends Ctx,
	El extends string,
> = E extends {
	readonly t: "array";
	readonly items: infer I extends readonly Expr[];
}
	? CastArrayParams<I, C, El>
	: ParamsOfOpt<E, C, Mk<El, true>>;

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
> =
	L extends ParamOf<infer N extends number>
		? R extends Tag<"param">
			? Op extends "and" | "or"
				?
						| ParamEntry<N, Info<"bool", true>>
						| ParamEntry<R["n"], Info<"bool", true>>
				: never
			:
					| ParamsOfOperand<Op, R, L, C>
					| ParamEntry<N, BinParamType<Op, TypeOf<R, C>>>
		: R extends ParamOf<infer N extends number>
			?
					| ParamsOfOperand<Op, L, R, C>
					| ParamEntry<N, BinParamType<Op, TypeOf<L, C>>>
			: ParamsOfOperand<Op, L, R, C> | ParamsOfOperand<Op, R, L, C>;
type ParamsOfOperand<
	Op extends string,
	X extends Expr,
	Other extends Expr,
	C extends Ctx,
> =
	X extends CastParamOf<infer N extends number, infer T>
		? ParamEntry<N, Mk<T, BinNullable<Op, Other, C>>>
		: ParamsOfExpr<X, C>;
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
	? Op extends CompareOp | MatchOp
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

type ParamsOfQuant<L extends Expr, R extends SelectStmt | Expr, C extends Ctx> =
	R extends ParamOf<infer N extends number>
		?
				| ParamsOfExpr<L, C>
				| ParamEntry<
						N,
						TypeOf<L, C> extends infer LT extends ColInfo
							? Mk<`${LT["type"]}[]`, true>
							: Mk<"unknown", true>
				  >
		: R extends CastParamOf<infer N extends number, infer T>
			? ParamsOfExpr<L, C> | ParamEntry<N, Mk<T, true>>
			: L extends ParamOf<infer N extends number>
				? R extends SelectStmt
					? ParamsOfSelect<R, C>
					: R extends Expr
						?
								| ParamsOfExpr<R, C>
								| ParamEntry<
										N,
										TypeOf<R, C> extends { readonly type: `${infer El}[]` }
											? Mk<El, true>
											: Mk<"unknown", true>
								  >
						: never
				: R extends SelectStmt
					? ParamsOfExpr<L, C> | ParamsOfSelect<R, C>
					: R extends Expr
						? ParamsOfExpr<L | R, C>
						: never;

type ParamsOfCase<
	Operand extends Expr | null,
	Whens extends readonly { when: Expr; then: Expr }[],
	Else extends Expr | null,
	C extends Ctx,
> =
	| ParamsOfOpt<Operand, C, null>
	| ParamsOfWhens<
			Whens,
			C,
			Operand extends Expr
				? NullableOf<TypeOf<Operand, C>>
				: Info<"bool", true>,
			Mk<CommonOfExprs<ThenExprs<Whens, Else, []>, C>, true>
	  >
	| ParamsOfOpt<
			Else,
			C,
			Mk<CommonOfExprs<ThenExprs<Whens, Else, []>, C>, true>
	  >;
type ThenExprs<
	Whens extends readonly { when: Expr; then: Expr }[],
	Else extends Expr | null,
	Acc extends readonly Expr[],
> = [
	...Acc,
	...{ [K in keyof Whens]: Whens[K]["then"] },
	...(Else extends Expr ? [Else] : []),
];
type ParamsOfWhens<
	Whens extends readonly { when: Expr; then: Expr }[],
	C extends Ctx,
	WT,
	TT,
> =
	| ParamsOfOpt<Whens[number]["when"], C, WT>
	| ParamsOfOpt<Whens[number]["then"], C, TT>;

type ParamsOfCall<E extends Call, C extends Ctx> = [
	Extract<E["args"][number], ParamOf<number> | CastParamOf<number>>,
] extends [never]
	? ParamsOfList<E["args"], C, null> | ParamsOfCallRest<E, C>
	: ParamsOfCallHints<E, C>;
type ParamsOfCallHints<E extends Call, C extends Ctx> =
	LookupFn<C["db"], E["name"]> extends null
		? ParamsOfList<E["args"], C, null> | ParamsOfCallRest<E, C>
		: TypeList<NonStarArgs<E["args"]>, C, []> extends infer As extends
					readonly ColInfo[]
			? PickSig<LookupFn<C["db"], E["name"]>, As> extends infer S extends AnySig
				?
						| ParamsOfArgs<
								E["args"],
								S["args"],
								C,
								never,
								PolyOf<E["args"], S["args"], C, "unknown">
						  >
						| ParamsOfCallRest<E, C>
				: ParamsOfList<E["args"], C, null> | ParamsOfCallRest<E, C>
			: ParamsOfList<E["args"], C, null> | ParamsOfCallRest<E, C>;
type ParamsOfCallRest<E extends Call, C extends Ctx> =
	| ParamsOfOpt<E["filter"], C, Info<"bool", true>>
	| ParamsOfOpt<E["withinGroup"], C, null>
	| ParamsOfWin<E["win"], C>;
type ParamsOfWin<
	W extends WindowSpec | null,
	C extends Ctx,
> = W extends WindowSpec
	? ParamsOfOrder<W["partition"], C> | ParamsOfOrder<W["order"], C>
	: never;
type ParamsOfWins<
	Ws extends readonly NamedWindow[],
	C extends Ctx,
> = ParamsOfWin<Ws[number]["spec"], C>;
// Sort and partition keys never reach a result column, so their parameters
// accept null, as PostgreSQL does: ORDER BY c - $1::timestamptz sorts NULL last.
// Mark these entries separately; SettleSortKeys makes them nullable once
// every use of each parameter is known.
type ParamsOfOrder<
	Es extends readonly Expr[],
	C extends Ctx,
> = Es extends readonly [] ? never : SortKeys<ParamsOfList<Es, C, null>>;
type SortKeys<E> = E extends unknown ? { readonly sortKey: E } : never;
/**
 * A sort key's entry is dropped when another use already has the same entry,
 * and accepts null otherwise.
 */
export type SettleSortKeys<U> = [
	Extract<U, { readonly sortKey: unknown }>,
] extends [never]
	? U
	:
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
	? ParamEntry<N, Info<T, true>>
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
				M | ParamsOfOpt<A, C, PatternType<P, Poly>>,
				Poly
			>
		: ParamsOfArgs<AR, [], C, M | ParamsOfOpt<A, C, Mk<Poly, true>>, Poly>
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
		: P extends keyof PolyArgs
			? Info<PolyArgs[P]["param"], true>
			: P extends "jsonpath"
				? Info<"text", true>
				: Mk<P, true>;

export type ParamsOfTargets<
	Ts extends readonly Target[],
	C extends Ctx,
> = ParamsOfExpr<Ts[number]["e"], C>;

export type ParamsOfFromItems<
	Fs extends readonly FromItem[],
	C extends Ctx,
> = ParamsOfFromItem<Fs[number], C>;
type ParamsOfFromItem<F extends FromItem, C extends Ctx> =
	F extends Tag<"join">
		?
				| ParamsOfFromItem<F["l"] | F["r"], C>
				| ParamsOfOpt<F["on"], C, Info<"bool">>
		: F extends Tag<"sub">
			? ParamsOfSelect<F["q"], C>
			: F extends Tag<"func">
				? ParamsOfExpr<F["call"], C>
				: F extends Tag<"xmltable">
					? ParamsOfXmlTable<F, C>
					: F extends Tag<"jsontable">
						? ParamsOfJsonTable<F["jt"], C>
						: F extends Tag<"sample">
							?
									| ParamsOfList<
											F["args"],
											C,
											Info<
												F["method"] extends keyof SampleMethods
													? SampleMethods[F["method"]]
													: "float4"
											>
									  >
									| ParamsOfOpt<F["repeatable"], C, Info<"float8">>
							: F extends Tag<"rowsfrom">
								? ParamsOfRowsFrom<F["funcs"], C>
								: never;
type ParamsOfRowsFrom<
	Fs extends readonly { readonly call: Expr }[],
	C extends Ctx,
> = ParamsOfExpr<Fs[number]["call"], C>;

export type ParamsOfSelect<
	Q extends SelectStmt,
	Env extends QueryContext,
	SkipTargets extends boolean = false,
> = Q extends unknown
	? BindWith<Q["with"], Env> extends infer C2 extends CteMap
		?
				| ParamsOfWith<Q["with"], Env["db"], C2>
				| LimitParam<Q["limit"]>
				| LimitParam<Q["offset"]>
				| ParamsOfBody<
						Q["body"],
						QueryContext<Env["db"], Env["scope"], C2>,
						SkipTargets,
						Q["orderBy"]
				  >
		: never
	: never;
/** A LIMIT or OFFSET parameter has a nullable integer hint. */
type LimitParam<E extends Expr | null> =
	E extends ParamOf<infer N extends number>
		? ParamEntry<N, Info<"int4", true>>
		: E extends CastParamOf<infer N extends number, infer T>
			? ParamEntry<N, Mk<T, true>>
			: never;

type ParamsOfBody<
	B extends SelectBody,
	Env extends QueryContext,
	SkipTargets extends boolean = false,
	Order extends readonly Expr[] = [],
> =
	B extends Tag<"simple">
		? BindFrom<B["from"], Env> extends infer L extends ScopeLevel
			? ParamsOfSimple<
					Extract<B, SimpleSelect>,
					MkCtx<
						Env["db"],
						[L, ...Env["scope"]],
						Env["ctes"],
						Grouped<B["groupBy"], B["groupingSets"]>
					>,
					MkCtx<
						Env["db"],
						[SetsLevel<L, B["groupingSets"]>, ...Env["scope"]],
						Env["ctes"],
						Grouped<B["groupBy"], B["groupingSets"]>
					>,
					SkipTargets,
					Order
				>
			: ParamsOfSimple<
					Extract<B, SimpleSelect>,
					MkCtx<Env["db"], Env["scope"], Env["ctes"], false>,
					MkCtx<Env["db"], Env["scope"], Env["ctes"], false>,
					SkipTargets,
					Order
				>
		:
				| ParamsOfOrder<
						Order,
						MkCtx<Env["db"], Env["scope"], Env["ctes"], false>
				  >
				| ParamsOfCompound<B, Env>;
type ParamsOfCompound<B extends SelectBody, Env extends QueryContext> =
	B extends Tag<"setop">
		? ParamsOfBody<B["l"], Env> | ParamsOfBody<B["r"], Env>
		: B extends Tag<"paren">
			? ParamsOfSelect<B["q"], Env>
			: B extends Tag<"values">
				? ParamsOfRows<
						B["rows"],
						MkCtx<Env["db"], Env["scope"], Env["ctes"], false>
					>
				: never;
type ParamsOfRows<
	Rows extends readonly (readonly Expr[])[],
	C extends Ctx,
> = ParamsOfOpt<Rows[number][number], C, null>;
/** `C0` is the scope of FROM and WHERE, `C` the grouped rows' of the rest. */
type ParamsOfSimple<
	B extends SimpleSelect,
	C0 extends Ctx,
	C extends Ctx,
	SkipTargets extends boolean = false,
	Order extends readonly Expr[] = [],
> =
	| ParamsOfOrder<Order, C>
	| ParamsOfOrder<B["distinct"] extends readonly Expr[] ? B["distinct"] : [], C>
	| ParamsOfWins<B["windows"], C>
	| ParamsOfFromItems<B["from"], C0>
	| (SkipTargets extends true ? never : ParamsOfTargets<B["targets"], C>)
	| ParamsOfOpt<B["where"], C0, Info<"bool">>
	| ParamsOfOpt<B["having"], C, Info<"bool">>
	| ParamsOfList<
			B["groupBy"] extends readonly Expr[] ? B["groupBy"] : [],
			C0,
			null
	  >;
