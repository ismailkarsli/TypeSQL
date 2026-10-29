import type { Expr, NamedWindow, Target, WindowSpec } from "../ast.js";
import type { AnyErr, ErrMsg, SqlError } from "../errors.js";
import type { Nx } from "../parser/util.js";
import type { AnyShaped, BaseOf } from "../shape.js";
import type { IntLitValue, NumLitType } from "../typer/operators.js";
import type { TypeList, TypeOf } from "../typer/typeof.js";
import type { ColInfo, Cols, Ctx } from "../types.js";

type DisplayNames = {
	int2: "smallint";
	int4: "integer";
	int8: "bigint";
	float4: "real";
	float8: "double precision";
	bool: "boolean";
	varchar: "character varying";
	bpchar: "character";
	char: '"char"';
	varbit: "bit varying";
	timestamptz: "timestamp with time zone";
	timestamp: "timestamp without time zone";
	timetz: "time with time zone";
	time: "time without time zone";
	lit: "text";
	null: "unknown";
};
export type TypeDisplay<T extends string> = T extends AnyShaped
	? BaseOf<T>
	: T extends `${infer E}[]`
		? `${TypeDisplay<E>}[]`
		: T extends keyof DisplayNames
			? DisplayNames[T]
			: T;

export type CheckCondition<
	Clause extends string,
	E extends Expr | null,
	C extends Ctx,
> = E extends null
	? true
	: TypeOf<NonNullable<E>, C> extends infer T
		? T extends ColInfo
			? T["type"] extends "bool" | "unknown" | "null"
				? true
				: E extends { readonly t: "str" }
					? true
					: SqlError<
							`argument of ${Clause} must be type boolean, not type ${TypeDisplay<T["type"]>}`,
							null
						>
			: T
		: never;

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
		? OutputExprs<Ts, Cs, N, [...Acc, Ts[I]["e"]], Nx<I>>
		: Cs[I] extends { readonly star: infer M }
			? N extends keyof M
				? OutputExprs<
						Ts,
						Cs,
						N,
						[...Acc, { t: "col"; tbl: null; name: N }],
						Nx<I>
					>
				: OutputExprs<Ts, Cs, N, Acc, Nx<I>>
			: OutputExprs<Ts, Cs, N, Acc, Nx<I>>;

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
			? [null, ...L][N] extends infer X
				? X extends undefined
					? SqlError<`${Clause} position ${P} is not in select list`, null>
					: X
				: never
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
		? Ordinal<Neg, V, Clause, TargetExprs<Ts, [], 0>, HasStar<Cs>>
		: E extends { readonly t: "str" }
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
		? Ordinal<Neg, V, "GROUP BY", TargetExprs<Ts, [], 0>, HasStar<Cs>>
		: E extends { readonly t: "str" }
			? SqlError<"non-integer constant in GROUP BY", null>
			: E extends {
						readonly t: "col";
						readonly tbl: null;
						readonly name: infer N extends string;
					}
				? TypeOf<E, C> extends infer T
					? T extends ColInfo
						? E
						: ErrMsg<T> extends `column "${string}" does not exist`
							? OutputExprs<Ts, Cs, N, [], 0> extends infer Ms extends
									readonly unknown[]
								? Ms extends readonly []
									? T
									: AllSame<Ms> extends true
										? Ms[0]
										: SqlError<`GROUP BY "${N}" is ambiguous`, null>
								: never
							: T
					: never
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
			: ResolveSortKeys<Items, Clause, Ts, Cs, C, [...Acc, K], Nx<I>>
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
		: ResolveGroupKey<Items[I], Ts, Cs, C> extends infer K
			? K extends AnyErr
				? K
				: CheckGroupBy<Items, Ts, Cs, C, Nx<I>>
			: never
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
			: DistinctWalk<D, O, false, [...Seen, O[I]], Nx<I>>
		: DistinctWalk<D, O, true, Seen, Nx<I>>;
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
> = DistinctOrderWalk<O, TargetExprs<Ts, [], 0>, HasStar<Cs>, 0>;
type TargetExprs<
	Ts extends readonly Target[],
	Acc extends readonly unknown[],
	I extends number,
> = Ts[I] extends undefined
	? Acc
	: TargetExprs<Ts, [...Acc, Ts[I]["e"]], Nx<I>>;
type DistinctOrderWalk<
	O extends readonly unknown[],
	Es extends readonly unknown[],
	Star extends boolean,
	I extends number,
> = O[I] extends undefined
	? true
	: O[I] extends null
		? DistinctOrderWalk<O, Es, Star, Nx<I>>
		: InList<O[I], Es> extends true
			? DistinctOrderWalk<O, Es, Star, Nx<I>>
			: [Star, O[I]] extends [true, { readonly t: "col" }]
				? DistinctOrderWalk<O, Es, Star, Nx<I>>
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
	: OutputOrderItem<Items[I], Cs> extends infer R
		? R extends AnyErr
			? R
			: CheckOutputOrder<Items, Cs, Nx<I>>
		: never;
type OutputOrderItem<E extends Expr, Cs extends Cols> =
	SignedNum<E, false> extends [
		infer Neg extends boolean,
		infer V extends string,
	]
		? Ordinal<Neg, V, "ORDER BY", Cs, HasStar<Cs>>
		: E extends { readonly t: "str" }
			? SqlError<"non-integer constant in ORDER BY", null>
			: E extends {
						readonly t: "col";
						readonly tbl: infer Tb;
						readonly name: infer N extends string;
					}
				? Tb extends string
					? SqlError<`missing FROM-clause entry for table "${Tb}"`, null>
					: OutputNameCount<Cs, N, [], 0> extends infer K
						? K extends readonly []
							? SqlError<`column "${N}" does not exist`, null>
							: K extends readonly [unknown]
								? true
								: SqlError<`ORDER BY "${N}" is ambiguous`, null>
						: never
				: SqlError<"invalid UNION/INTERSECT/EXCEPT ORDER BY clause", null>;
type OutputNameCount<
	Cs extends Cols,
	N extends string,
	Acc extends readonly unknown[],
	I extends number,
> = Cs[I] extends undefined
	? Acc
	: Cs[I] extends { readonly n: N }
		? OutputNameCount<Cs, N, [...Acc, 0], Nx<I>>
		: Cs[I] extends { readonly star: infer M }
			? OutputNameCount<Cs, N, N extends keyof M ? [...Acc, 0] : Acc, Nx<I>>
			: OutputNameCount<Cs, N, Acc, Nx<I>>;

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
		: CheckWindowSpec<Ws[I]["spec"], Defs, C> extends infer R
			? R extends boolean
				? CheckWindowClause<
						Ws,
						C,
						Defs & { readonly [K in Ws[I]["name"]]: R },
						Nx<I>
					>
				: R
			: never;

export type CheckWindowSpec<
	S extends WindowSpec,
	Defs extends WindowDefs,
	C extends Ctx,
> =
	TypeList<S["partition"], C, []> extends infer P
		? P extends readonly ColInfo[]
			? TypeList<S["order"], C, []> extends infer O
				? O extends readonly ColInfo[]
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
					: O
				: never
			: P
		: never;

export type CheckWindowRefs<
	Es extends readonly Expr[],
	Defs extends WindowDefs,
	C extends Ctx,
	I extends number = 0,
> = Es[I] extends undefined
	? true
	: CheckSpecs<Wins<Es[I], []>, Defs, C> extends infer R
		? R extends AnyErr
			? R
			: CheckWindowRefs<Es, Defs, C, Nx<I>>
		: never;
type CheckSpecs<
	Ss,
	Defs extends WindowDefs,
	C extends Ctx,
> = Ss extends readonly [infer S extends WindowSpec, ...infer R]
	? CheckWindowSpec<S, Defs, C> extends infer X
		? X extends boolean
			? CheckSpecs<R, Defs, C>
			: X
		: never
	: true;

type Wins<E, Acc> = E extends {
	readonly t: "call";
	readonly args: readonly unknown[];
	readonly win: unknown;
}
	? WinsOf<E["args"], Acc, 0> extends infer A extends readonly unknown[]
		? E["win"] extends WindowSpec
			? [...A, E["win"]]
			: A
		: never
	: E extends {
				readonly t: "bin" | "isdistinct" | "quant";
				readonly l: unknown;
				readonly r: unknown;
			}
		? Wins<E["r"], Wins<E["l"], Acc>>
		: E extends {
					readonly t: "array" | "row";
					readonly items: readonly unknown[];
				}
			? WinsOf<E["items"], Acc, 0>
			: E extends {
						readonly t: "case";
						readonly operand: unknown;
						readonly whens: readonly {
							readonly when: unknown;
							readonly then: unknown;
						}[];
						readonly else: unknown;
					}
				? Wins<E["else"], WhenWins<E["whens"], Wins<E["operand"], Acc>, 0>>
				: E extends {
							readonly t: "between";
							readonly e: unknown;
							readonly lo: unknown;
							readonly hi: unknown;
						}
					? Wins<E["hi"], Wins<E["lo"], Wins<E["e"], Acc>>>
					: E extends {
								readonly t: "in";
								readonly e: unknown;
								readonly list: readonly unknown[];
							}
						? WinsOf<E["list"], Wins<E["e"], Acc>, 0>
						: E extends {
									readonly t: "like";
									readonly e: unknown;
									readonly pat: unknown;
								}
							? Wins<E["pat"], Wins<E["e"], Acc>>
							: E extends {
										readonly t: "idx";
										readonly e: unknown;
										readonly i: unknown;
									}
								? Wins<E["i"], Wins<E["e"], Acc>>
								: E extends {
											readonly t: "attz";
											readonly e: unknown;
											readonly zone: unknown;
										}
									? Wins<E["zone"], Wins<E["e"], Acc>>
									: E extends { readonly e: unknown }
										? Wins<E["e"], Acc>
										: Acc;
type WinsOf<
	L extends readonly unknown[],
	Acc,
	I extends number,
> = L[I] extends undefined ? Acc : WinsOf<L, Wins<L[I], Acc>, Nx<I>>;
type WhenWins<
	L extends readonly { readonly when: unknown; readonly then: unknown }[],
	Acc,
	I extends number,
> = L[I] extends undefined
	? Acc
	: WhenWins<L, Wins<L[I]["then"], Wins<L[I]["when"], Acc>>, Nx<I>>;
