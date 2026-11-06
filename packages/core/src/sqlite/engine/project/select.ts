import type { Digit } from "../../../engine/chars.js";
import type { NameAt } from "../../../engine/family/diagnostics.js";
import type {
	CellsMap,
	NullLevel,
	RenameCells,
} from "../../../engine/family/scope.js";
import type { QueryContext } from "../../../engine/family/types.js";
import type { NarrowKeys, NarrowLevel } from "../../../engine/narrow.js";
import type { Next } from "../../../engine/next.js";
import type { CappedLen, DigitsLE, GE, ToNum } from "../../../engine/num.js";
import type { ColInfo, Info, Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type {
	Cte,
	Expr,
	SelectBody,
	SelectStmt,
	SetOp,
	SimpleSelect,
	Target,
	WithClause,
} from "../ast.js";
import type { BindFrom, CteEntry, StarCells } from "../binder/scope.js";
import type { IsAggCall } from "../typer/functions.js";
import type { Common, TypeList, TypeOf } from "../typer/typeof.js";
import type {
	AggMode,
	Cell,
	MkCtx,
	SqColMap,
	SqColOf,
	SqCteMap,
	SqCtx,
	SqLevel,
} from "../types.js";

export type ProjectSelect<
	Q extends SelectStmt,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> =
	BindWith<Q["with"], Env> extends infer C2 extends SqCteMap
		? ProjectBody<
				Q["body"],
				QueryContext<Env["db"], Env["scope"], C2>,
				Q["orderBy"]
			> extends infer R extends readonly Cell[]
			? CheckLimit<Q, QueryContext<Env["db"], Env["scope"], C2>> extends AnyErr
				? CheckLimit<Q, QueryContext<Env["db"], Env["scope"], C2>>
				: R
			: ProjectBody<
					Q["body"],
					QueryContext<Env["db"], Env["scope"], C2>,
					Q["orderBy"]
				>
		: BindWith<Q["with"], Env>;

type CheckLimit<
	Q extends SelectStmt,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = TypeList<
	[
		...(Q["limit"] extends Expr ? [Q["limit"]] : []),
		...(Q["offset"] extends Expr ? [Q["offset"]] : []),
	],
	MkCtx<Env["db"], Env["scope"], Env["ctes"], "none", {}>
>;

export type BindWith<
	W,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = W extends WithClause ? CteLoop<W["ctes"], Env, 0> : Env["ctes"];

type CteLoop<
	L extends readonly Cte[],
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	I extends number,
> = L[I] extends infer C extends Cte
	? CteCells<C, Env> extends infer R extends readonly Cell[]
		? CteLoop<
				L,
				QueryContext<
					Env["db"],
					Env["scope"],
					Env["ctes"] & { readonly [K in C["name"]]: CteEntry<R> }
				>,
				Next<I>
			>
		: CteCells<C, Env>
	: Env["ctes"];

type CteCells<
	C extends Cte,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = (
	C["q"]["body"] extends {
		readonly t: "setop";
		readonly l: infer Anchor extends SelectBody;
	}
		? LeftMost<Anchor> extends infer A extends SelectBody
			? ProjectBody<A, Env, []> extends infer AC extends readonly Cell[]
				? Renamed<C, AC> extends infer RC extends readonly Cell[]
					? ProjectSelect<
							C["q"],
							QueryContext<
								Env["db"],
								Env["scope"],
								Env["ctes"] & { readonly [K in C["name"]]: CteEntry<RC> }
							>
						>
					: Renamed<C, AC>
				: ProjectBody<A, Env, []>
			: never
		: ProjectSelect<C["q"], Env>
) extends infer R
	? R extends readonly Cell[]
		? Renamed<C, R>
		: R
	: never;
type LeftMost<B extends SelectBody> = B extends {
	readonly t: "setop";
	readonly l: infer L extends SelectBody;
}
	? LeftMost<L>
	: B;

type Renamed<
	C extends Cte,
	R extends readonly Cell[],
> = C["cols"] extends readonly {
	readonly n: string;
}[]
	? C["cols"]["length"] extends R["length"]
		? RenameCells<R, C["cols"]>
		: SqlError<
				`table ${C["display"]} has ${R["length"]} values for ${C["cols"]["length"]} columns`,
				NameAt<"values">
			>
	: R;

type ProjectBody<
	B extends SelectBody,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	OrderBy extends readonly Expr[],
> = B extends { readonly t: "simple" }
	? ProjectSimple<Extract<B, SimpleSelect>, Env, OrderBy>
	: B extends { readonly t: "values" }
		? ProjectValues<B["rows"], Env>
		: B extends { readonly t: "setop" }
			? ProjectSetOp<Extract<B, SetOp>, Env, OrderBy>
			: never;

type ProjectSetOp<
	B extends SelectBody & { readonly t: "setop" },
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	OrderBy extends readonly Expr[],
> =
	ProjectBody<B["l"], Env, []> extends infer L extends readonly Cell[]
		? ProjectBody<B["r"], Env, []> extends infer R extends readonly Cell[]
			? L["length"] extends R["length"]
				? MergeCells<L, R, B["op"]> extends infer M extends readonly Cell[]
					? CompoundOrder<OrderBy, M> extends AnyErr
						? CompoundOrder<OrderBy, M>
						: M
					: never
				: SqlError<
						`SELECTs to the left and right of ${Uppercase<B["op"]>}${B["all"] extends true ? " ALL" : ""} do not have the same number of result columns`,
						null
					>
			: ProjectBody<B["r"], Env, []>
		: ProjectBody<B["l"], Env, []>;

type MergeCells<L extends readonly Cell[], R extends readonly Cell[], Op> = {
	[I in keyof L]: {
		readonly n: L[I]["n"];
		readonly t: Op extends "union"
			? Info<
					UnionType<L[I]["t"]["type"], R[I & keyof R]["t"]["type"]>,
					L[I]["t"]["nullable"] extends true
						? true
						: R[I & keyof R]["t"]["nullable"]
				>
			: Op extends "intersect"
				? Info<
						L[I]["t"]["type"],
						L[I]["t"]["nullable"] extends true
							? R[I & keyof R]["t"]["nullable"]
							: false
					>
				: L[I]["t"];
	};
};

type UnionType<A extends string, B extends string> = B extends "null"
	? A
	: A extends "null"
		? B
		: [A] extends [B]
			? A
			: Common<
					[
						{ readonly type: A; readonly nullable: false },
						{ readonly type: B; readonly nullable: false },
					]
				>;

type CompoundOrder<
	O extends readonly Expr[],
	M extends readonly Cell[],
	I extends number = 0,
> = O[I] extends infer E extends Expr
	? IntTerm<E> extends infer P extends IntVal
		? PositionOk<P, M["length"], I>
		: E extends { readonly t: "collate"; readonly e: infer X }
			? CompoundOrder<[X & Expr], M>
			: E extends {
						readonly t: "col";
						readonly tbl: null;
						readonly name: infer N extends string;
					}
				? Lowercase<M[number]["n"]> extends infer Names
					? N extends Names
						? CompoundOrder<O, M, Next<I>>
						: SqlError<
								`${Ordinal<Next<I>>} ORDER BY term does not match any column in the result set`,
								NameAt<"order">
							>
					: never
				: SqlError<
						`${Ordinal<Next<I>>} ORDER BY term does not match any column in the result set`,
						NameAt<"order">
					>
	: true;

type IntVal = { readonly neg: boolean; readonly v: number | "big" };

type IntTerm<E> = E extends {
	readonly t: "num";
	readonly v: infer V extends string;
}
	? IntLiteral<V, false>
	: E extends { readonly t: "collate"; readonly e: infer X }
		? IntTerm<X>
		: E extends {
					readonly t: "is";
					readonly what: "null";
					readonly e: { readonly t: "num" | "str" | "blob" };
					readonly not: infer Not;
				}
			? { readonly neg: false; readonly v: Not extends true ? 1 : 0 }
			: E extends { readonly t: "un"; readonly op: "-"; readonly e: infer X }
				? IntTerm<X> extends infer R
					? R extends IntVal
						? {
								readonly neg: R["neg"] extends true ? false : true;
								readonly v: R["v"];
							}
						: null
					: null
				: null;

type IntLiteral<V extends string, Neg extends boolean> = V extends `-${infer R}`
	? IntLiteral<R, Neg extends true ? false : true>
	: V extends `+${infer R}`
		? IntLiteral<R, Neg>
		: (
					Lowercase<V> extends `0x${infer H}`
						? HexValue<StripZeros<H>>
						: DecimalValue<StripZeros<V>>
				) extends infer K
			? K extends number | "big"
				? { readonly neg: Neg; readonly v: K }
				: null
			: null;

type StripZeros<S extends string> = S extends `0${infer R}` ? StripZeros<R> : S;
type Digits<S extends string, Set extends string> = S extends ""
	? true
	: S extends `${infer C}${infer R}`
		? C extends Set
			? Digits<R, Set>
			: false
		: false;
type Hex = Digit | "a" | "b" | "c" | "d" | "e" | "f";

type DecimalValue<D extends string> =
	Digits<D, Digit> extends true
		? D extends ""
			? 0
			: CappedLen<D, 20> extends 1 | 2 | 3
				? D extends `${infer K extends number}`
					? K
					: null
				: CappedLen<D, 20> extends 4 | 5 | 6 | 7 | 8 | 9
					? "big"
					: CappedLen<D, 20> extends 10
						? DigitsLE<D, "2147483647"> extends true
							? "big"
							: null
						: null
		: null;
type HexIndex<H extends string> =
	Lowercase<H> extends Digit
		? ToNum<Lowercase<H>>
		: { a: 10; b: 11; c: 12; d: 13; e: 14; f: 15 }[Lowercase<H> &
				("a" | "b" | "c" | "d" | "e" | "f")];
type HexValue<H extends string> =
	Digits<Lowercase<H>, Hex> extends true
		? H extends ""
			? 0
			: H extends `${infer C}`
				? CappedLen<H, 20> extends 1
					? HexIndex<C>
					: CappedLen<H, 20> extends 2 | 3 | 4 | 5 | 6 | 7
						? "big"
						: CappedLen<H, 20> extends 8
							? H extends `${"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7"}${string}`
								? "big"
								: null
							: null
				: null
		: null;

type PositionOk<
	P extends IntVal,
	N extends number,
	I extends number,
	W extends string = "ORDER",
> = P["neg"] extends true
	? OutOfRange<I, N, W>
	: P["v"] extends infer K extends number
		? K extends 0
			? OutOfRange<I, N, W>
			: GE<N, K> extends true
				? true
				: OutOfRange<I, N, W>
		: OutOfRange<I, N, W>;
type OutOfRange<
	I extends number,
	N extends number,
	W extends string,
> = SqlError<
	`${Ordinal<Next<I>>} ${W} BY term out of range - should be between 1 and ${N}`,
	NameAt<Lowercase<W>>
>;
type Ordinal<N extends number> = N extends 1
	? "1st"
	: N extends 2
		? "2nd"
		: N extends 3
			? "3rd"
			: `${N}th`;

type ProjectValues<
	Rows extends readonly (readonly Expr[])[],
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> =
	ValuesRows<
		Rows,
		MkCtx<Env["db"], Env["scope"], Env["ctes"], "none", {}>,
		0,
		[]
	> extends infer R
		? R extends readonly [
				infer R0 extends readonly ColInfo[],
				...(readonly (readonly ColInfo[])[]),
			]
			? ValuesCells<R0, R>
			: R
		: never;
type ValuesCells<
	R0 extends readonly ColInfo[],
	R extends readonly (readonly ColInfo[])[],
> = {
	[I in keyof R0]: {
		readonly n: `column${Next<I extends `${infer K extends number}` ? K : 0>}`;
		readonly t: Info<
			Common<Column<R, I>>,
			true extends Column<R, I>[number]["nullable"] ? true : false
		>;
	};
};
type Column<R extends readonly (readonly ColInfo[])[], I> = {
	[K in keyof R]: R[K][I & keyof R[K]] & ColInfo;
};
type ValuesRows<
	Rows extends readonly (readonly Expr[])[],
	C extends SqCtx,
	I extends number,
	Acc extends readonly (readonly ColInfo[])[],
> = Rows[I] extends infer Row extends readonly Expr[]
	? TypeList<Row, C> extends infer X extends readonly ColInfo[]
		? ValuesRows<Rows, C, Next<I>, [...Acc, X]>
		: TypeList<Row, C>
	: Acc;

type HasAgg<E, DB> = E extends { readonly t: string }
	? IsAggCall<E, DB> extends true
		? true
		: E extends { readonly t: "sub" | "exists" | "insub" }
			? E extends { readonly t: "insub"; readonly e: infer X }
				? HasAgg<X, DB>
				: false
			: true extends HasAggIn<E, DB>
				? true
				: false
	: false;
type HasAggIn<E, DB> = {
	[K in keyof E]: E[K] extends readonly unknown[]
		? HasAggList<E[K], DB, 0>
		: E[K] extends { readonly t: string }
			? HasAgg<E[K], DB>
			: E[K] extends { readonly when: infer W; readonly then: infer V }
				? HasAgg<W, DB> | HasAgg<V, DB>
				: false;
}[keyof E];
type HasAggList<
	L extends readonly unknown[],
	DB,
	I extends number,
> = L[I] extends undefined
	? false
	: HasAgg<L[I], DB> extends true
		? true
		: L[I] extends { readonly when: infer W; readonly then: infer V }
			? HasAgg<W, DB> extends true
				? true
				: HasAgg<V, DB> extends true
					? true
					: HasAggList<L, DB, Next<I>>
			: HasAggList<L, DB, Next<I>>;

type AggModeOf<
	S extends SimpleSelect,
	OrderBy extends readonly Expr[],
	DB,
> = S["groupBy"] extends readonly Expr[]
	? "group"
	: HasAggList<S["targets"], DB, 0> extends true
		? "whole"
		: HasAggList<OrderBy, DB, 0> extends true
			? "whole"
			: S["having"] extends Expr
				? HasAgg<S["having"], DB> extends true
					? "whole"
					: "bad-having"
				: "none";

/** Names of windows referenced as `OVER name`, outside subqueries. */
type WindowRefs<E> = E extends { readonly t: string }
	? E extends { readonly t: "sub" | "exists" | "insub" }
		? E extends { readonly t: "insub"; readonly e: infer X }
			? WindowRefs<X>
			: never
		:
				| (E extends {
						readonly t: "call";
						readonly over: { readonly name: infer N extends string };
				  }
						? N
						: never)
				| WindowRefsIn<E>
	: never;
type WindowRefsIn<E> = {
	[K in keyof E]: E[K] extends readonly unknown[]
		? WindowRefsList<E[K]>
		: E[K] extends { readonly t: string }
			? WindowRefs<E[K]>
			: E[K] extends { readonly when: infer W; readonly then: infer V }
				? WindowRefs<W> | WindowRefs<V>
				: never;
}[keyof E];
type WindowRefsList<L extends readonly unknown[]> = L[number] extends infer X
	? X extends { readonly when: infer W; readonly then: infer V }
		? WindowRefs<W> | WindowRefs<V>
		: WindowRefs<X>
	: never;

type MissingWindow<S extends SimpleSelect, OrderBy extends readonly Expr[]> =
	| WindowRefsList<S["targets"]>
	| WindowRefsList<OrderBy> extends infer R
	? Exclude<R, S["windows"][number]["name"]> extends infer M extends string
		? [M] extends [never]
			? null
			: SqlError<`no such window: ${FirstName<M>}`, null>
		: null
	: null;
export type FirstName<U extends string> =
	import("../../../engine/object.js").Members<U> extends readonly [
		infer F extends string,
		...unknown[],
	]
		? F
		: U;

type ProjectSimple<
	S extends SimpleSelect,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	OrderBy extends readonly Expr[],
> =
	MissingWindow<S, OrderBy> extends infer W extends AnyErr
		? W
		: ProjectSimpleChecked<S, Env, OrderBy>;
type ProjectSimpleChecked<
	S extends SimpleSelect,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	OrderBy extends readonly Expr[],
> =
	BindFrom<S["from"], Env> extends infer L extends SqLevel
		? CheckWhere<
				S["where"],
				Env["db"],
				[L, ...Env["scope"]],
				Env["ctes"],
				S["targets"]
			> extends infer W
			? W extends AnyErr
				? W
				: (
							S["where"] extends Expr
								? NarrowLevel<L, NarrowKeys<S["where"]>>
								: L
						) extends infer NL extends SqLevel
					? AggModeOf<S, OrderBy, Env["db"]> extends "bad-having"
						? SqlError<"HAVING clause on a non-aggregate query", null>
						: AggModeOf<S, OrderBy, Env["db"]> extends infer Mode extends
									AggMode
							? (
									Mode extends "whole"
										? MkCtx<
												Env["db"],
												[NullLevel<NL>, ...Env["scope"]],
												Env["ctes"],
												"whole",
												{},
												[NL, ...Env["scope"]]
											>
										: MkCtx<
												Env["db"],
												[NL, ...Env["scope"]],
												Env["ctes"],
												Mode,
												{}
											>
								) extends infer C extends SqCtx
								? ProjectTargets<S["targets"], NL, C, 0, []> extends infer Cells
									? Cells extends readonly Cell[]
										? CheckClauses<
												S,
												OrderBy,
												Cells,
												C,
												MkCtx<
													Env["db"],
													[L, ...Env["scope"]],
													Env["ctes"],
													"none",
													AliasMap<S["targets"], Cells>
												>
											> extends infer X
											? X extends AnyErr
												? X
												: Cells
											: never
										: Cells
									: never
								: never
							: never
					: never
			: never
		: BindFrom<S["from"], Env>;

type CheckWhere<
	W,
	DB,
	S extends Scope,
	Ctes extends SqCteMap,
	Targets extends readonly Target[],
> = W extends Expr
	? TypeOf<W, MkCtx<DB, S, Ctes, "none", {}>> extends infer X
		? X extends SqlError<`no such column: ${string}`, unknown>
			? AliasesOnly<Targets, DB, S, Ctes> extends infer A extends SqColMap
				? TypeOf<W, MkCtx<DB, S, Ctes, "none", A>> extends infer Y
					? Y extends AnyErr
						? Y
						: true
					: never
				: never
			: X extends AnyErr
				? X
				: true
		: never
	: true;

type AliasesOnly<
	Targets extends readonly Target[],
	DB,
	S extends Scope,
	Ctes extends SqCteMap,
> = {
	readonly [T in Targets[number] as T extends {
		readonly t: "expr";
		readonly alias: infer A extends string;
	}
		? Lowercase<A>
		: never]: T extends {
		readonly e: infer E extends Expr;
		readonly alias: infer A extends string;
	}
		? TypeOf<E, MkCtx<DB, S, Ctes, "none", {}>> extends infer X
			? X extends ColInfo
				? SqColOf<X["type"], X["nullable"], A>
				: SqColOf<"any", true, A>
			: never
		: never;
};

type AliasMap<
	Targets extends readonly Target[],
	Cells extends readonly Cell[],
> = CellsMap<Cells> & (Targets extends unknown ? {} : never);

export type ProjectTargets<
	Ts extends readonly Target[],
	L extends SqLevel,
	C extends SqCtx,
	I extends number,
	Acc extends readonly Cell[],
	Ret extends boolean = false,
> = Ts[I] extends infer T extends Target
	? T extends {
			readonly t: "star";
			readonly tbl: infer Tb extends string | null;
		}
		? [Ret, Tb] extends [true, string]
			? SqlError<'RETURNING may not use "TABLE.*" wildcards', null>
			: (
						C["scope"] extends readonly [infer L0 extends SqLevel, ...unknown[]]
							? StarCells<L0, Tb>
							: never
					) extends infer S
				? S extends readonly Cell[]
					? ProjectTargets<Ts, L, C, Next<I>, [...Acc, ...S], Ret>
					: S
				: never
		: T extends {
					readonly t: "expr";
					readonly e: infer E extends Expr;
					readonly alias: infer A;
					readonly span: infer Sp extends string;
				}
			? TypeOf<E, C> extends infer X extends ColInfo
				? ProjectTargets<
						Ts,
						L,
						C,
						Next<I>,
						[
							...Acc,
							{
								readonly n: A extends string
									? A
									: X extends { readonly n: infer N extends string }
										? E extends { readonly t: "col" }
											? N
											: Sp
										: Sp;
								readonly t: Info<X["type"], X["nullable"]>;
							} & (Ret extends true
								? {}
								: A extends string
									? {}
									: E extends { readonly t: "col" }
										? {}
										: DerivedName<E, C, Sp, Acc["length"]>),
						],
						Ret
					>
				: TypeOf<E, C>
			: never
	: Acc;

// Not distributive: over the whole `Expr` union it stops instead of recursing.
type Unwrapped<E extends Expr> = [E] extends [
	{
		readonly t: "collate";
		readonly e: infer X extends Expr;
	},
]
	? Unwrapped<X>
	: E;

type DerivedName<
	E extends Expr,
	C extends SqCtx,
	Sp extends string,
	K extends number,
> =
	Unwrapped<E> extends infer U extends Expr
		? U extends { readonly t: "col" }
			? TypeOf<U, C> extends { readonly n: infer N extends string }
				? { readonly d: N }
				: {}
			: Lowercase<Sp> extends "true" | "false"
				? { readonly d: `column${Next<K>}` }
				: {}
		: {};

type CheckClauses<
	S extends SimpleSelect,
	OrderBy extends readonly Expr[],
	Cells extends readonly Cell[],
	C extends SqCtx,
	Plain extends SqCtx,
> = (
	S["groupBy"] extends readonly Expr[]
		? ClauseTerms<S["groupBy"], Plain, Cells["length"], "GROUP">
		: true
) extends infer G extends AnyErr
	? G
	: (
				S["having"] extends Expr
					? TypeOf<S["having"], WithAliases<C, Plain["aliases"]>>
					: true
			) extends infer H
		? H extends AnyErr
			? H
			: ClauseTerms<
					OrderBy,
					WithAliases<C, Plain["aliases"]>,
					Cells["length"],
					"ORDER"
				>
		: never;

type WithAliases<C extends SqCtx, A extends SqColMap> = {
	readonly [K in keyof C]: K extends "aliases" ? A : C[K];
} extends infer W extends SqCtx
	? W
	: never;

type ClauseTerms<
	O extends readonly Expr[],
	C extends SqCtx,
	N extends number,
	W extends "GROUP" | "ORDER",
	I extends number = 0,
> = O[I] extends infer E extends Expr
	? IntTerm<E> extends infer V extends IntVal
		? PositionOk<V, N, I, W> extends AnyErr
			? PositionOk<V, N, I, W>
			: ClauseTerms<O, C, N, W, Next<I>>
		: (W extends "GROUP" ? HasAgg<E, C["db"]> : false) extends true
			? SqlError<
					"aggregate functions are not allowed in the GROUP BY clause",
					NameAt<"group">
				>
			: TypeOf<E, C> extends AnyErr
				? TypeOf<E, C>
				: ClauseTerms<O, C, N, W, Next<I>>
	: true;
