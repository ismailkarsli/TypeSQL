import type { Expr, NamedWindow, Target, WindowSpec } from "../ast.js";
import type { AnyErr, ErrMsg, SqlError } from "../errors.js";
import type { Nx } from "../parser/util.js";
import type { AnyShaped, BaseOf } from "../shape.js";
import type { NumLitType } from "../typer/operators.js";
import type { TypeList, TypeOf } from "../typer/typeof.js";
import type { ColInfo, Cols, Ctx } from "../types.js";

/**
 * Validation of the clauses that refer to a query level's output: ORDER BY, GROUP BY,
 * DISTINCT ON, the WINDOW clause and window references, and boolean conditions.
 * Every check returns `true` (or the resolved keys) or an `SqlError`. Messages follow
 * PostgreSQL 18.
 *
 * Name resolution (Postgres `findTargetlistEntrySQL92`):
 *   - an integer literal is a 1-based output position;
 *   - ORDER BY / DISTINCT ON: a bare name matching an output column refers to it (more than
 *     one output column of that name with different expressions is ambiguous), otherwise it
 *     is an input column;
 *   - GROUP BY: a bare name is an input column first, an output column otherwise;
 *   - anything else is an expression over the input columns (output aliases are not visible).
 */

// ─── display names ───

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
/** Postgres's display name of a canonical type (`format_type`), for messages. */
export type TypeDisplay<T extends string> = T extends AnyShaped
	? BaseOf<T>
	: T extends `${infer E}[]`
		? `${TypeDisplay<E>}[]`
		: T extends keyof DisplayNames
			? DisplayNames[T]
			: T;

// ─── conditions ───

/** `WHERE` / `HAVING` / `JOIN/ON` condition: typed, and boolean (or NULL / an untyped literal or param). */
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

// ─── output references ───

export type HasStar<C extends Cols> = true extends (
	C[number] extends infer E
		? E extends { readonly star: unknown }
			? true
			: false
		: never
)
	? true
	: false;

/** Expressions of the output columns named `N` (a `*` entry containing `N` contributes a bare column reference). */
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

/**
 * Do two (resolved) expressions denote the same value? Column references compare by name,
 * and by qualifier when both are qualified; anything else structurally.
 */
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
	: [A] extends [B]
		? [B] extends [A]
			? true
			: false
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
	...infer R,
]
	? R extends readonly []
		? true
		: InList<H, R> extends true
			? AllSame<R>
			: false
	: true;

type DigitsOnly<V extends string> = V extends `${infer C}${infer R}`
	? C extends "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
		? DigitsOnly<R>
		: false
	: true;

/** `ORDER BY 2`: the target expression at that position, `null` when unknown (a `*` precedes it), or an error. */
type Ordinal<
	V extends string,
	Clause extends string,
	Ts extends readonly Target[],
	Cs extends Cols,
> =
	DigitsOnly<V> extends false
		? SqlError<`non-integer constant in ${Clause}`, null>
		: NumLitType<NoLeadingZeros<V>> extends "int4"
			? HasStar<Cs> extends true
				? null
				: NoLeadingZeros<V> extends `${infer N extends number}`
					? N extends 0
						? SqlError<`${Clause} position 0 is not in select list`, null>
						: [null, ...Ts][N] extends infer T
							? T extends Target
								? T["e"]
								: SqlError<
										`${Clause} position ${N} is not in select list`,
										null
									>
							: never
					: never
			: SqlError<`non-integer constant in ${Clause}`, null>; // past int4, as Postgres reads it
/** `007` → `7` (an ordinal is the integer the literal denotes). */
type NoLeadingZeros<V extends string> = V extends `0${infer R}`
	? R extends ""
		? "0"
		: NoLeadingZeros<R>
	: V;

type CheckExpr<E extends Expr, C extends Ctx> =
	TypeOf<E, C> extends infer T ? (T extends ColInfo ? E : T) : never;

/** Resolve one ORDER BY / DISTINCT ON item (SQL92 rules: output names first). */
type ResolveSortKey<
	E extends Expr,
	Clause extends string,
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
> = E extends { readonly t: "num"; readonly v: infer V extends string }
	? Ordinal<V, Clause, Ts, Cs>
	: E extends { readonly t: "str" }
		? SqlError<`non-integer constant in ${Clause}`, null>
		: E extends {
					readonly t: "un";
					readonly op: "-";
					readonly e: { readonly t: "num"; readonly v: infer V extends string };
				}
			? SqlError<`${Clause} position -${V} is not in select list`, null>
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

/** Resolve one GROUP BY item (input columns first, then output names). */
type ResolveGroupKey<
	E extends Expr,
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
> = E extends { readonly t: "num"; readonly v: infer V extends string }
	? Ordinal<V, "GROUP BY", Ts, Cs>
	: E extends { readonly t: "str" }
		? SqlError<"non-integer constant in GROUP BY", null>
		: E extends {
					readonly t: "col";
					readonly tbl: null;
					readonly name: infer N extends string;
				}
			? TypeOf<E, C> extends infer T
				? T extends ColInfo // type-mutate: equivalent cond-false – CheckGroupBy only looks for an error, and the output lookup gives none for a typed column
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

/** ORDER BY / DISTINCT ON items → resolved keys (target expressions or input expressions; `null` = unknown) or an error. */
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

/** GROUP BY items → `true` or an error. */
export type CheckGroupBy<
	Items extends readonly Expr[] | null,
	Ts extends readonly Target[],
	Cs extends Cols,
	C extends Ctx,
	I extends number = 0,
> = Items extends readonly Expr[]
	? Items[I] extends undefined
		? true // type-mutate: equivalent bool-flip – the callers only look for an error
		: ResolveGroupKey<Items[I], Ts, Cs, C> extends infer K
			? K extends AnyErr
				? K
				: CheckGroupBy<Items, Ts, Cs, C, Nx<I>>
			: never
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

/**
 * `SELECT DISTINCT ON (d...) ... ORDER BY o...`: the ORDER BY must start with DISTINCT ON
 * expressions only, and if it goes on with others, all DISTINCT ON expressions must have
 * been listed first (Postgres `transformDistinctOnClause`). Unknown keys skip the check.
 */
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
			? true // type-mutate: equivalent bool-flip – the callers only look for an error
			: DistinctOnErr
		: true // type-mutate: equivalent bool-flip – the callers only look for an error
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
	: true; // type-mutate: equivalent never-false – a never passes the caller's `AllIn<…> extends true` too
type DistinctOnErr = SqlError<
	"SELECT DISTINCT ON expressions must match initial ORDER BY expressions",
	null
>;

/**
 * `SELECT DISTINCT ... ORDER BY o`: every ORDER BY expression must be one of the targets. With a
 * `*` target a column reference is taken to be one of its columns.
 */
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

/** ORDER BY of a set operation: output names and positions only. */
export type CheckOutputOrder<
	Items extends readonly Expr[],
	Cs extends Cols,
	I extends number = 0,
> = Items[I] extends undefined
	? true // type-mutate: equivalent bool-flip – the caller only looks for an error
	: OutputOrderItem<Items[I], Cs> extends infer R
		? R extends AnyErr
			? R
			: CheckOutputOrder<Items, Cs, Nx<I>>
		: never;
type OutputOrderItem<E extends Expr, Cs extends Cols> = E extends {
	readonly t: "num";
	readonly v: infer V extends string;
}
	? DigitsOnly<V> extends false
		? SqlError<"non-integer constant in ORDER BY", null>
		: NumLitType<NoLeadingZeros<V>> extends "int4"
			? HasStar<Cs> extends true
				? true
				: NoLeadingZeros<V> extends `${infer N extends number}`
					? [null, ...Cs][N] extends undefined
						? PosErr<`${N}`>
						: N extends 0
							? PosErr<"0">
							: true
					: never
			: SqlError<"non-integer constant in ORDER BY", null>
	: E extends { readonly t: "str" }
		? SqlError<"non-integer constant in ORDER BY", null>
		: E extends {
					readonly t: "col";
					readonly tbl: infer Tb;
					readonly name: infer N extends string;
				}
			? Tb extends string
				? SqlError<`missing FROM-clause entry for table "${Tb}"`, null>
				: OutputNameCount<Cs, N, [], 0> extends infer K extends
							readonly unknown[]
					? K extends readonly []
						? SqlError<`column "${N}" does not exist`, null>
						: K extends readonly [unknown]
							? true
							: SqlError<`ORDER BY "${N}" is ambiguous`, null>
					: never
			: SqlError<"invalid UNION/INTERSECT/EXCEPT ORDER BY clause", null>;
type PosErr<V extends string> = SqlError<
	`ORDER BY position ${V} is not in select list`,
	null
>;
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

// ─── windows ───

/** Window definitions visible in a query level: name → whether the window has an ORDER BY. */
export type WindowDefs = { readonly [name: string]: boolean };

/**
 * `WINDOW w AS (...), ...` in order: names are unique, a definition may build on an
 * earlier one, and expressions are typed against the input columns. → `WindowDefs` or error.
 */
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

/**
 * One window specification (`OVER (...)`, `OVER w`, a WINDOW clause entry) → whether it
 * has an ORDER BY, or an error. A referenced window must exist; its PARTITION BY cannot be
 * overridden, nor its ORDER BY when it has one.
 */
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

/** Check the window references (`OVER ...`) in a list of expressions. → `true` or error. */
export type CheckWindowRefs<
	Es extends readonly Expr[],
	Defs extends WindowDefs,
	C extends Ctx,
	I extends number = 0,
> = Es[I] extends undefined
	? true // type-mutate: equivalent bool-flip – the callers only look for an error
	: CheckSpecs<Wins<Es[I]>, Defs, C> extends infer R
		? R extends AnyErr
			? R
			: CheckWindowRefs<Es, Defs, C, Nx<I>>
		: never;
/** Check a union of window specifications (distributive; the first error wins). */
type CheckSpecs<Ss, Defs extends WindowDefs, C extends Ctx> = [Ss] extends [
	never,
]
	? true // type-mutate: equivalent bool-flip – the callers only look for an error
	: (
				Ss extends WindowSpec
					? CheckWindowSpec<Ss, Defs, C> extends infer X
						? X extends boolean
							? never
							: X
						: never
					: never
			) extends infer Errs
		? [Errs] extends [never]
			? true // type-mutate: equivalent bool-flip – the callers only look for an error
			: FirstOf<Errs>
		: never;
type FirstOf<U> = (U extends unknown ? (u: U) => void : never) extends (
	u: infer F,
) => void
	? F
	: U;

/**
 * Nodes without a window inside: leaves, and subqueries (their own query level). A shortcut: the
 * last branch of `Wins` gives `never` for them too (`x IN (SELECT …)` is not one: its `x` is walked).
 */
type LeafTag =
	| "col" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "num" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "str" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "bool" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "null" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "param" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "default" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "typed" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "star" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "sub" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "exists" // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
	| "arraysub"; // type-mutate: equivalent union-drop – a shortcut: Wins gives never for this node anyway
/**
 * Window specifications of the calls in an expression, as a union (`never` when there are
 * none). Subqueries are not entered (they are their own query level). Plain recursion over
 * indexed accesses: each node is visited once (an explicit stack of AST subtrees in a
 * tail-recursive loop measured quadratic).
 */
type Wins<E> = E extends { readonly t: LeafTag } | null
	? never
	: E extends {
				readonly t: "call";
				readonly args: readonly unknown[];
				readonly win: unknown;
			}
		? (E["win"] extends null ? never : E["win"]) | WinsOf<E["args"], never, 0>
		: E extends {
					readonly t: "bin" | "isdistinct";
					readonly l: unknown;
					readonly r: unknown;
				}
			? SpineWins<E["l"], Wins<E["r"]>>
			: E extends {
						readonly t: "array" | "row";
						readonly items: readonly unknown[];
					}
				? WinsOf<E["items"], never, 0>
				: E extends {
							readonly t: "case";
							readonly operand: unknown;
							readonly whens: readonly {
								readonly when: unknown;
								readonly then: unknown;
							}[];
							readonly else: unknown;
						}
					?
							| Wins<E["operand"]>
							| Wins<E["else"]>
							| WhenWins<E["whens"], never, 0>
					: E extends {
								readonly t: "between";
								readonly e: unknown;
								readonly lo: unknown;
								readonly hi: unknown;
							}
						? Wins<E["e"]> | Wins<E["lo"]> | Wins<E["hi"]>
						: E extends {
									readonly t: "in";
									readonly e: unknown;
									readonly list: readonly unknown[];
								}
							? Wins<E["e"]> | WinsOf<E["list"], never, 0>
							: E extends {
										readonly t: "like";
										readonly e: unknown;
										readonly pat: unknown;
									}
								? Wins<E["e"]> | Wins<E["pat"]>
								: E extends {
											readonly t: "idx";
											readonly e: unknown;
											readonly i: unknown;
										}
									? Wins<E["e"]> | Wins<E["i"]>
									: E extends {
												readonly t: "attz";
												readonly e: unknown;
												readonly zone: unknown;
											}
										? Wins<E["e"]> | Wins<E["zone"]>
										: E extends {
													readonly t: "quant";
													readonly l: unknown;
													readonly r: unknown;
												}
											? // the right side is an array expression, or a subquery (its own level)
													| Wins<E["l"]>
													| (E["r"] extends { readonly t: "select" }
															? never
															: Wins<E["r"]>)
											: E extends { readonly e: unknown }
												? Wins<E["e"]>
												: never;
/** Left-nested operator chains (`a || b || c ...`) are walked down the left spine iteratively. */
type SpineWins<E, Acc> = E extends {
	readonly t: "bin" | "isdistinct";
	readonly l: unknown;
	readonly r: unknown;
}
	? SpineWins<E["l"], Acc | Wins<E["r"]>>
	: Acc | Wins<E>;
type WinsOf<
	L extends readonly unknown[],
	Acc,
	I extends number,
> = L[I] extends undefined ? Acc : WinsOf<L, Acc | Wins<L[I]>, Nx<I>>;
type WhenWins<
	L extends readonly { readonly when: unknown; readonly then: unknown }[],
	Acc,
	I extends number,
> = L[I] extends undefined
	? Acc
	: WhenWins<L, Acc | Wins<L[I]["when"]> | Wins<L[I]["then"]>, Nx<I>>;
