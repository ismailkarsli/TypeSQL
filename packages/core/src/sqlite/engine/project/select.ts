import type { NarrowKeys, NarrowLevel } from "../../../engine/narrow.js";
import type { Nx } from "../../../engine/parse.js";
import type { ColInfo, Scope } from "../../../engine/types.js";
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
import type {
	BindFrom,
	CteEntry,
	NullLevel,
	StarCells,
	UniqueCells,
} from "../binder/scope.js";
import type { IsAggCall } from "../typer/functions.js";
import type { Common, Info, TypeList, TypeOf } from "../typer/typeof.js";
import type {
	AggMode,
	Cell,
	SqColMap,
	SqCteMap,
	SqCtx,
	SqLevel,
} from "../types.js";

export type ProjectSelect<
	Q extends SelectStmt,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
> =
	BindWith<Q["with"], DB, Outer, Ctes> extends infer C2
		? C2 extends SqCteMap
			? ProjectBody<Q["body"], DB, Outer, C2, Q["orderBy"]> extends infer R
				? R extends readonly Cell[]
					? CheckLimit<Q, DB, Outer, C2> extends infer L
						? L extends AnyErr
							? L
							: R
						: never
					: R
				: never
			: C2
		: never;

type CheckLimit<
	Q extends SelectStmt,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
> = TypeList<
	[
		...(Q["limit"] extends Expr ? [Q["limit"]] : []),
		...(Q["offset"] extends Expr ? [Q["offset"]] : []),
	],
	Ctx<DB, Outer, Ctes, "none", {}>
>;

type Ctx<
	DB,
	S extends Scope,
	Ctes extends SqCteMap,
	Agg extends AggMode,
	Aliases extends SqColMap,
	AggScope extends Scope = S,
> = {
	readonly db: DB;
	readonly scope: S;
	readonly aggScope: AggScope;
	readonly ctes: Ctes;
	readonly agg: Agg;
	readonly inAgg: false;
	readonly aliases: Aliases;
};

export type BindWith<
	W,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
> = W extends WithClause ? CteLoop<W["ctes"], DB, Outer, Ctes, 0> : Ctes;

type CteLoop<
	L extends readonly Cte[],
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	I extends number,
> = L[I] extends infer C extends Cte
	? CteCells<C, DB, Outer, Ctes> extends infer R
		? R extends readonly Cell[]
			? CteLoop<
					L,
					DB,
					Outer,
					Ctes & { readonly [K in C["name"]]: CteEntry<R> },
					Nx<I>
				>
			: R
		: never
	: Ctes;

type CteCells<C extends Cte, DB, Outer extends Scope, Ctes extends SqCteMap> = (
	C["q"]["body"] extends {
		readonly t: "setop";
		readonly l: infer Anchor extends SelectBody;
	}
		? LeftMost<Anchor> extends infer A extends SelectBody
			? ProjectBody<A, DB, Outer, Ctes, []> extends infer AC
				? AC extends readonly Cell[]
					? Renamed<C, AC> extends infer RC
						? RC extends readonly Cell[]
							? ProjectSelect<
									C["q"],
									DB,
									Outer,
									Ctes & { readonly [K in C["name"]]: CteEntry<RC> }
								>
							: RC
						: never
					: AC
				: never
			: never
		: ProjectSelect<C["q"], DB, Outer, Ctes>
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
		? {
				[I in keyof R]: {
					readonly n: C["cols"][I & keyof C["cols"]] extends {
						readonly n: infer N extends string;
					}
						? N
						: R[I]["n"];
					readonly t: R[I]["t"];
				};
			}
		: SqlError<
				`table ${C["display"]} has ${R["length"]} values for ${C["cols"]["length"]} columns`,
				null
			>
	: R;

export type ProjectBody<
	B extends SelectBody,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	OrderBy extends readonly Expr[],
> = B extends { readonly t: "simple" }
	? ProjectSimple<Extract<B, SimpleSelect>, DB, Outer, Ctes, OrderBy>
	: B extends { readonly t: "values" }
		? ProjectValues<B["rows"], DB, Outer, Ctes>
		: B extends { readonly t: "setop" }
			? ProjectSetOp<Extract<B, SetOp>, DB, Outer, Ctes, OrderBy>
			: never;

type ProjectSetOp<
	B extends SelectBody & { readonly t: "setop" },
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	OrderBy extends readonly Expr[],
> =
	ProjectBody<B["l"], DB, Outer, Ctes, []> extends infer L
		? L extends readonly Cell[]
			? ProjectBody<B["r"], DB, Outer, Ctes, []> extends infer R
				? R extends readonly Cell[]
					? L["length"] extends R["length"]
						? MergeCells<L, R, B["op"]> extends infer M extends readonly Cell[]
							? CompoundOrder<OrderBy, M> extends infer O
								? O extends AnyErr
									? O
									: M
								: never
							: never
						: SqlError<
								`SELECTs to the left and right of ${Uppercase<B["op"]>}${B["all"] extends true ? " ALL" : ""} do not have the same number of result columns`,
								null
							>
					: R
				: never
			: L
		: never;

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
						? CompoundOrder<O, M, Nx<I>>
						: SqlError<
								`${Ordinal<Nx<I>>} ORDER BY term does not match any column in the result set`,
								null
							>
					: never
				: SqlError<
						`${Ordinal<Nx<I>>} ORDER BY term does not match any column in the result set`,
						null
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
			: E extends { readonly t: "un"; readonly op: "+"; readonly e: infer X }
				? IntTerm<X>
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
type Dec = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Hex = Dec | "a" | "b" | "c" | "d" | "e" | "f";
type Len<
	S extends string,
	A extends unknown[] = [],
> = S extends `${string}${infer R}`
	? A["length"] extends 20
		? 20
		: Len<R, [...A, 0]>
	: A["length"];

type DecimalValue<D extends string> =
	Digits<D, Dec> extends true
		? D extends ""
			? 0
			: Len<D> extends 1 | 2 | 3
				? D extends `${infer K extends number}`
					? K
					: null
				: Len<D> extends 4 | 5 | 6 | 7 | 8 | 9
					? "big"
					: Len<D> extends 10
						? DigitsLE<D, "2147483647"> extends true
							? "big"
							: null
						: null
		: null;
type DigitsLE<
	A extends string,
	B extends string,
> = A extends `${infer X extends Dec}${infer AR}`
	? B extends `${infer Y extends Dec}${infer BR}`
		? X extends Y
			? DigitsLE<AR, BR>
			: DecIndex<X> extends infer XI extends number
				? DecIndex<Y> extends infer YI extends number
					? GE<YI, XI>
					: false
				: false
		: false
	: true;
type DecIndex<D extends Dec> = {
	"0": 0;
	"1": 1;
	"2": 2;
	"3": 3;
	"4": 4;
	"5": 5;
	"6": 6;
	"7": 7;
	"8": 8;
	"9": 9;
}[D];
type HexIndex<H extends string> =
	Lowercase<H> extends Dec
		? DecIndex<Lowercase<H> & Dec>
		: { a: 10; b: 11; c: 12; d: 13; e: 14; f: 15 }[Lowercase<H> &
				("a" | "b" | "c" | "d" | "e" | "f")];
type HexValue<H extends string> =
	Digits<Lowercase<H>, Hex> extends true
		? H extends ""
			? 0
			: H extends `${infer C}`
				? Len<H> extends 1
					? HexIndex<C>
					: Len<H> extends 2 | 3 | 4 | 5 | 6 | 7
						? "big"
						: Len<H> extends 8
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
> = P["neg"] extends true
	? OutOfRange<I, N>
	: P["v"] extends infer K extends number
		? K extends 0
			? OutOfRange<I, N>
			: GE<N, K> extends true
				? true
				: OutOfRange<I, N>
		: OutOfRange<I, N>;
type OutOfRange<I extends number, N extends number> = SqlError<
	`${Ordinal<Nx<I>>} ORDER BY term out of range - should be between 1 and ${N}`,
	null
>;
type Ordinal<N extends number> = N extends 1
	? "1st"
	: N extends 2
		? "2nd"
		: N extends 3
			? "3rd"
			: `${N}th`;
type GE<A extends number, B extends number> =
	Tup<A> extends [...Tup<B>, ...unknown[]] ? true : false;
type Tup<N extends number, A extends unknown[] = []> = A["length"] extends N
	? A
	: Tup<N, [...A, 0]>;

type ProjectValues<
	Rows extends readonly (readonly Expr[])[],
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
> =
	ValuesRows<Rows, Ctx<DB, Outer, Ctes, "none", {}>, 0, []> extends infer R
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
		readonly n: `column${Nx<I extends `${infer K extends number}` ? K : 0>}`;
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
	? TypeList<Row, C> extends infer X
		? X extends readonly ColInfo[]
			? ValuesRows<Rows, C, Nx<I>, [...Acc, X]>
			: X
		: never
	: Acc;

export type HasAgg<E, DB> = E extends { readonly t: string }
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
					: HasAggList<L, DB, Nx<I>>
			: HasAggList<L, DB, Nx<I>>;

type TargetsHaveAgg<
	Ts extends readonly Target[],
	DB,
	I extends number = 0,
> = Ts[I] extends infer T extends Target
	? T extends { readonly t: "expr"; readonly e: infer E }
		? HasAgg<E, DB> extends true
			? true
			: TargetsHaveAgg<Ts, DB, Nx<I>>
		: TargetsHaveAgg<Ts, DB, Nx<I>>
	: false;
type ListHasAgg<
	L extends readonly Expr[],
	DB,
	I extends number = 0,
> = L[I] extends infer E extends Expr
	? HasAgg<E, DB> extends true
		? true
		: ListHasAgg<L, DB, Nx<I>>
	: false;

type AggModeOf<
	S extends SimpleSelect,
	OrderBy extends readonly Expr[],
	DB,
> = S["groupBy"] extends readonly Expr[]
	? "group"
	: TargetsHaveAgg<S["targets"], DB> extends true
		? "whole"
		: ListHasAgg<OrderBy, DB> extends true
			? "whole"
			: S["having"] extends Expr
				? HasAgg<S["having"], DB> extends true
					? "whole"
					: "bad-having"
				: "none";

type ProjectSimple<
	S extends SimpleSelect,
	DB,
	Outer extends Scope,
	Ctes extends SqCteMap,
	OrderBy extends readonly Expr[],
> =
	BindFrom<S["from"], DB, Outer, Ctes> extends infer L
		? L extends SqLevel
			? CheckWhere<
					S["where"],
					DB,
					[L, ...Outer],
					Ctes,
					S["targets"]
				> extends infer W
				? W extends AnyErr
					? W
					: (
								S["where"] extends Expr
									? NarrowLevel<L, NarrowKeys<S["where"]>>
									: L
							) extends infer NL extends SqLevel
						? AggModeOf<S, OrderBy, DB> extends "bad-having"
							? SqlError<"HAVING clause on a non-aggregate query", null>
							: AggModeOf<S, OrderBy, DB> extends infer Mode extends AggMode
								? (
										Mode extends "whole"
											? Ctx<
													DB,
													[NullLevel<NL>, ...Outer],
													Ctes,
													"whole",
													{},
													[NL, ...Outer]
												>
											: Ctx<DB, [NL, ...Outer], Ctes, Mode, {}>
									) extends infer C extends SqCtx
									? ProjectTargets<
											S["targets"],
											NL,
											C,
											0,
											[]
										> extends infer Cells
										? Cells extends readonly Cell[]
											? CheckClauses<
													S,
													OrderBy,
													Cells,
													C,
													Ctx<
														DB,
														[L, ...Outer],
														Ctes,
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
			: L
		: never;

type CheckWhere<
	W,
	DB,
	S extends Scope,
	Ctes extends SqCteMap,
	Targets extends readonly Target[],
> = W extends Expr
	? TypeOf<W, Ctx<DB, S, Ctes, "none", {}>> extends infer X
		? X extends SqlError<`no such column: ${string}`, unknown>
			? TypeOf<
					W,
					Ctx<DB, S, Ctes, "none", AliasesOnly<Targets, DB, S, Ctes>>
				> extends infer Y
				? Y extends AnyErr
					? Y
					: true
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
		? TypeOf<E, Ctx<DB, S, Ctes, "none", {}>> extends infer X
			? X extends ColInfo
				? {
						readonly type: X["type"];
						readonly nullable: X["nullable"];
						readonly n: A;
					}
				: { readonly type: "any"; readonly nullable: true; readonly n: A }
			: never
		: never;
};

type AliasMap<
	Targets extends readonly Target[],
	Cells extends readonly Cell[],
> = {
	readonly [C in Cells[number] as Lowercase<C["n"]>]: {
		readonly type: C["t"]["type"];
		readonly nullable: C["t"]["nullable"];
		readonly n: C["n"];
	};
} & (Targets extends unknown ? {} : never);

type ProjectTargets<
	Ts extends readonly Target[],
	L extends SqLevel,
	C extends SqCtx,
	I extends number,
	Acc extends readonly Cell[],
> = Ts[I] extends infer T extends Target
	? T extends {
			readonly t: "star";
			readonly tbl: infer Tb extends string | null;
		}
		? (
				C["scope"] extends readonly [infer L0 extends SqLevel, ...unknown[]]
					? StarCells<L0, Tb>
					: never
			) extends infer S
			? S extends readonly Cell[]
				? ProjectTargets<Ts, L, C, Nx<I>, [...Acc, ...S]>
				: S
			: never
		: T extends {
					readonly t: "expr";
					readonly e: infer E extends Expr;
					readonly alias: infer A;
					readonly span: infer Sp extends string;
				}
			? TypeOf<E, C> extends infer X
				? X extends ColInfo
					? ProjectTargets<
							Ts,
							L,
							C,
							Nx<I>,
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
								} & (A extends string
									? {}
									: E extends { readonly t: "col" }
										? {}
										: DerivedName<E, C, Sp, Acc["length"]>),
							]
						>
					: X
				: never
			: never
	: Acc;

type Unwrapped<E extends Expr> = E extends {
	readonly t: "collate";
	readonly e: infer X extends Expr;
}
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
				? { readonly d: `column${Nx<K>}` }
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
		? GroupBy<S["groupBy"], Plain, Cells["length"]>
		: true
) extends infer G
	? G extends AnyErr
		? G
		: (
					S["having"] extends Expr
						? TypeOf<S["having"], WithAliases<C, Plain["aliases"]>>
						: true
				) extends infer H
			? H extends AnyErr
				? H
				: OrderTerms<
						OrderBy,
						WithAliases<C, Plain["aliases"]>,
						Cells["length"],
						0
					>
			: never
	: never;

type WithAliases<C extends SqCtx, A extends SqColMap> = {
	readonly [K in keyof C]: K extends "aliases" ? A : C[K];
} extends infer W extends SqCtx
	? W
	: never;

type GroupBy<
	G extends readonly Expr[],
	C extends SqCtx,
	N extends number,
	I extends number = 0,
> = G[I] extends infer E extends Expr
	? IntTerm<E> extends infer V extends IntVal
		? PositionOk<V, N, I> extends infer P
			? P extends AnyErr
				? SqlError<
						`${Ordinal<Nx<I>>} GROUP BY term out of range - should be between 1 and ${N}`,
						null
					>
				: GroupBy<G, C, N, Nx<I>>
			: never
		: HasAgg<E, C["db"]> extends true
			? SqlError<
					"aggregate functions are not allowed in the GROUP BY clause",
					null
				>
			: TypeOf<E, C> extends infer X
				? X extends AnyErr
					? X
					: GroupBy<G, C, N, Nx<I>>
				: never
	: true;

type OrderTerms<
	O extends readonly Expr[],
	C extends SqCtx,
	N extends number,
	I extends number,
> = O[I] extends infer E extends Expr
	? IntTerm<E> extends infer V extends IntVal
		? PositionOk<V, N, I> extends infer P
			? P extends AnyErr
				? P
				: OrderTerms<O, C, N, Nx<I>>
			: never
		: TypeOf<E, C> extends infer X
			? X extends AnyErr
				? X
				: OrderTerms<O, C, N, Nx<I>>
			: never
	: true;

export type { UniqueCells };
