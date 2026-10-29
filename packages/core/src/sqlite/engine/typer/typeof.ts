import type { Nx } from "../../../engine/parse.js";
import type { ColInfo, Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Call, ColRef, Expr, SelectStmt } from "../ast.js";
import type {
	LookupRelation,
	RelationItem,
	ResolveColumn,
} from "../binder/scope.js";
import type { ProjectSelect } from "../project/select.js";
import type { Affinity, Cell, NumClass, SqCtx, SqItem } from "../types.js";
import type { DeclaredFn, Fn, Functions, PickSig, SigFn } from "./functions.js";
import type { JsonGet, JsonPath, JsonShapeOf, JsonStep } from "./json.js";

export type Info<T, N = false> = {
	readonly type: T;
	readonly nullable: N;
};

export type TypeOf<E extends Expr, C extends SqCtx> = E extends {
	readonly t: "col";
}
	? ResolveColumn<
			C["scope"],
			Extract<E, ColRef>,
			E["disp"],
			C["aliases"]
		> extends infer R
		? R extends {
				readonly type: infer T extends string;
				readonly nullable: infer N;
				readonly n: infer D;
			}
			? { readonly type: T; readonly nullable: N; readonly n: D }
			: R
		: never
	: E extends { readonly t: "num"; readonly v: infer V extends string }
		? Info<NumType<V>>
		: E extends { readonly t: "str" | "ctime" }
			? Info<"text">
			: E extends { readonly t: "blob" }
				? Info<"blob">
				: E extends { readonly t: "bool" }
					? Info<"integer">
					: E extends { readonly t: "null" }
						? Info<"null", true>
						: E extends { readonly t: "param" }
							? Info<"unknown", true>
							: TypeComplex<E, C>;

type NumType<V extends string> = V extends `${"-" | ""}0${"x" | "X"}${string}`
	? "integer"
	: V extends `${string}${"." | "e" | "E"}${string}`
		? "real"
		: "integer";

type TypeComplex<E extends Expr, C extends SqCtx> = E extends {
	readonly t: "bin";
}
	? TypeBin<E["op"], E["l"], E["r"], C>
	: E extends { readonly t: "un" }
		? TypeUn<E["op"], E["e"], C>
		: E extends { readonly t: "cast" }
			? TypeOf<E["e"], C> extends infer X
				? X extends ColInfo
					? Info<CastType<Lowercase<E["to"]>, X["type"]>, X["nullable"]>
					: X
				: never
			: E extends { readonly t: "collate" }
				? TypeOf<E["e"], C> extends infer X
					? X extends ColInfo
						? Info<X["type"], X["nullable"]>
						: X
					: never
				: E extends { readonly t: "call" }
					? TypeCall<Extract<E, Call>, C>
					: E extends { readonly t: "case" }
						? TypeCase<E["operand"], E["whens"], E["else"], C>
						: E extends { readonly t: "is" }
							? Pred<[E["e"]], C, false>
							: E extends { readonly t: "isdistinct" }
								? Pred<[E["l"], E["r"]], C, false>
								: E extends { readonly t: "between" }
									? Pred<[E["e"], E["lo"], E["hi"]], C, true>
									: E extends { readonly t: "like" }
										? TypeLike<E, C>
										: E extends { readonly t: "in" }
											? Pred<[E["e"], ...E["list"]], C, true>
											: E extends { readonly t: "insub" }
												? TypeInSub<E["e"], E["q"], C>
												: E extends { readonly t: "intable" }
													? TypeInTable<E, C>
													: E extends { readonly t: "sub" }
														? SubqueryCol<E["q"], C> extends infer X
															? X extends ColInfo
																? Info<X["type"], true>
																: X
															: never
														: E extends { readonly t: "exists" }
															? ProjectSelect<
																	E["q"],
																	C["db"],
																	C["scope"],
																	C["ctes"]
																> extends infer X
																? X extends AnyErr
																	? X
																	: Info<"integer">
																: never
															: E extends { readonly t: "row" }
																? SqlError<"row value misused", null>
																: E extends { readonly t: "raise" }
																	? SqlError<
																			"RAISE() may only be used within a trigger-program",
																			null
																		>
																	: SqlError<
																			"DEFAULT is not allowed in this context",
																			null
																		>;

export type TypeList<
	L extends readonly Expr[],
	C extends SqCtx,
	Acc extends readonly ColInfo[] = [],
> = L extends readonly [
	infer H extends Expr,
	...infer R extends readonly Expr[],
]
	? TypeOf<H, C> extends infer X
		? X extends ColInfo
			? TypeList<R, C, [...Acc, X]>
			: X
		: never
	: Acc;

type AnyNull<L extends readonly ColInfo[]> = true extends L[number]["nullable"]
	? true
	: false;
type AllNull<L extends readonly ColInfo[]> = false extends L[number]["nullable"]
	? false
	: true;

type Pred<
	L extends readonly Expr[],
	C extends SqCtx,
	Propagate extends boolean,
> =
	TypeList<L, C> extends infer X
		? X extends readonly ColInfo[]
			? Info<"integer", Propagate extends true ? AnyNull<X> : false>
			: X
		: never;

type TypeLike<E extends Expr, C extends SqCtx> = E["kind"] extends "regexp"
	? DeclaredFn<C["db"], "regexp"> extends null
		? SqlError<"no such function: REGEXP", null>
		: Pred<[E["e"], E["pat"]], C, true>
	: Pred<
			E["esc"] extends Expr ? [E["e"], E["pat"], E["esc"]] : [E["e"], E["pat"]],
			C,
			true
		>;

export type SubqueryCol<Q extends SelectStmt, C extends SqCtx> =
	ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer X
		? X extends readonly Cell[]
			? X extends readonly [infer One extends Cell]
				? One["t"]
				: SqlError<
						`sub-select returns ${X["length"]} columns - expected 1`,
						null
					>
			: X
		: never;

type TypeInSub<
	L extends Expr,
	Q extends SelectStmt,
	C extends SqCtx,
> = L extends {
	readonly t: "row";
	readonly items: infer Items extends readonly Expr[];
}
	? ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer X
		? X extends readonly Cell[]
			? X["length"] extends Items["length"]
				? TypeList<Items, C> extends infer Y
					? Y extends readonly ColInfo[]
						? Info<"integer", true>
						: Y
					: never
				: SqlError<
						`sub-select returns ${X["length"]} columns - expected ${Items["length"]}`,
						null
					>
			: X
		: never
	: TypeOf<L, C> extends infer X
		? X extends ColInfo
			? SubqueryCol<Q, C> extends infer S
				? S extends ColInfo
					? Info<"integer", X["nullable"] extends true ? true : S["nullable"]>
					: S
				: never
			: X
		: never;

type InWidth<N extends number> = N extends 1
	? Info<"integer", true>
	: SqlError<`sub-select returns ${N} columns - expected 1`, null>;

type TypeInTable<E extends Expr, C extends SqCtx> =
	TypeOf<E["e"], C> extends infer X
		? X extends ColInfo
			? E["args"] extends readonly Expr[]
				? E["table"] extends "json_each" | "json_tree"
					? InWidth<8>
					: SqlError<`no such table: ${E["table"]}`, null>
				: E["table"] extends keyof C["ctes"]
					? InWidth<C["ctes"][E["table"]]["order"]["length"]>
					: LookupRelation<
								C["db"],
								{ schema: E["schema"]; name: E["table"] }
							> extends [infer Rel, string]
						? RelationItem<Rel, "x"> extends infer It extends SqItem
							? InWidth<It["order"]["length"]>
							: SqlError<`no such table: ${E["table"]}`, null>
						: SqlError<`no such table: ${E["table"]}`, null>
			: X
		: never;

type CastType<To extends string, From extends string> = From extends "null"
	? "null"
	: To extends `${string}int${string}`
		? "integer"
		: To extends `${string}${"char" | "clob" | "text"}${string}`
			? "text"
			: To extends `${string}blob${string}`
				? "blob"
				: To extends `${string}${"real" | "floa" | "doub"}${string}`
					? "real"
					: "numeric";

export type Arith<A extends string, B extends string> = A extends "null"
	? "null"
	: B extends "null"
		? "null"
		: NumClass<A> | NumClass<B> extends infer K
			? "real" extends K
				? "real"
				: [K] extends ["integer"]
					? "integer"
					: "numeric"
			: never;

type NonZero<E> = E extends {
	readonly t: "num";
	readonly v: infer V extends string;
}
	? V extends `${"-" | ""}${"0" | "0.0" | "0." | ".0" | "0e0" | "0x0"}`
		? false
		: V extends `${"-" | ""}${"0" | "."}${string}`
			? NonZeroDigits<V>
			: true
	: false;
type ModNonZero<E> = E extends {
	readonly t: "num";
	readonly v: infer V extends string;
}
	? Lowercase<Unsigned<V>> extends infer U extends string
		? U extends `0x${string}`
			? NonZero<E>
			: U extends `${string}e-${string}`
				? false
				: U extends `${infer M}e${string}`
					? IntPartNonZero<M>
					: IntPartNonZero<U>
		: false
	: false;
type Unsigned<V extends string> = V extends `${"-" | "+"}${infer R}`
	? Unsigned<R>
	: V;
type IntPartNonZero<U extends string> = U extends `${infer I}.${string}`
	? NonZeroDigits<I>
	: NonZeroDigits<U>;
type NonZeroDigits<V extends string> = V extends `${infer H}${infer R}`
	? H extends "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
		? true
		: H extends "e" | "E"
			? false
			: NonZeroDigits<R>
	: false;

type TypeBin<Op, L extends Expr, R extends Expr, C extends SqCtx> = Op extends
	| "="
	| "!="
	| "<"
	| ">"
	| "<="
	| ">="
	? L extends { readonly t: "row" }
		? RowCompare<L, R, C>
		: R extends { readonly t: "row" }
			? SqlError<"row value misused", null>
			: Pred<[L, R], C, true>
	: TypeOf<L, C> extends infer A
		? A extends ColInfo
			? TypeOf<R, C> extends infer B
				? B extends ColInfo
					? Op extends "->" | "->>"
						? JsonOp<Op, A, R>
						: Info<
								BinType<Op, A["type"], B["type"]>,
								Op extends "->" | "->>"
									? true
									: Op extends "/" | "%"
										? (Op extends "%" ? ModNonZero<R> : NonZero<R>) extends true
											? Or<A["nullable"], B["nullable"]>
											: true
										: Or<A["nullable"], B["nullable"]>
							>
					: B
				: never
			: A
		: never;

type Or<A, B> = A extends true ? true : B extends true ? true : false;

type JsonOp<Op extends "->" | "->>", A extends ColInfo, R> =
	JsonShapeOf<A["type"]> extends [infer V]
		? JsonPath<R> extends infer P extends readonly JsonStep[]
			? JsonGet<V, P, Op> extends infer X extends ColInfo
				? Info<X["type"], Or<X["nullable"], A["nullable"]>>
				: never
			: Info<Op extends "->" ? "text" : "any", true>
		: Info<Op extends "->" ? "text" : "any", true>;

type BinType<Op, A extends string, B extends string> = Op extends "and" | "or"
	? "integer"
	: Op extends "||"
		? A extends "null"
			? "null"
			: B extends "null"
				? "null"
				: "text"
		: Op extends "->"
			? "text"
			: Op extends "->>"
				? "any"
				: Op extends "&" | "|" | "<<" | ">>"
					? A extends "null"
						? "null"
						: B extends "null"
							? "null"
							: "integer"
					: Arith<A, B>;

type RowCompare<L extends Expr, R extends Expr, C extends SqCtx> = R extends {
	readonly t: "row";
}
	? L["items"]["length"] extends R["items"]["length"]
		? Pred<[...L["items"], ...R["items"]], C, true>
		: SqlError<"row value misused", null>
	: R extends { readonly t: "sub" }
		? ProjectSelect<R["q"], C["db"], C["scope"], C["ctes"]> extends infer X
			? X extends readonly Cell[]
				? X["length"] extends L["items"]["length"]
					? TypeList<L["items"], C> extends infer Y
						? Y extends readonly ColInfo[]
							? Info<"integer", true>
							: Y
						: never
					: SqlError<
							`sub-select returns ${X["length"]} columns - expected ${L["items"]["length"]}`,
							null
						>
				: X
			: never
		: SqlError<"row value misused", null>;

type TypeUn<Op, X extends Expr, C extends SqCtx> =
	TypeOf<X, C> extends infer A
		? A extends ColInfo
			? Op extends "+"
				? Info<A["type"], A["nullable"]>
				: Op extends "-"
					? Info<
							A["type"] extends "null" ? "null" : Negate<NumClass<A["type"]>>,
							A["nullable"]
						>
					: Info<A["type"] extends "null" ? "null" : "integer", A["nullable"]>
			: A
		: never;
type Negate<K> = [K] extends ["integer"]
	? "integer"
	: [K] extends ["real"]
		? "real"
		: "numeric";

type TypeCase<
	Operand,
	Whens extends readonly unknown[],
	Else,
	C extends SqCtx,
> = (Operand extends Expr ? TypeOf<Operand, C> : Info<"null">) extends infer O
	? O extends AnyErr
		? O
		: CaseLoop<Whens, C, [], 0> extends infer Vs
			? Vs extends readonly ColInfo[]
				? (
						Else extends Expr
							? TypeOf<Else, C>
							: Info<"null", true>
					) extends infer El
					? El extends ColInfo
						? Info<Common<[...Vs, El]>, AnyNull<[...Vs, El]>>
						: El
					: never
				: Vs
			: never
	: never;
type CaseLoop<
	Whens extends readonly unknown[],
	C extends SqCtx,
	Acc extends readonly ColInfo[],
	I extends number,
> = Whens[I] extends {
	readonly when: infer W extends Expr;
	readonly then: infer V extends Expr;
}
	? TypeOf<W, C> extends infer X
		? X extends AnyErr
			? X
			: TypeOf<V, C> extends infer Y
				? Y extends ColInfo
					? CaseLoop<Whens, C, [...Acc, Y], Nx<I>>
					: Y
				: never
		: never
	: Acc;

export type Common<L extends readonly ColInfo[]> =
	Exclude<L[number]["type"], "null" | "unknown"> extends infer U extends string
		? [U] extends [never]
			? "unknown" extends L[number]["type"]
				? "unknown"
				: "null"
			: U
		: never;

type AggOf<E extends Call> = E["over"] extends null
	? E["name"] extends "min" | "max"
		? E["args"]["length"] extends 1
			? {
					readonly min: 1;
					readonly max: 1;
					readonly ret: "arg0";
					readonly null: "agg";
					readonly kind: "agg";
				}
			: Functions[E["name"]]
		: Functions[E["name"] & keyof Functions]
	: E["name"] extends "min" | "max"
		? E["args"]["length"] extends 1
			? {
					readonly min: 1;
					readonly max: 1;
					readonly ret: "arg0";
					readonly null: "agg";
					readonly kind: "agg";
				}
			: Functions[E["name"]]
		: Functions[E["name"] & keyof Functions];

type FnOf<E extends Call, C extends SqCtx> =
	DeclaredFn<C["db"], E["name"]> extends infer D
		? D extends null
			? E["name"] extends keyof Functions
				? AggOf<E>
				: null
			: SigFn<PickSig<D, E["args"]["length"]>>
		: never;

type TypeCall<E extends Call, C extends SqCtx> =
	FnOf<E, C> extends infer F
		? F extends Fn
			? (
					F["kind"] extends "agg"
						? E["over"] extends null
							? C["inAgg"] extends true
								? `misuse of aggregate function ${E["disp"]}()`
								: C["agg"] extends "none"
									? `misuse of aggregate function ${E["disp"]}()`
									: CallShape<E, F>
							: CallShape<E, F>
						: CallShape<E, F>
				) extends infer M extends string
				? SqlError<M, null>
				: (
							F["kind"] extends "agg"
								? E["over"] extends null
									? AggCtx<C>
									: C
								: C
						) extends infer AC extends SqCtx
					? TypeList<E["args"], AC> extends infer Args
						? Args extends readonly ColInfo[]
							? CheckExtras<E, AC> extends infer X
								? X extends AnyErr
									? X
									: E["name"] extends "json_extract"
										? E["args"]["length"] extends 2
											? JsonOp<"->>", Args[0], E["args"][1]>
											: Info<RetType<F["ret"], Args>, NullOf<F, E, Args, C>>
										: Info<RetType<F["ret"], Args>, NullOf<F, E, Args, C>>
								: never
							: Args
						: never
					: never
			: SqlError<`no such function: ${E["disp"]}`, null>
		: never;

type AggCtx<C extends SqCtx> = {
	readonly db: C["db"];
	readonly scope: C extends { readonly aggScope: infer S extends Scope }
		? S
		: C["scope"];
	readonly ctes: C["ctes"];
	readonly agg: "none";
	readonly inAgg: true;
	readonly aliases: C["aliases"];
};

type CallShape<E extends Call, F extends Fn> = E["star"] extends true
	? E["name"] extends "count"
		? E["distinct"] extends true
			? "DISTINCT aggregates must have exactly one argument"
			: null
		: `wrong number of arguments to function ${E["disp"]}()`
	: ArityOk<E["args"]["length"], F["min"], F["max"]> extends false
		? `wrong number of arguments to function ${E["disp"]}()`
		: F["kind"] extends "agg"
			? E["over"] extends null
				? AggPlacement<E>
				: E["distinct"] extends true
					? "DISTINCT is not supported for window functions"
					: null
			: F["kind"] extends "win"
				? E["over"] extends null
					? `misuse of window function ${E["disp"]}()`
					: null
				: E["over"] extends null
					? E["filter"] extends null
						? E["distinct"] extends true
							? `DISTINCT aggregates must have exactly one argument`
							: null
						: `FILTER may not be used with non-aggregate ${E["disp"]}()`
					: `${E["disp"]}() may not be used as a window function`;
type AggPlacement<E extends Call> = E["distinct"] extends true
	? E["args"]["length"] extends 1
		? null
		: "DISTINCT aggregates must have exactly one argument"
	: null;

type ArityOk<N extends number, Min extends number, Max extends number> =
	GE<N, Min> extends true ? (Max extends 1000 ? true : GE<Max, N>) : false;
type GE<A extends number, B extends number> =
	Tup<A> extends [...Tup<B>, ...unknown[]] ? true : false;
type Tup<N extends number, A extends unknown[] = []> = A["length"] extends N
	? A
	: Tup<N, [...A, 0]>;

type CheckExtras<E extends Call, C extends SqCtx> = (
	E["filter"] extends Expr
		? TypeOf<E["filter"], C>
		: true
) extends infer X
	? X extends AnyErr
		? X
		: TypeList<E["order"], C> extends infer Y
			? Y extends AnyErr
				? Y
				: E["over"] extends {
							readonly partition: infer P extends readonly Expr[];
							readonly order: infer O extends readonly Expr[];
						}
					? TypeList<[...P, ...O], C>
					: true
			: never
	: never;

type RetType<R extends string, A extends readonly ColInfo[]> = R extends "arg0"
	? A[0]["type"]
	: R extends "common"
		? Common<A>
		: R extends "iif"
			? Common<IifValues<A, 0, []>>
			: R extends "abs" | "ceil" | "sum"
				? A[0]["type"] extends "null"
					? "null"
					: AbsType<Affinity<A[0]["type"]>>
				: R extends "substr"
					? Affinity<A[0]["type"]> extends "blob"
						? "blob"
						: "text"
					: R extends "jsonext"
						? A["length"] extends 2
							? "any"
							: "text"
						: R;
type AbsType<Aff> = [Aff] extends ["integer"]
	? "integer"
	: [Aff] extends ["real"]
		? "real"
		: [Aff] extends ["text" | "blob"]
			? "real"
			: "numeric";

type NonNumeric<A extends readonly ColInfo[]> = true extends {
	[I in keyof A]: [Affinity<A[I]["type"]>] extends ["integer" | "real"]
		? false
		: true;
}[number]
	? true
	: false;

type IifValues<
	A extends readonly ColInfo[],
	I extends number,
	Acc extends readonly ColInfo[],
> = A[Nx<I>] extends ColInfo
	? IifValues<A, Nx<Nx<I>>, [...Acc, A[Nx<I>]]>
	: A[I] extends ColInfo
		? [...Acc, A[I]]
		: Acc;
type IifNullable<A extends readonly ColInfo[]> = A["length"] extends
	| 2
	| 4
	| 6
	| 8
	| 10
	| 12
	| 14
	| 16
	? true
	: AnyNull<IifValues<A, 0, []>>;

type NullOf<
	F extends Fn,
	E extends Call,
	A extends readonly ColInfo[],
	C extends SqCtx,
> = F["null"] extends "never"
	? false
	: F["null"] extends "args"
		? AnyNull<A>
		: F["null"] extends "arg0"
			? A[0]["nullable"]
			: F["null"] extends "always"
				? true
				: F["null"] extends "all"
					? AllNull<A>
					: F["null"] extends "iif"
						? IifNullable<A>
						: F["null"] extends "sign"
							? A[0]["nullable"] extends true
								? true
								: [Affinity<A[0]["type"]>] extends ["integer" | "real"]
									? false
									: true
							: F["null"] extends "format"
								? E["args"][0] extends {
										readonly t: "str" | "num";
										readonly v: infer V extends string;
									}
									? V extends ""
										? true
										: false
									: true
								: F["null"] extends "numargs"
									? NonNumeric<A> extends true
										? true
										: AnyNull<A>
									: F["null"] extends "substr"
										? AnyNull<A> extends true
											? true
											: Affinity<A[0]["type"]> extends
														| "blob"
														| "any"
														| "unknown"
												? true
												: false
										: F["null"] extends "noargs"
											? A extends readonly []
												? false
												: true
											: E["over"] extends null
												? C["agg"] extends "group"
													? E["filter"] extends null
														? A[0]["nullable"]
														: true
													: true
												: A[0]["nullable"];

export type CheckBool<E extends Expr, C extends SqCtx> =
	TypeOf<E, C> extends infer X ? (X extends AnyErr ? X : true) : never;
