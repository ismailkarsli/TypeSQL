// Binder leaves shared by the MySQL and SQLite engines: walking the items of
// a FROM level and building them.
import type { Next } from "../next.js";
import type { Without } from "./ddl.js";
import type { Cell, ColMap, ColOf, Item, Level } from "./types.js";

export type RefDisplay<
	Ref extends { readonly schema: string | null; readonly name: string },
> = Ref["schema"] extends string
	? `${Ref["schema"]}.${Ref["name"]}`
	: Ref["name"];

export type CellsMap<C extends readonly Cell[]> = {
	readonly [E in C[number] as Lowercase<E["n"]>]: ColOf<
		E["t"]["type"],
		E["t"]["nullable"],
		E["n"]
	>;
};

/**
 * The key of `O` named `Lc`, ignoring case; `$`-prefixed keys are metadata,
 * not tables or columns.
 */
export type FindKey<O, Lc extends string> = Lc extends keyof O
	? Lc
	: {
			[K in keyof O & string]: K extends `$${string}`
				? never
				: Lowercase<K> extends Lowercase<Lc>
					? K
					: never;
		}[keyof O & string];

/** Cells `C` renamed by a column list `N`; a cell past its end keeps its name. */
export type RenameCells<
	C extends readonly Cell[],
	N extends readonly { readonly n: string }[],
> = {
	[I in keyof C]: {
		readonly n: N[I & keyof N] extends { readonly n: infer X extends string }
			? X
			: C[I]["n"];
		readonly t: C[I]["t"];
	};
};

/** Whether an item of `L` has a visible column `C`. */
export type LevelHas<L extends Level, C extends string> = true extends {
	[I in keyof L]: C extends keyof L[I]["cols"]
		? C extends L[I]["skip"][number]
			? false
			: true
		: false;
}[number]
	? true
	: false;

/** The columns of a `NATURAL` join: those of `L`, in order, that `R` has too. */
export type NaturalCols<L extends Level, R extends Level> =
	LevelNames<R> extends infer RN extends string
		? FilterNames<LevelOrder<L>, RN>
		: never;
type LevelNames<L extends Level> = {
	[I in keyof L]: Exclude<L[I]["order"][number], L[I]["skip"][number]>;
}[number];
type LevelOrder<
	L extends Level,
	I extends number = 0,
	Acc extends readonly string[] = [],
> = L[I] extends Item
	? LevelOrder<
			L,
			Next<I>,
			[...Acc, ...Without<L[I]["order"], L[I]["skip"][number]>]
		>
	: Acc;
type FilterNames<O extends readonly string[], Keep> = O extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? H extends Keep
		? [H, ...FilterNames<R, Keep>]
		: FilterNames<R, Keep>
	: [];

/**
 * The items of the nullable side of an outer join: every column nullable,
 * and `orig` keeps the columns as the relation has them.
 */
export type NullLevel<L extends Level> = {
	readonly [I in keyof L]: NullItem<L[I]>;
};
type NullItem<It extends Item> = {
	readonly [P in keyof It]: P extends "cols"
		? {
				readonly [K in keyof It["cols"]]: ColOf<
					It["cols"][K]["type"],
					true,
					It["cols"][K]["n"]
				>;
			}
		: It[P];
} & {
	readonly orig: It extends { readonly orig: infer O extends ColMap }
		? O
		: It["cols"];
};

/** Hides the `USING` columns `U` of each item of `L`. */
export type SkipIn<L extends Level, U extends string> = {
	readonly [I in keyof L]: {
		readonly [P in keyof L[I]]: P extends "skip"
			? [...L[I]["skip"], ...Extract<U, keyof L[I]["cols"]>[]]
			: L[I][P];
	};
};

/** Column `C` of whichever items of `L` have it. */
export type LevelCol<L extends Level, C extends string> = {
	[I in keyof L]: C extends keyof L[I]["cols"] ? L[I]["cols"][C] : never;
}[number];

/** The visible columns `Name` of `L`, each tagged with its item's index (a union when ambiguous). */
export type BareIn<L extends Level, Name extends string> = {
	[I in keyof L]: Name extends keyof L[I]["cols"]
		? Name extends L[I]["skip"][number]
			? never
			: Tag<L[I]["cols"][Name], I>
		: never;
}[number];
type Tag<C, I> = C & { readonly at: I };

/** The cells of `*` over level `L`. */
export type AllCells<
	L extends Level,
	I extends number,
	Acc extends readonly Cell[],
> = L[I] extends Item
	? AllCells<
			L,
			Next<I>,
			[...Acc, ...ItemCells<L[I], L[I]["order"], L[I]["skip"][number]>]
		>
	: Acc;
/** An item's cells; a skipped column the item substitutes (`subst`) is listed as that. */
export type ItemCells<
	It extends Item,
	O extends readonly string[],
	Skip,
	Acc extends readonly Cell[] = [],
> = O extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? H extends Skip
		? (
				It extends { readonly subst: infer S }
					? H extends keyof S
						? S[H]
						: null
					: null
			) extends {
				readonly type: infer T extends string;
				readonly nullable: infer N extends boolean;
				readonly n: infer D extends string;
			}
			? ItemCells<
					It,
					R,
					Skip,
					[
						...Acc,
						{
							readonly n: D;
							readonly t: { readonly type: T; readonly nullable: N };
						},
					]
				>
			: ItemCells<It, R, Skip, Acc>
		: ItemCells<
				It,
				R,
				Skip,
				[
					...Acc,
					{
						readonly n: It["cols"][H]["n"];
						readonly t: {
							readonly type: It["cols"][H]["type"];
							readonly nullable: It["cols"][H]["nullable"];
						};
					},
				]
			>
	: Acc;
