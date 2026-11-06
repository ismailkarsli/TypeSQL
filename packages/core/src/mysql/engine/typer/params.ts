import type {
	DeclaredFn,
	PickSig,
	SigSlots,
} from "../../../engine/family/functions.js";
import type { QueryContext } from "../../../engine/family/types.js";
import type { Next } from "../../../engine/next.js";
import type { NullTest, ParamEntry } from "../../../engine/params.js";
import type { ColInfo, Info, Scope } from "../../../engine/types.js";
import type {
	Call,
	CaseExpr,
	Expr,
	FromItem,
	SelectBody,
	SelectStmt,
	SimpleSelect,
	Target,
} from "../ast.js";
import type { BindFrom } from "../binder/scope.js";
import type { BindWith } from "../project/select.js";
import type { Cat, MkCtx, MyCteMap, MyCtx, MyLevel } from "../types.js";
import type { FunctionCatalog, Functions } from "./functions.js";
import type { Common, SubqueryCol, TypeOf } from "./typeof.js";

type Ctx<DB, S extends Scope, Ctes extends MyCteMap> = MkCtx<
	DB,
	S,
	Ctes,
	"group"
>;

/** The parameter `E` is, through `($1)` and `COLLATE`. */
type ParamN<E> = E extends {
	readonly t: "param";
	readonly n: infer N extends number;
}
	? N
	: E extends {
				readonly t: "collate";
				readonly e: infer X;
			}
		? X extends { readonly t: "param"; readonly n: infer N extends number }
			? N
			: never
		: never;

/** The type of the value next to a parameter, if it is known. */
type Sib<E extends Expr, C extends MyCtx> = E extends {
	readonly t: "param" | "null" | "var";
}
	? null
	: TypeOf<E, C> extends infer X
		? X extends ColInfo
			? X["type"] extends "null" | "unknown"
				? null
				: X
			: null
		: never;

type Use<T, N extends boolean> = T extends ColInfo
	? Info<T["type"], N>
	: Info<"unknown", true>;

type Comparison = "=" | "!=" | "<" | ">" | "<=" | ">=" | "<=>";

type ParamsOfExpr<E, C extends MyCtx> = E extends {
	readonly t:
		| "col"
		| "num"
		| "str"
		| "blob"
		| "bool"
		| "null"
		| "ctime"
		| "param"
		| "var"
		| "default";
}
	? never
	: E extends Expr
		? ParamsComplex<E, C>
		: never;

type ParamsComplex<E extends Expr, C extends MyCtx> = E extends {
	readonly t: "bin";
}
	? ParamsOfBin<E["op"], E["l"], E["r"], C>
	: E extends { readonly t: "un" }
		? Slot<
				E["e"],
				C,
				E["op"] extends "-"
					? Info<"double", false>
					: E["op"] extends "~"
						? Info<"bigint unsigned", false>
						: E["op"] extends "binary"
							? Info<"varbinary", false>
							: Info<"bool", true>
			>
		: E extends { readonly t: "cast" }
			? Slot<E["e"], C, Info<CastParam<E["to"]>, true>>
			: E extends { readonly t: "convert" | "collate" }
				? Slot<E["e"], C, Info<"varchar", false>>
				: E extends { readonly t: "is" }
					? Slot<
							E["e"],
							C,
							E["what"] extends "null" ? NullTest : Info<"bool", true>
						>
					: E extends { readonly t: "between" }
						? ListParams<[E["e"], E["lo"], E["hi"]], C, false>
						: E extends { readonly t: "in" }
							? E["e"] extends { readonly t: "row" }
								? ParamsOfList<[E["e"], ...E["list"]], C>
								: ListParams<[E["e"], ...E["list"]], C, false>
							: E extends { readonly t: "insub" }
								? InSubParams<E["e"], E["q"], C>
								: E extends { readonly t: "quant" }
									? InSubParams<E["l"], E["r"], C>
									: E extends { readonly t: "like" }
										? ListParams<
												E["esc"] extends Expr
													? [E["e"], E["pat"], E["esc"]]
													: [E["e"], E["pat"]],
												C,
												false,
												Info<"varchar", false>
											>
										: E extends { readonly t: "member" }
											?
													| Slot<E["e"], C, Info<"unknown", false>>
													| Slot<E["doc"], C, Info<"json", false>>
											: E extends { readonly t: "match" }
												?
														| ParamsOfList<E["cols"], C>
														| Slot<E["against"], C, Info<"varchar", false>>
												: E extends { readonly t: "interval" }
													? Slot<
															E["e"],
															C,
															Info<IntervalParam<E["unit"]>, false>
														>
													: E extends { readonly t: "assign" }
														? Slot<E["e"], C, Info<"unknown", true>>
														: E extends { readonly t: "case" }
															? CaseParams<Extract<E, CaseExpr>, C>
															: E extends { readonly t: "call" }
																? CallParams<Extract<E, Call>, C>
																: E extends { readonly t: "sub" | "exists" }
																	? ParamsOfSelect<E["q"], C>
																	: E extends { readonly t: "row" }
																		? ParamsOfList<E["items"], C>
																		: never;

type IntervalParam<U> = U extends
	| "microsecond"
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "quarter"
	| "year"
	? "bigint"
	: "varchar";

type CastParam<To extends string> = To extends "json"
	? "unknown"
	: To extends "varbinary"
		? "unknown"
		: To extends "varchar"
			? "unknown"
			: To;

type ParamsOfBin<
	Op,
	L extends Expr,
	R extends Expr,
	C extends MyCtx,
> = Op extends "and" | "or" | "xor"
	? BoolParam<R> | BoolParam<L> | ParamsOfExpr<L | R, C>
	: Op extends Comparison | "sounds"
		? L extends { readonly t: "row" }
			? R extends { readonly t: "row" }
				? RowPairs<L["items"], R["items"], C, never, 0>
				: ParamsOfList<L["items"], C> | ParamsOfExpr<R, C>
			: PairParams<L, R, C, Op extends "<=>" ? true : false>
		: Op extends "->" | "->>"
			? FixedPair<L, R, C, Info<"varchar", false>>
			: Op extends "&" | "|" | "^" | "<<" | ">>"
				? FixedPair<L, R, C, Info<"bigint unsigned", false>>
				: R extends { readonly t: "interval" }
					? Slot<L, C, Info<"datetime", false>> | ParamsOfExpr<R, C>
					: L extends { readonly t: "interval" }
						? Slot<R, C, Info<"datetime", false>> | ParamsOfExpr<L, C>
						: PairParams<L, R, C, "num">;

type BoolParam<E> = [ParamN<E>] extends [never]
	? never
	: ParamEntry<ParamN<E>, Info<"bool", true>>;

type RowPairs<
	L extends readonly Expr[],
	R extends readonly Expr[],
	C extends MyCtx,
	M,
	I extends number,
> = L[I] extends infer A extends Expr
	? R[I] extends infer B extends Expr
		? RowPairs<L, R, C, M | PairParams<A, B, C, false>, Next<I>>
		: M
	: M;

/** `K`: the nullability of a compared parameter, or `"num"` for an arithmetic one. */
type PairParams<
	L extends Expr,
	R extends Expr,
	C extends MyCtx,
	K extends boolean | "num",
> = [ParamN<L>] extends [never]
	? [ParamN<R>] extends [never]
		? ParamsOfExpr<L | R, C>
		: ParamsOfExpr<L, C> | ParamEntry<ParamN<R>, SibSlot<Sib<L, C>, K>>
	: [ParamN<R>] extends [never]
		? ParamsOfExpr<R, C> | ParamEntry<ParamN<L>, SibSlot<Sib<R, C>, K>>
		: ParamEntry<ParamN<L>, BothSlot<K>> | ParamEntry<ParamN<R>, BothSlot<K>>;
type SibSlot<S, K> = K extends boolean ? Use<S, K> : Info<NumParam<S>, false>;
type BothSlot<K> = K extends boolean
	? Info<"unknown", K>
	: Info<"double", false>;

type FixedPair<L extends Expr, R extends Expr, C extends MyCtx, T> =
	| Slot<L, C, T>
	| Slot<R, C, T>;
export type Slot<E, C extends MyCtx, T> = E extends unknown
	? [ParamN<E>] extends [never]
		? ParamsOfExpr<E, C>
		: ParamEntry<ParamN<E>, T>
	: never;

type NumParam<S> = S extends ColInfo
	? Cat<S["type"]> extends "int" | "bit"
		? "bigint"
		: Cat<S["type"]> extends "decimal"
			? "decimal"
			: Cat<S["type"]> extends "temporal"
				? S["type"]
				: "double"
	: "double";

type ListParams<
	L extends readonly Expr[],
	C extends MyCtx,
	Nullable extends boolean,
	Fixed = null,
> = (Fixed extends ColInfo ? Fixed : FirstSib<L, C, 0>) extends infer S
	? FnArgs<L, C, never, readonly Use<S, Nullable>[]>
	: never;
type FirstSib<
	L extends readonly Expr[],
	C extends MyCtx,
	I extends number,
> = L[I] extends infer E extends Expr
	? [ParamN<E>] extends [never]
		? Sib<E, C> extends infer S
			? S extends ColInfo
				? S
				: FirstSib<L, C, Next<I>>
			: never
		: FirstSib<L, C, Next<I>>
	: null;
export type ParamsOfList<L extends readonly Expr[], C extends MyCtx> = FnArgs<
	L,
	C,
	never,
	readonly Info<"unknown", true>[]
>;

type InSubParams<L extends Expr, Q extends SelectStmt, C extends MyCtx> =
	| ([ParamN<L>] extends [never]
			? ParamsOfExpr<L, C>
			: ParamEntry<
					ParamN<L>,
					SubqueryCol<Q, C> extends infer S extends ColInfo
						? Info<S["type"], false>
						: Info<"unknown", false>
				>)
	| ParamsOfSelect<Q, C>;

type CaseParams<E extends CaseExpr, C extends MyCtx> = (
	E["operand"] extends Expr
		? E["operand"]
		: null
) extends infer Op
	?
			| (Op extends Expr ? ParamsOfExpr<Op, C> : never)
			| CaseLoop<
					E["whens"][number],
					C,
					Op,
					CaseValueType<E, C>
			  > extends infer M2
		? E["else"] extends Expr
			? M2 | Slot<E["else"], C, CaseValueType<E, C>>
			: M2
		: never
	: never;
type CaseValueType<E extends CaseExpr, C extends MyCtx> =
	CaseValues<E["whens"], E["else"], C, 0, []> extends infer L extends
		readonly ColInfo[]
		? Common<L> extends infer T
			? {
					readonly type: T extends "null" ? "unknown" : T;
					readonly nullable: true;
				}
			: never
		: never;
type CaseValues<
	Ws extends readonly unknown[],
	Else,
	C extends MyCtx,
	I extends number,
	Acc extends readonly ColInfo[],
> = Ws[I] extends { readonly then: infer V extends Expr }
	? CaseValues<
			Ws,
			Else,
			C,
			Next<I>,
			Sib<V, C> extends infer S extends ColInfo ? [...Acc, S] : Acc
		>
	: Else extends Expr
		? Sib<Else, C> extends infer S extends ColInfo
			? [...Acc, S]
			: Acc
		: Acc;
type CaseLoop<Branch, C extends MyCtx, Op, VT> = Branch extends {
	readonly when: infer W extends Expr;
	readonly then: infer V extends Expr;
}
	?
			| Slot<V, C, VT>
			| ([ParamN<W>] extends [never]
					? ParamsOfExpr<W, C>
					: ParamEntry<
							ParamN<W>,
							Op extends Expr ? Use<Sib<Op, C>, false> : Info<"bool", true>
						>)
	: never;

type CallParams<E extends Call, C extends MyCtx> =
	| FnArgs<E["args"], C, never, CallSlots<E, C>>
	| ParamsOfList<E["order"], C>
	| (E["over"] extends {
			readonly partition: infer P extends readonly Expr[];
			readonly order: infer O extends readonly Expr[];
	  }
			? ParamsOfList<[...P, ...O], C>
			: never);
type CallSlots<E extends Call, C extends MyCtx> =
	DeclaredFn<C["db"], E["name"], FunctionCatalog> extends infer D extends {}
		? SigSlots<PickSig<D, E["args"]["length"]>, E["args"]>
		: E["name"] extends keyof Functions
			? Functions[E["name"]] extends { readonly args: infer A }
				? A extends readonly unknown[]
					? A
					: A extends "same"
						? readonly Info<
								FirstSib<E["args"], C, 0> extends infer S extends ColInfo
									? S["type"]
									: "unknown",
								true
							>[]
						: IfSlots<E["args"], C>
				: readonly Info<"unknown", true>[]
			: readonly Info<"unknown", true>[];

export type FnArgs<
	L extends readonly Expr[],
	C extends MyCtx,
	M,
	Ts extends readonly unknown[],
	I extends number = 0,
> = L[I] extends infer E extends Expr
	? FnArgs<
			L,
			C,
			M | Slot<E, C, Ts[I] extends ColInfo ? Ts[I] : Info<"unknown", true>>,
			Ts,
			Next<I>
		>
	: M;

/** `IF(cond, a, b)`: a boolean, then the common type of the two values. */
type IfSlots<L extends readonly Expr[], C extends MyCtx> = L extends readonly [
	Expr,
	Expr,
	Expr,
]
	? [
			Info<"bool", true>,
			Info<IfValueType<L, C, 1, []>, true>,
			Info<IfValueType<L, C, 1, []>, true>,
		]
	: readonly Info<"unknown", true>[];
type IfValueType<
	L extends readonly Expr[],
	C extends MyCtx,
	I extends number,
	Acc extends readonly ColInfo[],
> = L[I] extends infer E extends Expr
	? IfValueType<
			L,
			C,
			Next<I>,
			Sib<E, C> extends infer S extends ColInfo ? [...Acc, S] : Acc
		>
	: Common<Acc> extends infer T
		? T extends "null"
			? "unknown"
			: T
		: never;

export type ParamsOfTargets<
	Ts extends readonly Target[],
	C extends MyCtx,
> = TargetParams<Ts[number], C>;
type TargetParams<T, C extends MyCtx> = T extends {
	readonly t: "expr";
	readonly e: infer E extends Expr;
}
	? Slot<E, C, Info<"unknown", true>>
	: never;

export type ParamsOfSelect<
	Q extends SelectStmt,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
> = Q extends unknown
	? BindWith<Q["with"], Env> extends infer C2 extends MyCteMap
		?
				| ParamsOfBody<
						Q["body"],
						QueryContext<Env["db"], Env["scope"], C2>,
						Q["orderBy"]
				  >
				| ParamsOfWith<Q["with"], QueryContext<Env["db"], Env["scope"], C2>>
				| LimitParams<Q["offset"]>
				| LimitParams<Q["limit"]>
		: never
	: never;

export type LimitParams<E> = E extends Expr
	? Slot<E, Ctx<{}, [], {}>, Info<"limit", false>>
	: never;

type ParamsOfWith<
	W,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
> = W extends {
	readonly ctes: infer L extends readonly { readonly q: SelectStmt }[];
}
	? ParamsOfSelect<L[number]["q"], Env>
	: never;

type ParamsOfBody<
	B extends SelectBody,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	OrderBy extends readonly Expr[],
> = B extends { readonly t: "simple" }
	? ParamsOfSimple<Extract<B, SimpleSelect>, Env, OrderBy>
	: B extends { readonly t: "values" }
		? ValuesParams<B["rows"], Ctx<Env["db"], Env["scope"], Env["ctes"]>>
		: B extends { readonly t: "setop" }
			? ParamsOfBody<B["l"], Env, []> | ParamsOfBody<B["r"], Env, []>
			: B extends { readonly t: "nested" }
				? ParamsOfSelect<B["q"], Env>
				: never;

type ValuesParams<
	Rows extends readonly (readonly Expr[])[],
	C extends MyCtx,
> = Slot<Rows[number][number], C, Info<"unknown", true>>;

export type ParamsOfFrom<
	F,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
> = FromParams<F, Env, []>;

/** `Sofar`: the items to the left in the same FROM, which LATERAL and JSON_TABLE see. */
type FromParams<
	F,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	Sofar extends MyLevel,
> = F extends FromItem
	? F extends { readonly t: "sub" }
		? ParamsOfSelect<
				F["q"],
				F["lateral"] extends true
					? QueryContext<Env["db"], [Sofar, ...Env["scope"]], Env["ctes"]>
					: Env
			>
		: F extends { readonly t: "jsontable" }
			? Slot<
					F["doc"],
					Ctx<Env["db"], [Sofar, ...Env["scope"]], Env["ctes"]>,
					Info<"json", false>
				>
			: F extends { readonly t: "join" }
				?
						| FromParams<F["l"], Env, Sofar>
						| FromParams<
								F["r"],
								Env,
								BindFrom<F["l"], Env> extends infer LL extends MyLevel
									? [...Sofar, ...LL]
									: Sofar
						  >
						| (F["on"] extends Expr
								? BindFrom<F, Env> extends infer L extends MyLevel
									?
											| BoolParam<F["on"]>
											| ParamsOfExpr<
													F["on"],
													Ctx<Env["db"], [L, ...Env["scope"]], Env["ctes"]>
											  >
									: never
								: never)
				: never
	: never;

type ParamsOfSimple<
	S extends SimpleSelect,
	Env extends QueryContext<unknown, Scope, MyCteMap>,
	OrderBy extends readonly Expr[],
> =
	ParamsOfFrom<S["from"], Env> extends infer M1
		? BindFrom<S["from"], Env> extends infer L
			? L extends MyLevel
				? Ctx<
						Env["db"],
						[L, ...Env["scope"]],
						Env["ctes"]
					> extends infer C extends MyCtx
					?
							| M1
							| ParamsOfOpt<S["where"] | S["having"], C>
							| ParamsOfList<
									[
										...(S["groupBy"] extends readonly Expr[]
											? S["groupBy"]
											: []),
										...OrderBy,
									],
									C
							  >
							| ParamsOfTargets<S["targets"], C>
					: never
				: M1
			: never
		: never;

export type ParamsOfOpt<E, C extends MyCtx> = E extends Expr
	? Slot<E, C, Info<"bool", true>>
	: never;
