import type { Nx } from "../../../engine/parse.js";
import type { QueryContext, Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Table, View } from "../../../schema.js";
import type { UnionList } from "../../../sql/splice.js";
import type {
	Expr,
	FromItem,
	FromJoin,
	FromJsonTable,
	FromSub,
	JsonTableCol,
	TableRef,
} from "../ast.js";
import type { ProjectSelect } from "../project/select.js";
import type { CheckBool } from "../typer/typeof.js";
import type {
	Cell,
	FlavorOf,
	MkCtx,
	MyColMap,
	MyColOf,
	MyCteMap,
	MyItem,
	MyLevel,
	NormalizeType,
} from "../types.js";

type Env = QueryContext<unknown, Scope, MyCteMap>;

export type FindKey<O, Lc extends string> = Lc extends keyof O
	? Lc
	: {
			[K in keyof O & string]: K extends `$${string}`
				? never
				: Lowercase<K> extends Lowercase<Lc>
					? K
					: never;
		}[keyof O & string];

export type LookupRelation<
	DB,
	Ref extends TableRef,
> = Ref["schema"] extends null
	? LookupIn<DB, Ref["name"]>
	: FindKey<DB, Ref["schema"] & string> extends infer S extends keyof DB &
				string
		? [S] extends [never]
			? LookupIn<DB, Ref["name"]>
			: IsRel<DB[S]> extends true
				? LookupIn<DB, Ref["name"]>
				: LookupIn<DB[S], Ref["name"]>
		: null;
type LookupIn<N, Name extends string> =
	FindKey<N, Name> extends infer K extends keyof N & string
		? [K] extends [never]
			? null
			: IsRel<N[K]> extends true
				? [N[K], K]
				: null
		: null;

type IsRel<X> =
	X extends View<Table>
		? true
		: X extends object
			? X[keyof X] extends { readonly type: unknown }
				? true
				: false
			: false;

type RefDisplay<Ref extends TableRef> = Ref["schema"] extends string
	? `${Ref["schema"]}.${Ref["name"]}`
	: Ref["name"];

export type NoTable<Ref extends TableRef> = SqlError<
	`Table '${RefDisplay<Ref>}' doesn't exist`,
	null
>;

type TableCols<Tbl> = {
	readonly [K in keyof Tbl & string as Lowercase<K>]: MyColOf<
		Tbl[K] extends { readonly type: infer T } ? NormalizeType<T> : "unknown",
		Tbl[K] extends { readonly nullable: infer N } ? N : true,
		K
	> &
		(Tbl[K] extends { readonly generated: true } ? { readonly gen: true } : {});
};

/** Visible columns in table order: by position when the schema has one, else by name. */
type TableOrder<Tbl> =
	VisibleKeys<Tbl> extends infer V extends string
		? [V] extends [never]
			? []
			: Tbl[V & keyof Tbl] extends { readonly i: number }
				? ByIndex<PositionMap<Tbl, V>, 0, []>
				: LowerAll<UnionList<V>>
		: never;
type VisibleKeys<Tbl> = {
	[K in keyof Tbl & string]: Tbl[K] extends { readonly hidden: true }
		? never
		: K;
}[keyof Tbl & string];

/** The columns `INSERT INTO t VALUES (…)` without a column list fills: all but invisible ones. */
export type InsertOrder<Tbl> =
	TableOrder<Tbl> extends infer O extends readonly string[] ? O : [];

// Each visible column's name by its position, built once: walking it is one
// lookup per column, where scanning every column for each position is
// quadratic. A dropped or invisible column leaves a gap; the walk goes on
// while a position is left.
type PositionMap<Tbl, Keys extends string> = {
	[K in keyof Tbl & string as K extends Keys
		? Tbl[K] extends { readonly i: infer I extends number }
			? I
			: never
		: never]: Lowercase<K>;
};
export type ByIndex<
	M,
	N extends number,
	Acc extends readonly string[],
	Seen extends number = never,
> = N extends keyof M
	? ByIndex<M, Nx<N>, [...Acc, M[N] & string], Seen | N>
	: [Exclude<keyof M, Seen>] extends [never]
		? Acc
		: ByIndex<M, Nx<N>, Acc, Seen>;
export type LowerAll<L extends readonly unknown[]> = {
	[I in keyof L]: Lowercase<L[I] & string>;
};

export type RelationItem<Rel, Alias extends string> =
	Rel extends View<infer Cols extends Table>
		? TableItem<Cols, Alias>
		: Rel extends Table
			? TableItem<Rel, Alias>
			: null;
type TableItem<Tbl, Alias extends string> = {
	readonly alias: Alias;
	readonly cols: TableCols<Tbl>;
	readonly skip: [];
	readonly order: TableOrder<Tbl>;
};

type BindTable<
	DB,
	Ref extends TableRef,
	Alias extends string | null,
	Ctes extends MyCteMap,
> = Ref["schema"] extends null
	? Lowercase<Ref["name"]> extends keyof Ctes
		? [
				EntryItem<
					Ctes[Lowercase<Ref["name"]>],
					Alias extends string ? Alias : Lowercase<Ref["name"]>
				>,
			]
		: BindDbTable<DB, Ref, Alias>
	: BindDbTable<DB, Ref, Alias>;

type BindDbTable<DB, Ref extends TableRef, Alias extends string | null> =
	LookupRelation<DB, Ref> extends [infer Rel, string]
		? RelationItem<
				Rel,
				Alias extends string ? Alias : Lowercase<Ref["name"]>
			> extends infer It extends MyItem
			? [It]
			: NoTable<Ref>
		: NoTable<Ref>;

type EntryItem<
	E extends { readonly cols: unknown; readonly order: unknown },
	Alias extends string | null,
> = {
	readonly alias: Alias;
	readonly cols: E["cols"];
	readonly skip: [];
	readonly order: E["order"];
};

type CellsMap<C extends readonly Cell[]> = {
	readonly [E in C[number] as Lowercase<E["n"]>]: MyColOf<
		E["t"]["type"],
		E["t"]["nullable"],
		E["n"]
	>;
};

/** Derived tables, CTEs and views need unique column names. */
export type DupCell<
	C extends readonly Cell[],
	Seen extends string = never,
> = C extends readonly [
	infer H extends Cell,
	...infer R extends readonly Cell[],
]
	? Lowercase<H["n"]> extends Seen
		? SqlError<`Duplicate column name '${H["n"]}'`, null>
		: DupCell<R, Seen | Lowercase<H["n"]>>
	: null;

export type CteEntry<C extends readonly Cell[]> = {
	readonly cols: CellsMap<C>;
	readonly order: { [I in keyof C]: Lowercase<C[I]["n"]> };
};

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

export type BindFrom<
	F extends FromItem | null,
	E extends Env,
> = F extends FromItem
	? BindItem<F, E, []> extends infer L extends MyLevel
		? DupAlias<L, 0, never> extends infer D extends string
			? SqlError<`Not unique table/alias: '${D}'`, null>
			: L
		: BindItem<F, E, []>
	: [];

type DupAlias<L extends MyLevel, I extends number, Seen> = L[I] extends MyItem
	? L[I]["alias"] extends string
		? Lowercase<L[I]["alias"]> extends Seen
			? L[I]["alias"]
			: DupAlias<L, Nx<I>, Seen | Lowercase<L[I]["alias"]>>
		: DupAlias<L, Nx<I>, Seen>
	: null;

type BindItem<
	F extends FromItem,
	E extends Env,
	Sofar extends MyLevel,
> = F extends { readonly t: "table" }
	? BindTable<E["db"], F["ref"], F["alias"], E["ctes"]>
	: F extends { readonly t: "sub" }
		? BindDerived<Extract<F, FromSub>, E, Sofar>
		: F extends { readonly t: "jsontable" }
			? BindJsonTable<Extract<F, FromJsonTable>, E, Sofar>
			: F extends { readonly t: "join" }
				? BindJoin<Extract<F, FromJoin>, E, Sofar>
				: never;

type BindDerived<
	F extends FromSub,
	E extends Env,
	Sofar extends MyLevel,
> = F["lateral"] extends true
	? FlavorOf<E["db"]> extends "mariadb"
		? SqlError<"You have an error in your SQL syntax near 'LATERAL'", null>
		: BindDerivedAs<F, QueryContext<E["db"], [Sofar, ...E["scope"]], E["ctes"]>>
	: BindDerivedAs<F, E>;
type BindDerivedAs<F extends FromSub, E extends Env> = F["alias"] extends string
	? ProjectSelect<F["q"], E> extends infer C extends readonly Cell[]
		? (
				F["cols"] extends readonly { readonly n: string }[]
					? F["cols"]["length"] extends C["length"]
						? RenameCells<C, F["cols"]>
						: SqlError<
								"In definition of view, derived table or common table expression, SELECT list and column names list have different column counts",
								null
							>
					: C
			) extends infer R
			? R extends readonly Cell[]
				? DupCell<R> extends infer D extends AnyErr
					? D
					: [EntryItem<CteEntry<R>, F["alias"]>]
				: R
			: never
		: ProjectSelect<F["q"], E>
	: SqlError<"Every derived table must have its own alias", null>;

type BindJsonTable<
	F extends FromJsonTable,
	E extends Env,
	Sofar extends MyLevel,
> = F["alias"] extends string
	? CheckBool<
			F["doc"],
			MkCtx<E["db"], [Sofar, ...E["scope"]], E["ctes"]>
		> extends infer Err extends AnyErr
		? Err
		: JsonTableCells<F["cols"], false, []> extends infer C extends
					readonly Cell[]
			? DupCell<C> extends infer D extends AnyErr
				? D
				: [EntryItem<CteEntry<C>, F["alias"]>]
			: never
	: SqlError<"Every table function must have an alias", null>;

/** JSON_TABLE columns: values are `NULL` when the path finds nothing. */
type JsonTableCells<
	Cols extends readonly JsonTableCol[],
	Nested extends boolean,
	Acc extends readonly Cell[],
> = Cols extends readonly [
	infer H extends JsonTableCol,
	...infer R extends readonly JsonTableCol[],
]
	? JsonTableCells<
			R,
			Nested,
			H extends {
				readonly t: "ordinality";
				readonly name: infer N extends string;
			}
				? [
						...Acc,
						{
							readonly n: N;
							readonly t: {
								readonly type: "int unsigned";
								readonly nullable: Nested;
							};
						},
					]
				: H extends {
							readonly t: "path";
							readonly name: infer N extends string;
							readonly type: infer Ty extends string;
							readonly exists: infer Ex;
						}
					? [
							...Acc,
							{
								readonly n: N;
								readonly t: {
									readonly type: Ex extends true ? "int" : Ty;
									readonly nullable: Ex extends true ? Nested : true;
								};
							},
						]
					: H extends {
								readonly t: "nested";
								readonly cols: infer NC extends readonly JsonTableCol[];
							}
						? JsonTableCells<NC, true, Acc>
						: Acc
		>
	: Acc;

type BindJoin<F extends FromJoin, E extends Env, Sofar extends MyLevel> =
	BindItem<F["l"], E, Sofar> extends infer L extends MyLevel
		? BindItem<F["r"], E, [...Sofar, ...L]> extends infer R extends MyLevel
			? JoinUsing<F, L, R> extends infer U extends readonly string[] | null
				? Joined<F["kind"], L, R, U> extends infer J extends MyLevel
					? F["on"] extends Expr
						? CheckBool<
								F["on"],
								MkCtx<E["db"], [J, ...E["scope"]], E["ctes"]>
							> extends infer Err extends AnyErr
							? Err
							: J
						: J
					: never
				: JoinUsing<F, L, R>
			: BindItem<F["r"], E, [...Sofar, ...L]>
		: BindItem<F["l"], E, Sofar>;

type JoinUsing<
	F extends { readonly using: unknown; readonly natural: boolean },
	L extends MyLevel,
	R extends MyLevel,
> = F["natural"] extends true
	? NaturalCols<L, R>
	: F["using"] extends readonly string[]
		? CheckUsing<F["using"], L, R>
		: null;

type LevelHas<L extends MyLevel, C extends string> = true extends {
	[I in keyof L]: C extends keyof L[I]["cols"]
		? C extends L[I]["skip"][number]
			? false
			: true
		: false;
}[number]
	? true
	: false;

type CheckUsing<
	U extends readonly string[],
	L extends MyLevel,
	R extends MyLevel,
	I extends number = 0,
> = U[I] extends infer C extends string
	? [LevelHas<L, C>, LevelHas<R, C>] extends [true, true]
		? CheckUsing<U, L, R, Nx<I>>
		: SqlError<`Unknown column '${C}' in 'from clause'`, null>
	: U;

type NaturalCols<L extends MyLevel, R extends MyLevel> =
	LevelNames<R> extends infer RN extends string
		? FilterNames<LevelOrder<L>, RN>
		: never;
type LevelNames<L extends MyLevel> = {
	[I in keyof L]: Exclude<L[I]["order"][number], L[I]["skip"][number]>;
}[number];
type LevelOrder<
	L extends MyLevel,
	I extends number = 0,
	Acc extends readonly string[] = [],
> = L[I] extends MyItem
	? LevelOrder<
			L,
			Nx<I>,
			[...Acc, ...WithoutSkip<L[I]["order"], L[I]["skip"][number]>]
		>
	: Acc;
type WithoutSkip<O extends readonly string[], S> = O extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? H extends S
		? WithoutSkip<R, S>
		: [H, ...WithoutSkip<R, S>]
	: [];
type FilterNames<O extends readonly string[], Keep> = O extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? H extends Keep
		? [H, ...FilterNames<R, Keep>]
		: FilterNames<R, Keep>
	: [];

type NullItem<It extends MyItem> = {
	readonly alias: It["alias"];
	readonly cols: {
		readonly [K in keyof It["cols"]]: MyColOf<
			It["cols"][K]["type"],
			true,
			It["cols"][K]["n"]
		>;
	};
	readonly skip: It["skip"];
	readonly order: It["order"];
	/** The columns before the outer join made them nullable. */
	readonly orig: It extends { readonly orig: infer O } ? O : It["cols"];
};
export type NullLevel<L extends MyLevel> = {
	readonly [I in keyof L]: NullItem<L[I]>;
};

type SkipIn<L extends MyLevel, U extends string> = {
	readonly [I in keyof L]: {
		readonly [P in keyof L[I]]: P extends "skip"
			? [...L[I]["skip"], ...Extract<U, keyof L[I]["cols"]>[]]
			: L[I][P];
	};
};

type Joined<
	Kind,
	L extends MyLevel,
	R extends MyLevel,
	U extends readonly string[] | null,
> = U extends readonly string[]
	? Kind extends "right"
		? MergedUsing<U, R, R> extends infer M extends MyItem
			? [M, ...SkipIn<R, U[number]>, ...SkipIn<NullLevel<L>, U[number]>]
			: never
		: MergedUsing<U, L, L> extends infer M extends MyItem
			? Kind extends "left"
				? [M, ...SkipIn<L, U[number]>, ...SkipIn<NullLevel<R>, U[number]>]
				: [M, ...SkipIn<L, U[number]>, ...SkipIn<R, U[number]>]
			: never
	: Kind extends "right"
		? [...NullLevel<L>, ...R]
		: Kind extends "left"
			? [...L, ...NullLevel<R>]
			: [...L, ...R];

/** The coalesced columns of `USING` and `NATURAL` joins, which `SELECT *` lists first. */
type MergedUsing<
	U extends readonly string[],
	L extends MyLevel,
	R extends MyLevel,
> = {
	readonly alias: null;
	readonly cols: {
		readonly [C in U[number]]: MyColOf<
			LevelCol<L, C>["type"],
			LevelCol<L, C>["nullable"] extends true
				? true
				: LevelCol<R, C>["nullable"],
			LevelCol<L, C>["n"]
		>;
	};
	readonly skip: [];
	readonly order: U;
};
type LevelCol<L extends MyLevel, C extends string> = {
	[I in keyof L]: C extends keyof L[I]["cols"] ? L[I]["cols"][C] : never;
}[number];

export type ResolveColumn<
	S extends Scope,
	Ref extends {
		readonly schema: string | null;
		readonly tbl: string | null;
		readonly name: string;
	},
	Disp extends string,
	Aliases extends MyColMap = {},
> = Ref["tbl"] extends string
	? ResolveQualified<S, Ref["tbl"], Ref["name"], Disp>
	: ResolveBare<S, Ref["name"], Disp, Aliases>;

type UnknownColumn<Disp extends string> = SqlError<
	`Unknown column '${Disp}'`,
	null
>;

type ResolveBare<
	S extends Scope,
	Name extends string,
	Disp extends string,
	Aliases extends MyColMap,
> = S extends readonly [infer L extends MyLevel, ...infer Rest extends Scope]
	? BareIn<L, Name> extends infer M
		? [M] extends [never]
			? ResolveBare<Rest, Name, Disp, Aliases>
			: IsUnion<M> extends true
				? SqlError<`Column '${Disp}' is ambiguous`, null>
				: M
		: never
	: Name extends keyof Aliases
		? Aliases[Name]
		: UnknownColumn<Disp>;

type BareIn<L extends MyLevel, Name extends string> = {
	[I in keyof L]: Name extends keyof L[I]["cols"]
		? Name extends L[I]["skip"][number]
			? never
			: Tag<L[I]["cols"][Name], I>
		: never;
}[number];
type Tag<C, I> = C & { readonly at: I };

type ResolveQualified<
	S extends Scope,
	Tbl extends string,
	Name extends string,
	Disp extends string,
> = S extends readonly [infer L extends MyLevel, ...infer Rest extends Scope]
	? {
			[I in keyof L]: L[I]["alias"] extends string
				? Lowercase<L[I]["alias"]> extends Tbl
					? L[I]
					: never
				: never;
		}[number] extends infer It
		? [It] extends [never]
			? ResolveQualified<Rest, Tbl, Name, Disp>
			: It extends MyItem
				? Name extends keyof It["cols"]
					? It["cols"][Name]
					: UnknownColumn<Disp>
				: never
		: never
	: UnknownColumn<Disp>;

type IsUnion<T, U = T> = T extends unknown
	? [U] extends [T]
		? false
		: true
	: never;

export type StarCells<
	L extends MyLevel,
	Tbl extends string | null,
> = Tbl extends string
	? {
			[I in keyof L]: L[I]["alias"] extends string
				? Lowercase<L[I]["alias"]> extends Tbl
					? L[I]
					: never
				: never;
		}[number] extends infer It
		? [It] extends [never]
			? SqlError<`Unknown table '${Tbl}'`, null>
			: It extends MyItem
				? ItemCells<It, It["order"], never>
				: never
		: never
	: L extends readonly []
		? SqlError<"No tables used", null>
		: AllCells<L, 0, []>;

type AllCells<
	L extends MyLevel,
	I extends number,
	Acc extends readonly Cell[],
> = L[I] extends MyItem
	? AllCells<
			L,
			Nx<I>,
			[...Acc, ...ItemCells<L[I], L[I]["order"], L[I]["skip"][number]>]
		>
	: Acc;
type ItemCells<
	It extends MyItem,
	O extends readonly string[],
	Skip,
	Acc extends readonly Cell[] = [],
> = O extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? H extends Skip
		? ItemCells<It, R, Skip, Acc>
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
