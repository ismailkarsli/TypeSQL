// Column lists of the MySQL and SQLite engines: CREATE and ALTER TABLE, and
// the order of a relation's columns. Schema columns carry their position
// (`i`), which orders `SELECT *` and `INSERT … VALUES` without a column list.
import type { Next } from "../next.js";
import type { IsUnion, Members } from "../object.js";

export type LowerAll<L extends readonly unknown[]> = {
	[I in keyof L]: Lowercase<L[I] & string>;
};

/** `O` without the names `X`. */
export type Without<O extends readonly string[], X> = O extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? H extends X
		? Without<R, X>
		: [H, ...Without<R, X>]
	: [];

/** The columns of `Rel` that `*` lists: all but invisible ones. */
export type VisibleKeys<Rel> = {
	[K in keyof Rel & string]: Rel[K] extends { readonly hidden: true }
		? never
		: K;
}[keyof Rel & string];

/**
 * The columns `Keys` of `Rel` by position, or `null` when one of several has
 * none: a union's member order is not the schema's declaration order.
 */
export type PositionOrder<Rel, Keys extends string> = Rel[Keys &
	keyof Rel] extends { readonly i: number }
	? ByIndex<PositionMap<Rel, Keys>, 0, []>
	: IsUnion<Keys> extends true
		? null
		: [Keys];
// Each column's name by its position, built once: walking it is one lookup
// per column, where scanning every column for each position is quadratic.
type PositionMap<Rel, Keys extends string> = {
	[K in Keys & keyof Rel as Rel[K] extends {
		readonly i: infer I extends number;
	}
		? I
		: never]: K;
};
/** Names by position `0…`; a dropped column leaves a gap, and the walk goes on while a position is left. */
type ByIndex<
	M,
	N extends number,
	Acc extends readonly string[],
	Seen extends number = never,
> = N extends keyof M
	? ByIndex<M, Next<N>, [...Acc, M[N] & string], Seen | N>
	: [Exclude<keyof M, Seen>] extends [never]
		? Acc
		: ByIndex<M, Next<N>, Acc, Seen>;

/** `Keys` lowercase by position, or in no particular order without positions. */
export type ColumnOrder<Rel, Keys extends string> = LowerAll<
	PositionOrder<Rel, Keys> extends infer O extends readonly string[]
		? O
		: Members<Keys>
>;

/** `Keys` lowercase by position, or `null` without positions. */
export type KnownOrder<Rel, Keys extends string> =
	PositionOrder<Rel, Keys> extends infer O extends readonly string[]
		? LowerAll<O>
		: null;

/** `primaryKey` is `false` or how the column is a primary key. */
type ColumnDef = { readonly name: string; readonly primaryKey: unknown };

/** The columns declared `PRIMARY KEY` inline, lowercase. */
export type ColumnPks<
	Cols extends readonly ColumnDef[],
	Acc extends readonly string[] = [],
> = Cols extends readonly [
	infer H extends ColumnDef,
	...infer R extends readonly ColumnDef[],
]
	? ColumnPks<
			R,
			H["primaryKey"] extends false ? Acc : [...Acc, Lowercase<H["name"]>]
		>
	: Acc;

/** The first column whose name, ignoring case, an earlier one has, or `null`. */
export type DupName<
	Cols extends readonly ColumnDef[],
	Seen extends string = never,
> = Cols extends readonly [
	infer H extends ColumnDef,
	...infer R extends readonly ColumnDef[],
]
	? Lowercase<H["name"]> extends Seen
		? H["name"]
		: DupName<R, Seen | Lowercase<H["name"]>>
	: null;

/** Each element `c` of `L` with its position `i`. */
export type Indexed<L extends readonly unknown[]> = {
	[I in keyof L]: {
		readonly c: L[I];
		readonly i: I extends `${infer N extends number}` ? N : 0;
	};
};

/** The position of a column added to `Rel`: after the last one. */
export type AppendIndex<Rel> = NextIndex<
	{
		[P in keyof Rel]: Rel[P] extends { readonly i: infer N extends number }
			? N
			: never;
	}[keyof Rel]
>;
// Positions are 0…n-1 unless a column was dropped: count up while each one
// exists (one membership check per column), and look for the largest one
// only after a gap.
type NextIndex<
	U extends number,
	A extends unknown[] = [],
	Seen extends number = never,
> = A["length"] extends U
	? NextIndex<U, [...A, 0], Seen | A["length"]>
	: [Exclude<U, Seen>] extends [never]
		? A["length"]
		: Next<MaxOf<U>>;
type MaxOf<U extends number, A extends unknown[] = []> = [U] extends [never]
	? 0
	: [Exclude<U, A["length"]>] extends [never]
		? A["length"]
		: MaxOf<Exclude<U, A["length"]>, [...A, 0]>;
