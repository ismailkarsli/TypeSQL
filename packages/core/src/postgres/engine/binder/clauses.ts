import type { Next } from "../../../engine/next.js";
import type { ColInfo, Cols, ScopeLevel } from "../../../engine/types.js";
import type { AnyErr, ErrMsg, SqlError } from "../../../errors.js";
import type { Expr, NamedWindow, Tag, Target, WindowSpec } from "../ast.js";
import type { IntLitValue, NumLitType } from "../literals.js";
import type { NullableLevel, TypeDisplay } from "../shape.js";
import type { LookupFn } from "../typer/catalog.js";
import type { TypeList, TypeOf } from "../typer/typeof.js";
import type { Ctx } from "../types.js";

/**
 * Whether aggregates see a group of rows. A grouping set can be empty (the
 * total row of ROLLUP), so an aggregate under GROUPING SETS may see no rows.
 */
export type Grouped<GroupBy, Sets> = Sets extends false
	? GroupBy extends null
		? false
		: true
	: false;

/** The FROM columns as GROUP BY's grouping sets leave them: nullable when a set leaves them out. */
export type SetsLevel<L extends ScopeLevel, Sets> = Sets extends false
	? L
	: NullableLevel<
			L,
			Sets extends readonly unknown[] ? LeftOut<L, Sets> : string
		>;
type LeftOut<
	L extends ScopeLevel,
	Is extends readonly unknown[],
> = Is extends readonly [infer H, ...infer R]
	? H extends { readonly t: "col"; readonly name: infer N }
		? N extends LevelNames<L>
			? N | LeftOut<L, R>
			: string
		: string
	: never;
type LevelNames<L extends ScopeLevel> = {
	[I in keyof L]: keyof L[I]["cols"];
}[number];

export type CheckCondition<
	Clause extends string,
	E extends Expr | null,
	C extends Ctx,
> = E extends null
	? true
	: TypeOf<NonNullable<E>, C> extends infer T extends ColInfo
		? T["type"] extends "bool" | "unknown" | "null"
			? true
			: E extends Tag<"str">
				? true
				: SqlError<
						`argument of ${Clause} must be type boolean, not type ${TypeDisplay<T["type"]>}`,
						null
					>
		: TypeOf<NonNullable<E>, C>;

export type HasStar<C extends Cols> =
	Extract<C[number], { readonly star: unknown }> extends never ? false : true;

type OutputExprs<
	Ts extends readonly Target[],
	Cs extends Cols,
	N extends string,
	Acc extends readonly unknown[],
	I extends number,
> = Cs[I] extends undefined
	? Acc
	: Cs[I] extends { readonly n: N }
		? OutputExprs<Ts, Cs, N, [...Acc, Ts[I]["e"]], Next<I>>
		: Cs[I] extends { readonly star: infer M }
			? N extends keyof M
				? OutputExprs<
						Ts,
						Cs,
						N,
						[...Acc, { t: "col"; tbl: null; name: N }],
						Next<I>
					>
				: OutputExprs<Ts, Cs, N, Acc, Next<I>>
			: OutputExprs<Ts, Cs, N, Acc, Next<I>>;

type SameExpr<A, B> = A extends {
	readonly t: "col";
	readonly tbl: infer AT;
	readonly name: infer AN;
}
	? B extends {
			readonly t: "col";
			readonly tbl: infer BT;
			readonly name: infer BN;
		}
		? [AN] extends [BN]
			? AT extends null
				? true
				: BT extends null
					? true
					: [AT] extends [BT]
						? true
						: false
			: false
		: false
	: [A, B] extends [B, A]
		? true
		: false;
type InList<X, L extends readonly unknown[]> = L extends readonly [
	infer H,
	...infer R,
]
	? SameExpr<X, H> extends true
		? true
		: InList<X, R>
	: false;
type AllSame<L extends readonly unknown[]> = L extends readonly [
	infer H,
	...infer R extends readonly [unknown, ...unknown[]],
]
	? InList<H, R> extends true
		? AllSame<R>
		: false
	: true;

type SignedNum<E, Neg extends boolean> = E extends {
	readonly t: "num";
	readonly v: infer V;
}
	? [Neg, V]
	: E extends { readonly t: "un"; readonly op: "-"; readonly e: infer X }
		? SignedNum<X, Neg extends true ? false : true>
		: null;

type Ordinal<
	Neg extends boolean,
	V extends string,
	Clause extends string,
	L extends readonly unknown[],
	Star extends boolean,
> =
	NumLitType<V> extends "int4"
		? Position<Signed<Neg, IntLitValue<V> & string>, Clause, L, Star>
		: SqlError<`non-integer constant in ${Clause}`, null>;
type Signed<Neg extends boolean, D extends string> = Neg extends true
	? D extends "0"
		? D
		: `-${D}`
	: D;
type Position<
	P extends string,
	Clause extends string,
	L extends readonly unknown[],
	Star extends boolean,
> = P extends "0" | `-${string}`
	? SqlError<`${Clause} position ${P} is not in select list`, null>
	: Star extends true
		? null
		: P extends `${infer N extends number}`
			? [null, ...L][N] extends undefined
				? SqlError<`${Clause} position ${P} is not in select list`, null>
				: [null, ...L][N]
			: never;

type CheckExpr<E extends Expr, C extends Ctx> =
	TypeOf<E, C> extends infer T ? (T extends ColInfo ? E : T) : never;

type ResolveSortKey<
	E extends Expr,
	Clause extends string,
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
> =
	SignedNum<E, false> extends [
		infer Neg extends boolean,
		infer V extends string,
	]
		? Ordinal<Neg, V, Clause, TargetExprs<Ts>, HasStar<Cs>>
		: E extends Tag<"str" | "bool" | "null">
			? SqlError<`non-integer constant in ${Clause}`, null>
			: E extends {
						readonly t: "col";
						readonly tbl: null;
						readonly name: infer N extends string;
					}
				? OutputExprs<Ts, Cs, N, [], 0> extends infer Ms extends
						readonly unknown[]
					? Ms extends readonly []
						? CheckExpr<E, C>
						: AllSame<Ms> extends true
							? Ms[0]
							: SqlError<`${Clause} "${N}" is ambiguous`, null>
					: never
				: CheckExpr<E, C>;

type ResolveGroupKey<
	E extends Expr,
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
> =
	SignedNum<E, false> extends [
		infer Neg extends boolean,
		infer V extends string,
	]
		? Ordinal<Neg, V, "GROUP BY", TargetExprs<Ts>, HasStar<Cs>>
		: E extends Tag<"str" | "bool" | "null">
			? SqlError<"non-integer constant in GROUP BY", null>
			: E extends {
						readonly t: "col";
						readonly tbl: null;
						readonly name: infer N extends string;
					}
				? TypeOf<E, C> extends ColInfo
					? E
					: ErrMsg<TypeOf<E, C>> extends `column "${string}" does not exist`
						? OutputExprs<Ts, Cs, N, [], 0> extends infer Ms extends
								readonly unknown[]
							? Ms extends readonly []
								? TypeOf<E, C>
								: AllSame<Ms> extends true
									? Ms[0]
									: SqlError<`GROUP BY "${N}" is ambiguous`, null>
							: never
						: TypeOf<E, C>
				: CheckExpr<E, C>;

export type ResolveSortKeys<
	Items extends readonly Expr[],
	Clause extends string,
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
	Acc extends readonly unknown[] = [],
	I extends number = 0,
> = Items[I] extends undefined
	? Acc
	: ResolveSortKey<Items[I], Clause, Ts, Cs, C> extends infer K
		? K extends AnyErr
			? K
			: ResolveSortKeys<Items, Clause, Ts, Cs, C, [...Acc, K], Next<I>>
		: never;

export type CheckGroupBy<
	Items extends readonly Expr[] | null,
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
	I extends number = 0,
> = Items extends readonly Expr[]
	? Items[I] extends undefined
		? true
		: ResolveGroupKey<Items[I], Ts, Cs, C> extends AnyErr
			? ResolveGroupKey<Items[I], Ts, Cs, C>
			: CheckGroupBy<Items, Ts, Cs, C, Next<I>>
	: true;

export type CheckDistinctOnOrder<
	D extends readonly unknown[],
	O extends readonly unknown[],
> = null extends D[number] | O[number]
	? true
	: DistinctWalk<D, O, false, [], 0>;
type DistinctWalk<
	D extends readonly unknown[],
	O extends readonly unknown[],
	Skipped extends boolean,
	Seen extends readonly unknown[],
	I extends number,
> = O[I] extends undefined
	? Skipped extends true
		? AllIn<D, Seen> extends true
			? true
			: DistinctOnErr
		: true
	: InList<O[I], D> extends true
		? Skipped extends true
			? DistinctOnErr
			: DistinctWalk<D, O, false, [...Seen, O[I]], Next<I>>
		: DistinctWalk<D, O, true, Seen, Next<I>>;
type AllIn<
	D extends readonly unknown[],
	Seen extends readonly unknown[],
> = D extends readonly [infer H, ...infer R]
	? InList<H, Seen> extends true
		? AllIn<R, Seen>
		: false
	: true;
type DistinctOnErr = SqlError<
	"SELECT DISTINCT ON expressions must match initial ORDER BY expressions",
	null
>;

export type CheckDistinctOrder<
	O extends readonly unknown[],
	Ts extends readonly Target[],
	Cs extends Cols,
> = DistinctOrderWalk<O, TargetExprs<Ts>, HasStar<Cs>, 0>;
export type TargetExprs<Ts extends readonly Target[]> = {
	readonly [K in keyof Ts]: Ts[K]["e"];
};
type DistinctOrderWalk<
	O extends readonly unknown[],
	Es extends readonly unknown[],
	Star extends boolean,
	I extends number,
> = O[I] extends undefined
	? true
	: O[I] extends null
		? DistinctOrderWalk<O, Es, Star, Next<I>>
		: InList<O[I], Es> extends true
			? DistinctOrderWalk<O, Es, Star, Next<I>>
			: [Star, O[I]] extends [true, Tag<"col">]
				? DistinctOrderWalk<O, Es, Star, Next<I>>
				: SqlError<
						"for SELECT DISTINCT, ORDER BY expressions must appear in select list",
						null
					>;

export type CheckOutputOrder<
	Items extends readonly Expr[],
	Cs extends Cols,
	I extends number = 0,
> = Items[I] extends undefined
	? true
	: OutputOrderItem<Items[I], Cs> extends AnyErr
		? OutputOrderItem<Items[I], Cs>
		: CheckOutputOrder<Items, Cs, Next<I>>;
type OutputOrderItem<E extends Expr, Cs extends Cols> =
	SignedNum<E, false> extends [
		infer Neg extends boolean,
		infer V extends string,
	]
		? Ordinal<Neg, V, "ORDER BY", Cs, HasStar<Cs>>
		: E extends Tag<"str" | "bool" | "null">
			? SqlError<"non-integer constant in ORDER BY", null>
			: E extends {
						readonly t: "col";
						readonly tbl: infer Tb;
						readonly name: infer N extends string;
					}
				? Tb extends string
					? SqlError<`missing FROM-clause entry for table "${Tb}"`, null>
					: OutputNameCount<Cs, N, [], 0> extends readonly []
						? SqlError<`column "${N}" does not exist`, null>
						: OutputNameCount<Cs, N, [], 0> extends readonly [unknown]
							? true
							: SqlError<`ORDER BY "${N}" is ambiguous`, null>
				: SqlError<"invalid UNION/INTERSECT/EXCEPT ORDER BY clause", null>;
type OutputNameCount<
	Cs extends Cols,
	N extends string,
	Acc extends readonly unknown[],
	I extends number,
> = Cs[I] extends undefined
	? Acc
	: Cs[I] extends { readonly n: N }
		? OutputNameCount<Cs, N, [...Acc, 0], Next<I>>
		: Cs[I] extends { readonly star: infer M }
			? OutputNameCount<Cs, N, N extends keyof M ? [...Acc, 0] : Acc, Next<I>>
			: OutputNameCount<Cs, N, Acc, Next<I>>;

export type WindowDefs = { readonly [name: string]: boolean };

export type CheckWindowClause<
	Ws extends readonly NamedWindow[],
	C extends Ctx,
	Defs extends WindowDefs = {},
	I extends number = 0,
> = Ws[I] extends undefined
	? Defs
	: Ws[I]["name"] extends keyof Defs
		? SqlError<`window "${Ws[I]["name"]}" is already defined`, null>
		: CheckWindowSpec<Ws[I]["spec"], Defs, C> extends infer R extends boolean
			? CheckWindowClause<
					Ws,
					C,
					Defs & { readonly [K in Ws[I]["name"]]: R },
					Next<I>
				>
			: CheckWindowSpec<Ws[I]["spec"], Defs, C>;

type CheckWindowSpec<
	S extends WindowSpec,
	Defs extends WindowDefs,
	C extends Ctx,
> =
	TypeList<S["partition"], C, []> extends readonly ColInfo[]
		? TypeList<S["order"], C, []> extends readonly ColInfo[]
			? S["name"] extends string
				? S["name"] extends keyof Defs
					? S["partition"] extends readonly []
						? Defs[S["name"]] extends true
							? S["order"] extends readonly []
								? true
								: SqlError<
										`cannot override ORDER BY clause of window "${S["name"]}"`,
										null
									>
							: S["order"] extends readonly []
								? false
								: true
						: SqlError<
								`cannot override PARTITION BY clause of window "${S["name"]}"`,
								null
							>
					: SqlError<`window "${S["name"]}" does not exist`, null>
				: S["order"] extends readonly []
					? false
					: true
			: TypeList<S["order"], C, []>
		: TypeList<S["partition"], C, []>;

export type CheckWindowRefs<
	Es extends readonly Expr[],
	Defs extends WindowDefs,
	C extends Ctx,
	I extends number = 0,
> = [Extract<Calls<Es[number]>, { readonly win: WindowSpec }>] extends [never]
	? true
	: CheckWindowRefsAt<Es, Defs, C, I>;
type CheckWindowRefsAt<
	Es extends readonly Expr[],
	Defs extends WindowDefs,
	C extends Ctx,
	I extends number,
> = Es[I] extends undefined
	? true
	: CheckSpecs<Wins<Es[I]>, Defs, C> extends infer R
		? [R] extends [true]
			? CheckWindowRefsAt<Es, Defs, C, Next<I>>
			: Exclude<R, true>
		: never;
type CheckSpecs<
	S,
	Defs extends WindowDefs,
	C extends Ctx,
> = S extends WindowSpec
	? CheckWindowSpec<S, Defs, C> extends infer R
		? R extends boolean
			? true
			: R
		: never
	: true;
type Wins<E> =
	Calls<E> extends infer K
		? K extends { readonly win: infer S extends WindowSpec }
			? S
			: never
		: never;

type ScalarLeaf = {
	readonly t:
		| "col"
		| "star"
		| "param"
		| "num"
		| "str"
		| "bool"
		| "null"
		| "typed"
		| "default";
};

type IsAggName<DB, N extends string> =
	LookupFn<DB, N> extends infer O
		? true extends (
				(O extends readonly unknown[] ? O[number] : O) extends {
					readonly agg: true;
				}
					? true
					: false
			)
			? true
			: false
		: false;

// The walks below go breadth-first over a union of AST nodes, one level per
// step, so their depth is the AST's depth (tail-recursive), not a multiple of it.
// These expression shapes cannot contain a call outside a subquery. Checking
// their structure avoids walking every node of ordinary predicates.
type CallFree =
	| ScalarLeaf
	| {
			readonly t:
				| "cast"
				| "un"
				| "collate"
				| "is"
				| "field"
				| "named"
				| "variadic";
			readonly e: CallFree;
	  }
	| {
			readonly t: "bin" | "isdistinct";
			readonly l: CallFree;
			readonly r: CallFree;
	  }
	| { readonly t: "array" | "row"; readonly items: readonly CallFree[] }
	| {
			readonly t: "in";
			readonly e: CallFree;
			readonly list: readonly CallFree[];
	  }
	| {
			readonly t: "between";
			readonly e: CallFree;
			readonly lo: CallFree;
			readonly hi: CallFree;
	  }
	| { readonly t: "like"; readonly e: CallFree; readonly pat: CallFree }
	| {
			readonly t: "quant";
			readonly l: CallFree;
			readonly r: CallFree | { readonly t: "select" };
	  }
	| {
			readonly t: "sub" | "exists" | "arraysub";
			readonly q: { readonly t: "select" };
	  }
	| {
			readonly t: "insub";
			readonly e: CallFree;
			readonly q: { readonly t: "select" };
	  };
type Children<U> = U extends CallFree | { readonly t: "select" }
	? never
	: U extends readonly unknown[]
		? U[number]
		: U extends object
			? U[keyof U]
			: never;
type AggCall<U, DB> = U extends {
	readonly t: "call";
	readonly name: infer N extends string;
	readonly over: false;
}
	? IsAggName<DB, N> extends true
		? U
		: never
	: never;
type Kind<U, DB> = U extends { readonly t: "call"; readonly over: true }
	? "win"
	: [AggCall<U, DB>] extends [never]
		? never
		: "agg";

type CallKinds<U, DB> = Kind<Calls<U>, DB>;
// Collect once without a database context, then classify the calls as needed.
type Calls<U, Acc = never> = [U] extends [never]
	? Acc
	: Calls<Children<U>, Acc | Extract<U, { readonly t: "call" }>>;
type AggCalls<U, DB> = AggCall<Calls<U>, DB>;

/**
 * PostgreSQL's errors for aggregate and window calls where they can't be. An
 * aggregate in a subquery's WHERE may belong to the outer query, so only a
 * top-level WHERE is checked for aggregates.
 */
export type CallPlacement<Where, Targets, DB, TopLevel extends boolean> =
	CallKinds<Where, DB> extends infer K
		? "win" extends K
			? SqlError<"window functions are not allowed in WHERE", null>
			: TopLevel extends true
				? "agg" extends K
					? SqlError<"aggregate functions are not allowed in WHERE", null>
					: NestedAgg<AggCalls<Targets, DB>, DB>
				: NestedAgg<AggCalls<Targets, DB>, DB>
		: never;
type NestedAgg<Calls, DB> = (
	Calls extends { readonly args: infer A; readonly filter: infer F }
		? CallKinds<[A, F], DB>
		: never
) extends infer K
	? "agg" extends K
		? SqlError<"aggregate function calls cannot be nested", null>
		: "win" extends K
			? SqlError<
					"aggregate function calls cannot contain window function calls",
					null
				>
			: true
	: never;
