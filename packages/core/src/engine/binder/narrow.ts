import type { Nx } from "../parser/util.js";
import type { ColMap, ScopeItem, ScopeLevel } from "../types.js";

/**
 * Nullability narrowing from null-rejecting predicates (PLAN M7, "WHERE c IS NOT NULL").
 *
 * A row survives `WHERE p` (or an INNER JOIN's `ON p`) only when `p` is TRUE. When `p` is a
 * top-level `AND` of conjuncts, every conjunct is TRUE, and some conjuncts prove a column
 * non-null:
 *
 *   c IS NOT NULL, c NOTNULL, c IS TRUE, c IS FALSE, c (a boolean column on its own)
 *   c <op> e, e <op> c      for comparison and other strict boolean operators (=, <, ~~, @>, ...)
 *   c [NOT] LIKE / ILIKE / SIMILAR TO e (both sides), c [NOT] IN (...), c op ANY/ALL (...)
 *   c BETWEEN a AND b (c, a and b), c NOT BETWEEN a AND b (c only)
 *
 * where `c` is a column reference, possibly under casts / COLLATE. Nothing is inferred
 * through OR or NOT (`NOT (c IS NULL)`, `c IS NOT NULL OR x` do not narrow).
 *
 * Keys are `readonly [qualifier | null, name]`. `NarrowLevel` marks the matching columns of
 * one query level non-null: a qualified key matches the item with that alias; a bare key
 * matches every item where the name is visible unqualified (more than one would be an
 * ambiguity error reported elsewhere). The level is returned unchanged (same type, so
 * cached `TypeOf` results are shared with the parameter pass) when no nullable column is hit.
 */
export type NarrowKeys<E> = AndKeys<E, never>;

/** Walk an AND tree: down the left spine iteratively, into right operands recursively (the parser balances AND chains). */
type AndKeys<E, Acc> = E extends {
	readonly t: "bin";
	readonly op: "and";
	readonly l: unknown;
	readonly r: unknown;
}
	? AndKeys<E["l"], Acc | AndKeys<E["r"], never>>
	: Acc | ConjunctKeys<E>;

/** Strict boolean operators: a TRUE result implies both operands are non-null. */
type StrictBoolOp =
	| "="
	| "<"
	| ">"
	| "<="
	| ">="
	| "<>"
	| "!="
	| "~"
	| "~*"
	| "!~"
	| "!~*"
	| "~~"
	| "~~*"
	| "!~~"
	| "!~~*"
	| "@>"
	| "<@"
	| "&&"
	| "?"
	| "?|"
	| "?&"
	| "@@"
	| "@?";

type ConjunctKeys<E> = E extends { readonly t: "col" }
	? ColKey<E>
	: E extends {
				readonly t: "is";
				readonly e: infer X;
				readonly what: infer W;
				readonly not: infer N;
			}
		? W extends "null"
			? N extends true
				? ColKey<X>
				: never
			: W extends "true" | "false"
				? N extends false
					? ColKey<X>
					: never
				: never
		: E extends {
					readonly t: "bin";
					readonly op: infer Op;
					readonly l: infer L;
					readonly r: infer R;
				}
			? Op extends StrictBoolOp
				? ColKey<L> | ColKey<R>
				: never
			: E extends {
						readonly t: "like";
						readonly e: infer X;
						readonly pat: infer P;
					}
				? ColKey<X> | ColKey<P>
				: E extends {
							readonly t: "between";
							readonly e: infer X;
							readonly lo: infer Lo;
							readonly hi: infer Hi;
							readonly not: infer N;
						}
					? N extends true
						? ColKey<X>
						: ColKey<X> | ColKey<Lo> | ColKey<Hi>
					: E extends { readonly t: "in" | "insub"; readonly e: infer X }
						? ColKey<X>
						: E extends { readonly t: "quant"; readonly l: infer X }
							? ColKey<X>
							: never;

type ColKey<E> = E extends {
	readonly t: "col";
	readonly tbl: infer Tb;
	readonly name: infer N;
}
	? readonly [Tb, N]
	: E extends { readonly t: "cast" | "collate"; readonly e: infer X }
		? ColKey<X>
		: never;

/** Keys for `USING (a, b)` / NATURAL join columns (bare names). */
export type UsingKeys<U extends string> = U extends string // type-mutate: equivalent cond-true – distributes over the names either way
	? readonly [null, U]
	: never;

/** Mark the columns named by `Keys` non-null in a scope level (unchanged level when nothing nullable is hit). */
// the shortcuts return `L` itself, which keeps cached `TypeOf` results shared; narrowing a level
// without a hit gives an equal type
export type NarrowLevel<L extends ScopeLevel, Keys> = [Keys] extends [never] // type-mutate: equivalent cond-false – a shortcut (an equal type)
	? L
	: AnyHit<L, Keys, 0> extends true // type-mutate: equivalent cond-true – a shortcut (an equal type)
		? {
				readonly [I in keyof L]: L[I] extends ScopeItem // type-mutate: equivalent cond-true – a level holds scope items only
					? NarrowItem<L[I], Keys>
					: L[I]; // type-mutate: equivalent never-false – a level holds scope items only
			}
		: L;

type Hit<A, K, Skip, Keys> = readonly [A, K] extends Keys
	? true
	: K extends Skip
		? false
		: readonly [null, K] extends Keys
			? true
			: false;

/**
 * Does any key hit a nullable column of the level? (Only for the shortcut: an answer of true, or
 * a never that reads as true, narrows a level that has nothing to narrow, which is the same.)
 */
type AnyHit<
	L extends ScopeLevel,
	Keys,
	I extends number,
> = L[I] extends ScopeItem // type-mutate: equivalent never-true – only the shortcut reads it
	? true extends ItemHits<
			// type-mutate: equivalent never-true cond-true – only the shortcut reads it
			L[I]["cols"],
			L[I]["alias"],
			L[I]["skip"][number],
			Keys
		>
		? true
		: AnyHit<L, Keys, Nx<I>> // type-mutate: equivalent never-false – only the shortcut reads it
	: false; // type-mutate: equivalent never-false bool-flip – only the shortcut reads it
type ItemHits<M extends ColMap, A, Skip, Keys> = {
	[K in keyof M]: M[K]["nullable"] extends true ? Hit<A, K, Skip, Keys> : never; // type-mutate: equivalent cond-true – only the shortcut reads it
}[keyof M];

type NarrowItem<It extends ScopeItem, Keys> = {
	readonly alias: It["alias"];
	readonly cols: NarrowCols<It["cols"], It["alias"], It["skip"][number], Keys>;
	readonly skip: It["skip"];
};
type NarrowCols<M extends ColMap, A, Skip, Keys> = {
	readonly [K in keyof M]: M[K]["nullable"] extends true // type-mutate: equivalent cond-true – a non-null column written as non-null is the same column
		? Hit<A, K, Skip, Keys> extends true
			? { readonly type: M[K]["type"]; readonly nullable: false }
			: M[K]
		: M[K];
};
