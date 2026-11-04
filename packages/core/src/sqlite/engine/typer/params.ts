import type { NullTest, ParamEntry } from "../../../engine/params.js";
import type { Nx } from "../../../engine/parse.js";
import type { ColInfo, QueryContext, Scope } from "../../../engine/types.js";
import type {
	Expr,
	FromItem,
	SelectBody,
	SelectStmt,
	SimpleSelect,
	Target,
} from "../ast.js";
import type { BindFrom } from "../binder/scope.js";
import type { BindWith } from "../project/select.js";
import type { Affinity, MkCtx, SqCteMap, SqCtx, SqLevel } from "../types.js";
import type { DeclaredFn, PickSig, SigArgType } from "./functions.js";
import type { Common, Info, SubqueryCol, TypeOf } from "./typeof.js";

type Ctx<DB, S extends Scope, Ctes extends SqCteMap> = MkCtx<
	DB,
	S,
	Ctes,
	"group"
>;

type ParamN<E> = E extends {
	readonly t: "param";
	readonly n: infer N extends number;
}
	? N
	: E extends {
				readonly t: "collate" | "un";
				readonly op?: "+";
				readonly e: infer X;
			}
		? X extends { readonly t: "param"; readonly n: infer N extends number }
			? E extends { readonly t: "un"; readonly op: infer O }
				? O extends "+"
					? N
					: never
				: N
			: never
		: never;

type Sib<E extends Expr, C extends SqCtx> = E extends {
	readonly t: "param" | "null";
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

type Comparison = "=" | "!=" | "<" | ">" | "<=" | ">=";

export type ParamsOfExpr<E, C extends SqCtx> = E extends {
	readonly t:
		| "col"
		| "num"
		| "str"
		| "blob"
		| "bool"
		| "null"
		| "ctime"
		| "param";
}
	? never
	: E extends Expr
		? ParamsComplex<E, C>
		: never;

type ParamsComplex<E extends Expr, C extends SqCtx> = E extends {
	readonly t: "bin";
}
	? ParamsOfBin<E["op"], E["l"], E["r"], C>
	: E extends { readonly t: "un" }
		? Slot<
				E["e"],
				C,
				E["op"] extends "-" ? Info<"numeric", false> : Info<"integer", true>
			>
		: E extends { readonly t: "cast" }
			? Slot<E["e"], C, Info<CastParam<Lowercase<E["to"]>>, false>>
			: E extends { readonly t: "collate" }
				? Slot<E["e"], C, Info<"text", false>>
				: E extends { readonly t: "is" }
					? Slot<E["e"], C, NullTest>
					: E extends { readonly t: "isdistinct" }
						? PairParams<E["l"], E["r"], C, true>
						: E extends { readonly t: "between" }
							? ListParams<[E["e"], E["lo"], E["hi"]], C, false>
							: E extends { readonly t: "in" }
								? ListParams<[E["e"], ...E["list"]], C, false>
								: E extends { readonly t: "insub" }
									? InSubParams<E["e"], E["q"], C>
									: E extends { readonly t: "intable" }
										? ParamsOfList<
												E["args"] extends readonly Expr[]
													? [E["e"], ...E["args"]]
													: [E["e"]],
												C
											>
										: E extends { readonly t: "like" }
											? ListParams<
													E["esc"] extends Expr
														? [E["e"], E["pat"], E["esc"]]
														: [E["e"], E["pat"]],
													C,
													false,
													Info<"text", false>
												>
											: E extends { readonly t: "case" }
												? CaseParams<E, C>
												: E extends { readonly t: "call" }
													? CallParams<E, C>
													: E extends { readonly t: "sub" | "exists" }
														? ParamsOfSelect<E["q"], C>
														: E extends { readonly t: "row" }
															? ParamsOfList<E["items"], C>
															: never;

type CastParam<To extends string> = To extends ""
	? "unknown"
	: Affinity<To> extends "any"
		? "numeric"
		: Affinity<To>;

type ParamsOfBin<
	Op,
	L extends Expr,
	R extends Expr,
	C extends SqCtx,
> = Op extends "and" | "or"
	? BoolParam<R> | BoolParam<L> | ParamsOfExpr<L | R, C>
	: Op extends Comparison
		? L extends { readonly t: "row" }
			? R extends { readonly t: "row" }
				? RowPairs<L["items"], R["items"], C, never, 0>
				: ParamsOfList<L["items"], C> | ParamsOfExpr<R, C>
			: PairParams<L, R, C, false>
		: Op extends "||" | "->" | "->>"
			? FixedPair<L, R, C, Info<"text", false>>
			: Op extends "&" | "|" | "<<" | ">>"
				? FixedPair<L, R, C, Info<"integer", false>>
				: PairParams<L, R, C, "num">;

type BoolParam<E> = [ParamN<E>] extends [never]
	? never
	: ParamEntry<ParamN<E>, Info<"integer", true>>;

type RowPairs<
	L extends readonly Expr[],
	R extends readonly Expr[],
	C extends SqCtx,
	M,
	I extends number,
> = L[I] extends infer A extends Expr
	? R[I] extends infer B extends Expr
		? RowPairs<L, R, C, M | PairParams<A, B, C, false>, Nx<I>>
		: M
	: M;

type PairParams<
	L extends Expr,
	R extends Expr,
	C extends SqCtx,
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
	: Info<"numeric", false>;

type FixedPair<L extends Expr, R extends Expr, C extends SqCtx, T> =
	| Slot<L, C, T>
	| Slot<R, C, T>;
export type Slot<E, C extends SqCtx, T> = E extends unknown
	? [ParamN<E>] extends [never]
		? ParamsOfExpr<E, C>
		: ParamEntry<ParamN<E>, T>
	: never;

type NumParam<S> = S extends ColInfo
	? Affinity<S["type"]> extends infer A
		? A extends "integer" | "real"
			? A
			: "numeric"
		: never
	: "numeric";

type ListParams<
	L extends readonly Expr[],
	C extends SqCtx,
	Nullable extends boolean,
	Fixed = null,
> = (Fixed extends ColInfo ? Fixed : FirstSib<L, C, 0>) extends infer S
	? FnArgs<L, C, never, readonly Use<S, Nullable>[]>
	: never;
type FirstSib<
	L extends readonly Expr[],
	C extends SqCtx,
	I extends number,
> = L[I] extends infer E extends Expr
	? [ParamN<E>] extends [never]
		? Sib<E, C> extends infer S
			? S extends ColInfo
				? S
				: FirstSib<L, C, Nx<I>>
			: never
		: FirstSib<L, C, Nx<I>>
	: null;
export type ParamsOfList<L extends readonly Expr[], C extends SqCtx> = FnArgs<
	L,
	C,
	never,
	readonly Info<"unknown", true>[]
>;

type InSubParams<L extends Expr, Q extends SelectStmt, C extends SqCtx> =
	| ([ParamN<L>] extends [never]
			? ParamsOfExpr<L, C>
			: ParamEntry<
					ParamN<L>,
					SubqueryCol<Q, C> extends infer S extends ColInfo
						? Info<S["type"], false>
						: Info<"unknown", false>
				>)
	| ParamsOfSelect<Q, C>;

type CaseParams<E extends Expr, C extends SqCtx> = (
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
type CaseValueType<E extends Expr, C extends SqCtx> =
	CaseValues<E["whens"], E["else"], C, 0, []> extends infer L extends
		readonly ColInfo[]
		? Common<L> extends infer T extends string
			? {
					readonly type: T extends "null" ? "unknown" : T;
					readonly nullable: true;
				}
			: never
		: never;
type CaseValues<
	Ws extends readonly unknown[],
	Else,
	C extends SqCtx,
	I extends number,
	Acc extends readonly ColInfo[],
> = Ws[I] extends { readonly then: infer V extends Expr }
	? CaseValues<
			Ws,
			Else,
			C,
			Nx<I>,
			Sib<V, C> extends infer S extends ColInfo ? [...Acc, S] : Acc
		>
	: Else extends Expr
		? Sib<Else, C> extends infer S extends ColInfo
			? [...Acc, S]
			: Acc
		: Acc;
type CaseLoop<Branch, C extends SqCtx, Op, VT> = Branch extends {
	readonly when: infer W extends Expr;
	readonly then: infer V extends Expr;
}
	?
			| Slot<V, C, VT>
			| ([ParamN<W>] extends [never]
					? ParamsOfExpr<W, C>
					: ParamEntry<
							ParamN<W>,
							Op extends Expr ? Use<Sib<Op, C>, false> : Info<"integer", true>
						>)
	: never;

type TextFns =
	| "lower"
	| "upper"
	| "ltrim"
	| "rtrim"
	| "trim"
	| "replace"
	| "instr"
	| "like"
	| "glob"
	| "unicode"
	| "unhex"
	| "soundex"
	| "concat"
	| "concat_ws"
	| "format"
	| "printf"
	| "group_concat"
	| "string_agg";
type NumFns =
	| "abs"
	| "round"
	| "sign"
	| "ceil"
	| "ceiling"
	| "floor"
	| "trunc"
	| "acos"
	| "acosh"
	| "asin"
	| "asinh"
	| "atan"
	| "atan2"
	| "atanh"
	| "cos"
	| "cosh"
	| "degrees"
	| "exp"
	| "ln"
	| "log"
	| "log10"
	| "log2"
	| "mod"
	| "pow"
	| "power"
	| "radians"
	| "sin"
	| "sinh"
	| "sqrt"
	| "tan"
	| "tanh"
	| "zeroblob"
	| "randomblob"
	| "ntile"
	| "sum"
	| "total"
	| "avg";
type SameFns = "coalesce" | "ifnull" | "nullif" | "max" | "min";

type CallParams<E extends Expr, C extends SqCtx> =
	| ParamsOfExpr<E["filter"], C>
	| FnArgs<E["args"], C, never, CallSlots<E, C>>
	| ParamsOfList<E["order"], C>
	| (E["over"] extends {
			readonly partition: infer P extends readonly Expr[];
			readonly order: infer O extends readonly Expr[];
	  }
			? ParamsOfList<[...P, ...O], C>
			: never);
type CallSlots<E extends Expr, C extends SqCtx> =
	DeclaredFn<C["db"], E["name"]> extends infer D extends {}
		? SigSlots<PickSig<D, E["args"]["length"]>, E["args"]>
		: E["name"] extends SameFns
			? readonly Info<
					FirstSib<E["args"], C, 0> extends infer S extends ColInfo
						? S["type"]
						: "unknown",
					true
				>[]
			: E["name"] extends "iif" | "if"
				? IifSlots<E["args"], Info<IifValueType<E["args"], C, 1, []>, true>>
				: E["name"] extends "substr" | "substring"
					? [Info<"text", true>, Info<"integer", true>, Info<"integer", true>]
					: E["name"] extends "lag" | "lead" | "nth_value"
						? [
								Info<"unknown", true>,
								Info<"integer", false>,
								Info<"unknown", true>,
							]
						: E["name"] extends
									| "json_extract"
									| "jsonb_extract"
									| "json_type"
									| "json_array_length"
									| "json_remove"
									| "jsonb_remove"
									| "json_valid"
									| "json"
									| "jsonb"
									| "json_patch"
									| "jsonb_patch"
									| "json_pretty"
							? [Info<"json", true>, ...Info<"text", true>[]]
							: E["name"] extends TextFns
								? readonly Info<"text", true>[]
								: E["name"] extends NumFns
									? readonly Info<"numeric", true>[]
									: readonly Info<"unknown", true>[];

type SigSlots<
	S,
	L extends readonly unknown[],
	Acc extends readonly unknown[] = [],
> = Acc["length"] extends L["length"]
	? Acc
	: SigSlots<S, L, [...Acc, Info<SigArgType<S, Acc["length"]>, true>]>;

export type FnArgs<
	L extends readonly Expr[],
	C extends SqCtx,
	M,
	Ts extends readonly unknown[],
	I extends number = 0,
> = L[I] extends infer E extends Expr
	? FnArgs<
			L,
			C,
			M | Slot<E, C, Ts[I] extends ColInfo ? Ts[I] : Info<"unknown", true>>,
			Ts,
			Nx<I>
		>
	: M;

type IifValueType<
	L extends readonly Expr[],
	C extends SqCtx,
	I extends number,
	Acc extends readonly ColInfo[],
> = L[I] extends infer E extends Expr
	? IifValueType<
			L,
			C,
			Nx<Nx<I>>,
			Sib<E, C> extends infer S extends ColInfo ? [...Acc, S] : Acc
		>
	: Common<Acc>;
type IifSlots<
	L extends readonly Expr[],
	V,
	Acc extends readonly unknown[] = [],
> = Acc["length"] extends L["length"]
	? Acc
	: IifSlots<
			L,
			V,
			[
				...Acc,
				IsCond<L, Acc["length"]> extends true ? Info<"integer", true> : V,
			]
		>;
type IsCond<L extends readonly Expr[], I extends number> = I extends
	| 0
	| 2
	| 4
	| 6
	| 8
	| 10
	? L[Nx<I>] extends Expr
		? true
		: false
	: false;

export type ParamsOfTargets<
	Ts extends readonly Target[],
	C extends SqCtx,
> = TargetParams<Ts[number], C>;
type TargetParams<T, C extends SqCtx> = T extends {
	readonly t: "expr";
	readonly e: infer E extends Expr;
}
	? Slot<E, C, Info<"unknown", true>>
	: never;

export type ParamsOfSelect<
	Q extends SelectStmt,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = Q extends unknown
	? BindWith<Q["with"], Env> extends infer C2 extends SqCteMap
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

type LimitParams<E> = E extends Expr
	? Slot<E, Ctx<{}, [], {}>, Info<"integer", false>>
	: never;

type ParamsOfWith<
	W,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = W extends {
	readonly ctes: infer L extends readonly { readonly q: SelectStmt }[];
}
	? WithLoop<L, Env>
	: never;
type WithLoop<
	L extends readonly { readonly q: SelectStmt }[],
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = ParamsOfSelect<L[number]["q"], Env>;

type ParamsOfBody<
	B extends SelectBody,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	OrderBy extends readonly Expr[],
> = B extends { readonly t: "simple" }
	? ParamsOfSimple<Extract<B, SimpleSelect>, Env, OrderBy>
	: B extends { readonly t: "values" }
		? ValuesParams<B["rows"], Ctx<Env["db"], Env["scope"], Env["ctes"]>>
		: B extends { readonly t: "setop" }
			? ParamsOfBody<B["l"], Env, []> | ParamsOfBody<B["r"], Env, []>
			: never;

type ValuesParams<
	Rows extends readonly (readonly Expr[])[],
	C extends SqCtx,
> = Slot<Rows[number][number], C, Info<"unknown", true>>;

export type ParamsOfFrom<
	F,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = F extends FromItem
	? F extends { readonly t: "sub" }
		? ParamsOfSelect<F["q"], Env>
		: F extends { readonly t: "func" }
			? ParamsOfList<F["args"], Ctx<Env["db"], Env["scope"], Env["ctes"]>>
			: F extends { readonly t: "join" }
				? ParamsOfFrom<F["l"], Env> | ParamsOfFrom<F["r"], Env> extends infer M1
					? F["on"] extends Expr
						? BindFrom<F, Env> extends infer L extends SqLevel
							?
									| M1
									| BoolParam<F["on"]>
									| ParamsOfExpr<
											F["on"],
											Ctx<Env["db"], [L, ...Env["scope"]], Env["ctes"]>
									  >
							: M1
						: M1
					: never
				: never
	: never;

type ParamsOfSimple<
	S extends SimpleSelect,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	OrderBy extends readonly Expr[],
> =
	ParamsOfFrom<S["from"], Env> extends infer M1
		? BindFrom<S["from"], Env> extends infer L
			? L extends SqLevel
				? Ctx<
						Env["db"],
						[L, ...Env["scope"]],
						Env["ctes"]
					> extends infer C extends SqCtx
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

export type ParamsOfOpt<E, C extends SqCtx> = E extends Expr
	? Slot<E, C, Info<"integer", true>>
	: never;
