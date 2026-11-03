import type { AddParam, NullTest } from "../../../engine/params.js";
import type { Nx } from "../../../engine/parse.js";
import type { ColInfo, Scope } from "../../../engine/types.js";
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

export type ParamsOfExpr<E, C extends SqCtx, M> = E extends {
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
	? M
	: E extends Expr
		? ParamsComplex<E, C, M>
		: M;

type ParamsComplex<E extends Expr, C extends SqCtx, M> = E extends {
	readonly t: "bin";
}
	? ParamsOfBin<E["op"], E["l"], E["r"], C, M>
	: E extends { readonly t: "un" }
		? Slot<
				E["e"],
				C,
				M,
				E["op"] extends "-" ? Info<"numeric", false> : Info<"integer", true>
			>
		: E extends { readonly t: "cast" }
			? Slot<E["e"], C, M, Info<CastParam<Lowercase<E["to"]>>, false>>
			: E extends { readonly t: "collate" }
				? Slot<E["e"], C, M, Info<"text", false>>
				: E extends { readonly t: "is" }
					? Slot<E["e"], C, M, NullTest>
					: E extends { readonly t: "isdistinct" }
						? PairParams<E["l"], E["r"], C, M, true>
						: E extends { readonly t: "between" }
							? ListParams<[E["e"], E["lo"], E["hi"]], C, M, false>
							: E extends { readonly t: "in" }
								? ListParams<[E["e"], ...E["list"]], C, M, false>
								: E extends { readonly t: "insub" }
									? InSubParams<E["e"], E["q"], C, M>
									: E extends { readonly t: "intable" }
										? ParamsOfList<
												E["args"] extends readonly Expr[]
													? [E["e"], ...E["args"]]
													: [E["e"]],
												C,
												M
											>
										: E extends { readonly t: "like" }
											? ListParams<
													E["esc"] extends Expr
														? [E["e"], E["pat"], E["esc"]]
														: [E["e"], E["pat"]],
													C,
													M,
													false,
													Info<"text", false>
												>
											: E extends { readonly t: "case" }
												? CaseParams<E, C, M>
												: E extends { readonly t: "call" }
													? CallParams<E, C, M>
													: E extends { readonly t: "sub" | "exists" }
														? ParamsOfSelect<
																E["q"],
																C["db"],
																C["scope"],
																C["ctes"],
																M
															>
														: E extends { readonly t: "row" }
															? ParamsOfList<E["items"], C, M>
															: M;

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
	M,
> = Op extends "and" | "or"
	? ParamsOfExpr<R, C, ParamsOfExpr<L, C, BoolParam<L, BoolParam<R, M>>>>
	: Op extends Comparison
		? L extends { readonly t: "row" }
			? R extends { readonly t: "row" }
				? RowPairs<L["items"], R["items"], C, M, 0>
				: ParamsOfExpr<R, C, ParamsOfList<L["items"], C, M>>
			: PairParams<L, R, C, M, false>
		: Op extends "||" | "->" | "->>"
			? FixedPair<L, R, C, M, Info<"text", false>>
			: Op extends "&" | "|" | "<<" | ">>"
				? FixedPair<L, R, C, M, Info<"integer", false>>
				: PairParams<L, R, C, M, "num">;

type BoolParam<E, M> = [ParamN<E>] extends [never]
	? M
	: AddParam<M, ParamN<E>, Info<"integer", true>>;

type RowPairs<
	L extends readonly Expr[],
	R extends readonly Expr[],
	C extends SqCtx,
	M,
	I extends number,
> = L[I] extends infer A extends Expr
	? R[I] extends infer B extends Expr
		? RowPairs<L, R, C, PairParams<A, B, C, M, false>, Nx<I>>
		: M
	: M;

type PairParams<
	L extends Expr,
	R extends Expr,
	C extends SqCtx,
	M,
	K extends boolean | "num",
> = [ParamN<L>] extends [never]
	? [ParamN<R>] extends [never]
		? ParamsOfExpr<R, C, ParamsOfExpr<L, C, M>>
		: AddParam<ParamsOfExpr<L, C, M>, ParamN<R>, SibSlot<Sib<L, C>, K>>
	: [ParamN<R>] extends [never]
		? AddParam<ParamsOfExpr<R, C, M>, ParamN<L>, SibSlot<Sib<R, C>, K>>
		: AddParam<AddParam<M, ParamN<L>, BothSlot<K>>, ParamN<R>, BothSlot<K>>;
type SibSlot<S, K> = K extends boolean ? Use<S, K> : Info<NumParam<S>, false>;
type BothSlot<K> = K extends boolean
	? Info<"unknown", K>
	: Info<"numeric", false>;

type FixedPair<L extends Expr, R extends Expr, C extends SqCtx, M, T> = Slot<
	R,
	C,
	Slot<L, C, M, T>,
	T
>;
export type Slot<E, C extends SqCtx, M, T> = [ParamN<E>] extends [never]
	? ParamsOfExpr<E, C, M>
	: AddParam<M, ParamN<E>, T>;

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
	M,
	Nullable extends boolean,
	Fixed = null,
> = (Fixed extends ColInfo ? Fixed : FirstSib<L, C, 0>) extends infer S
	? FnArgs<L, C, M, readonly Use<S, Nullable>[]>
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
export type ParamsOfList<
	L extends readonly Expr[],
	C extends SqCtx,
	M,
> = FnArgs<L, C, M, readonly Info<"unknown", true>[]>;

type InSubParams<
	L extends Expr,
	Q extends SelectStmt,
	C extends SqCtx,
	M,
> = ParamsOfSelect<
	Q,
	C["db"],
	C["scope"],
	C["ctes"],
	[ParamN<L>] extends [never]
		? ParamsOfExpr<L, C, M>
		: AddParam<
				M,
				ParamN<L>,
				SubqueryCol<Q, C> extends infer S extends ColInfo
					? Info<S["type"], false>
					: Info<"unknown", false>
			>
>;

type CaseParams<E extends Expr, C extends SqCtx, M> = (
	E["operand"] extends Expr
		? E["operand"]
		: null
) extends infer Op
	? CaseLoop<
			E["whens"],
			C,
			Op,
			CaseValueType<E, C>,
			Op extends Expr ? ParamsOfExpr<Op, C, M> : M,
			0
		> extends infer M2
		? E["else"] extends Expr
			? Slot<E["else"], C, M2, CaseValueType<E, C>>
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
type CaseLoop<
	Ws extends readonly unknown[],
	C extends SqCtx,
	Op,
	VT,
	M,
	I extends number,
> = Ws[I] extends {
	readonly when: infer W extends Expr;
	readonly then: infer V extends Expr;
}
	? CaseLoop<
			Ws,
			C,
			Op,
			VT,
			Slot<V, C, M, VT> extends infer M1
				? [ParamN<W>] extends [never]
					? ParamsOfExpr<W, C, M1>
					: AddParam<
							M1,
							ParamN<W>,
							Op extends Expr ? Use<Sib<Op, C>, false> : Info<"integer", true>
						>
				: never,
			Nx<I>
		>
	: M;

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

type CallParams<E extends Expr, C extends SqCtx, M> = (
	E["filter"] extends Expr
		? ParamsOfExpr<E["filter"], C, M>
		: M
) extends infer M1
	? ParamsOfList<
			E["order"],
			C,
			DeclaredFn<C["db"], E["name"]> extends infer D extends {}
				? FnArgs<
						E["args"],
						C,
						M1,
						SigSlots<PickSig<D, E["args"]["length"]>, E["args"]>
					>
				: E["name"] extends SameFns
					? FnArgs<
							E["args"],
							C,
							M1,
							readonly Info<
								FirstSib<E["args"], C, 0> extends infer S extends ColInfo
									? S["type"]
									: "unknown",
								true
							>[]
						>
					: E["name"] extends "iif" | "if"
						? IifParams<E["args"], C, M1>
						: E["name"] extends "substr" | "substring"
							? FnArgs<
									E["args"],
									C,
									M1,
									[
										Info<"text", true>,
										Info<"integer", true>,
										Info<"integer", true>,
									]
								>
							: E["name"] extends "lag" | "lead" | "nth_value"
								? FnArgs<
										E["args"],
										C,
										M1,
										[
											Info<"unknown", true>,
											Info<"integer", false>,
											Info<"unknown", true>,
										]
									>
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
									? FnArgs<
											E["args"],
											C,
											M1,
											[Info<"json", true>, ...Info<"text", true>[]]
										>
									: E["name"] extends TextFns
										? FnArgs<E["args"], C, M1, readonly Info<"text", true>[]>
										: E["name"] extends NumFns
											? FnArgs<
													E["args"],
													C,
													M1,
													readonly Info<"numeric", true>[]
												>
											: ParamsOfList<E["args"], C, M1>
		> extends infer M2
		? E["over"] extends {
				readonly partition: infer P extends readonly Expr[];
				readonly order: infer O extends readonly Expr[];
			}
			? ParamsOfList<[...P, ...O], C, M2>
			: M2
		: never
	: never;

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
			Slot<E, C, M, Ts[I] extends ColInfo ? Ts[I] : Info<"unknown", true>>,
			Ts,
			Nx<I>
		>
	: M;

type IifParams<L extends readonly Expr[], C extends SqCtx, M> = FnArgs<
	L,
	C,
	M,
	IifSlots<L, Info<IifValueType<L, C, 1, []>, true>>
>;
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
	M,
	I extends number = 0,
> = Ts[I] extends infer T
	? T extends { readonly t: "expr"; readonly e: infer E extends Expr }
		? ParamsOfTargets<Ts, C, Slot<E, C, M, Info<"unknown", true>>, Nx<I>>
		: T extends Target
			? ParamsOfTargets<Ts, C, M, Nx<I>>
			: M
	: M;

export type ParamsOfSelect<
	Q extends SelectStmt,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	M,
> =
	BindWith<Q["with"], DB, Outer, Ctes> extends infer C2
		? C2 extends SqCteMap
			? ParamsOfWith<
					Q["with"],
					DB,
					Outer,
					C2,
					ParamsOfBody<Q["body"], DB, Outer, C2, Q["orderBy"], M>
				> extends infer M1
				? LimitParams<Q["limit"], LimitParams<Q["offset"], M1>>
				: never
			: M
		: M;

type LimitParams<E, M> = E extends Expr
	? Slot<E, Ctx<{}, [], {}>, M, Info<"integer", false>>
	: M;

type ParamsOfWith<
	W,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	M,
> = W extends {
	readonly ctes: infer L extends readonly { readonly q: SelectStmt }[];
}
	? WithLoop<L, DB, Outer, Ctes, M, 0>
	: M;
type WithLoop<
	L extends readonly { readonly q: SelectStmt }[],
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	M,
	I extends number,
> = L[I] extends { readonly q: infer Q extends SelectStmt }
	? WithLoop<L, DB, Outer, Ctes, ParamsOfSelect<Q, DB, Outer, Ctes, M>, Nx<I>>
	: M;

type ParamsOfBody<
	B extends SelectBody,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	OrderBy extends readonly Expr[],
	M,
> = B extends { readonly t: "simple" }
	? ParamsOfSimple<Extract<B, SimpleSelect>, DB, Outer, Ctes, OrderBy, M>
	: B extends { readonly t: "values" }
		? ValuesParams<B["rows"], Ctx<DB, Outer, Ctes>, M, 0>
		: B extends { readonly t: "setop" }
			? ParamsOfBody<
					B["r"],
					DB,
					Outer,
					Ctes,
					[],
					ParamsOfBody<B["l"], DB, Outer, Ctes, [], M>
				>
			: M;

type ValuesParams<
	Rows extends readonly (readonly Expr[])[],
	C extends SqCtx,
	M,
	I extends number,
> = Rows[I] extends infer R extends readonly Expr[]
	? ValuesParams<Rows, C, ParamsOfList<R, C, M>, Nx<I>>
	: M;

export type ParamsOfFrom<
	F,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	M,
> = F extends FromItem
	? F extends { readonly t: "sub" }
		? ParamsOfSelect<F["q"], DB, Outer, Ctes, M>
		: F extends { readonly t: "func" }
			? ParamsOfList<F["args"], Ctx<DB, Outer, Ctes>, M>
			: F extends { readonly t: "join" }
				? ParamsOfFrom<
						F["r"],
						DB,
						Outer,
						Ctes,
						ParamsOfFrom<F["l"], DB, Outer, Ctes, M>
					> extends infer M1
					? F["on"] extends Expr
						? BindFrom<F, DB, Outer, Ctes> extends infer L extends SqLevel
							? ParamsOfExpr<
									F["on"],
									Ctx<DB, [L, ...Outer], Ctes>,
									BoolParam<F["on"], M1>
								>
							: M1
						: M1
					: never
				: M
	: M;

type ParamsOfSimple<
	S extends SimpleSelect,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	OrderBy extends readonly Expr[],
	M,
> =
	ParamsOfFrom<S["from"], DB, Outer, Ctes, M> extends infer M1
		? BindFrom<S["from"], DB, Outer, Ctes> extends infer L
			? L extends SqLevel
				? Ctx<DB, [L, ...Outer], Ctes> extends infer C extends SqCtx
					? ParamsOfTargets<
							S["targets"],
							C,
							ParamsOfList<
								[
									...(S["groupBy"] extends readonly Expr[] ? S["groupBy"] : []),
									...OrderBy,
								],
								C,
								ParamsOfOpt<S["having"], C, ParamsOfOpt<S["where"], C, M1>>
							>
						>
					: never
				: M1
			: never
		: never;

export type ParamsOfOpt<E, C extends SqCtx, M> = E extends Expr
	? Slot<E, C, M, Info<"integer", true>>
	: M;
