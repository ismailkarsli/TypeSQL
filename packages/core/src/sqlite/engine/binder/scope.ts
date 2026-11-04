import type { Nx } from "../../../engine/parse.js";
import type { QueryContext, Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Table, View } from "../../../schema.js";
import type { UnionList } from "../../../sql/splice.js";
import type { Expr, FromItem, FromJoin, TableRef } from "../ast.js";
import type { ProjectSelect } from "../project/select.js";
import type { CheckBool, TypeList } from "../typer/typeof.js";
import type {
	Cell,
	MkCtx,
	SqColMap,
	SqColOf,
	SqCteMap,
	SqItem,
	SqLevel,
} from "../types.js";

export type FindKey<O, Lc extends string> = Lc extends keyof O
	? Lc
	: {
			[K in keyof O & string]: K extends `$${string}`
				? never
				: Lowercase<K> extends Lc
					? K
					: never;
		}[keyof O & string];

type MainSchema = "main" | "temp";

export type LookupRelation<
	DB,
	Ref extends TableRef,
> = Ref["schema"] extends null | MainSchema
	? FindKey<DB, Ref["name"]> extends infer K extends keyof DB & string
		? [K] extends [never]
			? null
			: [DB[K], K]
		: null
	: FindKey<DB, Ref["schema"] & string> extends infer S extends keyof DB &
				string
		? [S] extends [never]
			? null
			: FindKey<DB[S], Ref["name"]> extends infer K extends keyof DB[S] & string
				? [K] extends [never]
					? null
					: [DB[S][K], K]
				: null
		: null;

export type RefDisplay<Ref extends TableRef> = Ref["schema"] extends string
	? `${Ref["schema"]}.${Ref["name"]}`
	: Ref["name"];

type TableCols<Tbl> = {
	readonly [K in keyof Tbl & string as Lowercase<K>]: SqColOf<
		Tbl[K] extends { readonly type: infer T } ? T : "any",
		Tbl[K] extends { readonly nullable: infer N } ? N : true,
		K
	>;
};

type TableOrder<Tbl> =
	VisibleKeys<Tbl> extends infer V extends string
		? [V] extends [never]
			? []
			: Tbl[V & keyof Tbl] extends { readonly i: number }
				? ByIndex<PositionMap<Tbl>, 0, []>
				: LowerAll<UnionList<V>>
		: never;
type VisibleKeys<Tbl> = {
	[K in keyof Tbl & string]: Tbl[K] extends { readonly hidden: true }
		? never
		: K;
}[keyof Tbl & string];

export type InsertOrder<Tbl> =
	TableOrder<Tbl> extends infer O extends readonly string[]
		? WithoutGenerated<O, GeneratedKeys<Tbl>>
		: [];
type GeneratedKeys<Tbl> = {
	[K in keyof Tbl & string]: Tbl[K] extends { readonly generated: true }
		? Lowercase<K>
		: never;
}[keyof Tbl & string];
type WithoutGenerated<O, G> = O extends readonly [
	infer H extends string,
	...infer R,
]
	? H extends G
		? WithoutGenerated<R, G>
		: [H, ...WithoutGenerated<R, G>]
	: [];
// Each column's name by its position, built once: walking it is one lookup
// per column, where scanning every column for each position is quadratic.
// A dropped column leaves a gap; the walk goes on while a position is left.
type PositionMap<Tbl> = {
	[K in keyof Tbl & string as Tbl[K] extends {
		readonly i: infer I extends number;
	}
		? I
		: never]: Lowercase<K>;
};
type ByIndex<
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

type RowidName<Tbl> = {
	[K in keyof Tbl & string]: Tbl[K] extends { readonly rowid: true }
		? K
		: never;
}[keyof Tbl & string] extends infer K extends string
	? [K] extends [never]
		? "rowid"
		: K
	: "rowid";

export type RelationItem<Rel, Alias extends string> =
	Rel extends View<infer Cols extends Table>
		? TableItem<Cols, Alias, null>
		: Rel extends Table
			? TableItem<Rel, Alias, RowidName<Rel>>
			: null;
type TableItem<Tbl, Alias extends string, Rowid> = {
	readonly alias: Alias;
	readonly cols: TableCols<Tbl>;
	readonly skip: [];
	readonly order: TableOrder<Tbl>;
	readonly rowid: Rowid;
};

type BindTable<
	DB,
	Ref extends TableRef,
	Alias extends string | null,
	Ctes extends SqCteMap,
> = Ref["schema"] extends null
	? Ref["name"] extends keyof Ctes
		? [EntryItem<Ctes[Ref["name"]], Alias extends string ? Alias : Ref["name"]>]
		: BindDbTable<DB, Ref, Alias>
	: BindDbTable<DB, Ref, Alias>;

type BindDbTable<DB, Ref extends TableRef, Alias extends string | null> =
	LookupRelation<DB, Ref> extends [infer Rel, string]
		? RelationItem<
				Rel,
				Alias extends string ? Alias : Ref["name"]
			> extends infer It extends SqItem
			? [It]
			: SqlError<`no such table: ${RefDisplay<Ref>}`, null>
		: SqlError<`no such table: ${RefDisplay<Ref>}`, null>;

type EntryItem<
	E extends { readonly cols: unknown; readonly order: unknown },
	Alias extends string | null,
> = {
	readonly alias: Alias;
	readonly cols: E["cols"];
	readonly skip: [];
	readonly order: E["order"];
	readonly rowid: null;
};

export type CellsMap<C extends readonly Cell[]> = {
	readonly [E in C[number] as Lowercase<E["n"]>]: SqColOf<
		E["t"]["type"],
		E["t"]["nullable"],
		E["n"]
	>;
};

export type UniqueCells<
	C extends readonly Cell[],
	Seen extends string = never,
	Acc extends readonly Cell[] = [],
> = C extends readonly [
	infer H extends Cell,
	...infer R extends readonly Cell[],
]
	? DerivedName<H> extends infer D extends string
		? Lowercase<D> extends Seen
			? Renamed<D, Seen, 1> extends infer N extends string
				? UniqueCells<
						R,
						Seen | Lowercase<N>,
						[...Acc, { readonly n: N; readonly t: H["t"] }]
					>
				: never
			: UniqueCells<
					R,
					Seen | Lowercase<D>,
					[...Acc, { readonly n: D; readonly t: H["t"] }]
				>
		: never
	: Acc;
type DerivedName<C extends Cell> = C extends {
	readonly d: infer D extends string;
}
	? D
	: C["n"];
type Renamed<N extends string, Seen extends string, K extends number> =
	Lowercase<`${N}:${K}`> extends Seen ? Renamed<N, Seen, Nx<K>> : `${N}:${K}`;

export type CteEntry<C extends readonly Cell[]> =
	UniqueCells<C> extends infer U extends readonly Cell[]
		? {
				readonly cols: CellsMap<U>;
				readonly order: { [I in keyof U]: Lowercase<U[I]["n"]> };
			}
		: never;

type JsonEachSpec = {
	key: ["any", true];
	value: ["any", true];
	type: ["text", false];
	atom: ["any", true];
	id: ["integer", false];
	parent: ["integer", true];
	fullkey: ["text", false];
	path: ["text", false];
	json: ["any", true];
	root: ["text", true];
};
type JsonEachCols = {
	readonly [K in keyof JsonEachSpec]: SqColOf<
		JsonEachSpec[K][0],
		JsonEachSpec[K][1],
		K
	>;
};

type BindFunc<
	Name extends string,
	Args extends readonly Expr[],
	Alias extends string | null,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	Sofar extends SqLevel,
> = Name extends "json_each" | "json_tree"
	? Args["length"] extends 1 | 2
		? TypeList<
				Args,
				MkCtx<Env["db"], [Sofar, ...Env["scope"]], Env["ctes"]>
			> extends infer E extends AnyErr
			? E
			: [
					{
						readonly alias: Alias extends string ? Alias : Name;
						readonly cols: JsonEachCols;
						readonly skip: ["json", "root"];
						readonly order: [
							"key",
							"value",
							"type",
							"atom",
							"id",
							"parent",
							"fullkey",
							"path",
						];
						readonly rowid: null;
					},
				]
		: SqlError<`too many arguments on ${Name}() - max 2`, null>
	: SqlError<`no such table: ${Name}`, null>;

export type BindFrom<
	F extends FromItem | null,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> = F extends FromItem ? BindItem<F, Env, []> : [];

type BindItem<
	F extends FromItem,
	Env extends QueryContext<unknown, Scope, SqCteMap>,
	Sofar extends SqLevel,
> = F extends { readonly t: "table" }
	? BindTable<Env["db"], F["ref"], F["alias"], Env["ctes"]>
	: F extends { readonly t: "sub" }
		? ProjectSelect<F["q"], Env> extends infer C extends readonly Cell[]
			? [EntryItem<CteEntry<C>, F["alias"]>]
			: ProjectSelect<F["q"], Env>
		: F extends { readonly t: "func" }
			? BindFunc<F["name"], F["args"], F["alias"], Env, Sofar>
			: F extends { readonly t: "join" }
				? BindJoin<Extract<F, FromJoin>, Env>
				: never;

type BindJoin<
	F extends FromItem & { readonly t: "join" },
	Env extends QueryContext<unknown, Scope, SqCteMap>,
> =
	BindItem<F["l"], Env, []> extends infer L extends SqLevel
		? BindItem<F["r"], Env, L> extends infer R extends SqLevel
			? JoinUsing<F, L, R> extends infer U extends readonly string[] | null
				? Joined<F["kind"], L, R, U> extends infer J extends SqLevel
					? F["on"] extends Expr
						? CheckBool<
								F["on"],
								MkCtx<Env["db"], [J, ...Env["scope"]], Env["ctes"]>
							> extends infer E extends AnyErr
							? E
							: J
						: J
					: never
				: JoinUsing<F, L, R>
			: BindItem<F["r"], Env, L>
		: BindItem<F["l"], Env, []>;

type JoinUsing<
	F extends { readonly using: unknown; readonly natural: boolean },
	L extends SqLevel,
	R extends SqLevel,
> = F["natural"] extends true
	? F["using"] extends readonly string[]
		? SqlError<"a NATURAL join may not have an ON or USING clause", null>
		: NaturalCols<L, R>
	: F["using"] extends readonly string[]
		? CheckUsing<F["using"], L, R>
		: null;

type LevelHas<L extends SqLevel, C extends string> = true extends {
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
	L extends SqLevel,
	R extends SqLevel,
	I extends number = 0,
> = U[I] extends infer C extends string
	? [LevelHas<L, C>, LevelHas<R, C>] extends [true, true]
		? CheckUsing<U, L, R, Nx<I>>
		: SqlError<
				`cannot join using column ${C} - column not present in both tables`,
				null
			>
	: U;

type NaturalCols<L extends SqLevel, R extends SqLevel> =
	LevelNames<R> extends infer RN extends string
		? FilterNames<LevelOrder<L>, RN>
		: never;
type LevelNames<L extends SqLevel> = {
	[I in keyof L]: Exclude<L[I]["order"][number], L[I]["skip"][number]>;
}[number];
type LevelOrder<
	L extends SqLevel,
	I extends number = 0,
	Acc extends readonly string[] = [],
> = L[I] extends SqItem
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

type NullItem<It extends SqItem> = {
	readonly alias: It["alias"];
	readonly cols: {
		readonly [K in keyof It["cols"]]: SqColOf<
			It["cols"][K]["type"],
			true,
			It["cols"][K]["n"]
		>;
	};
	readonly skip: It["skip"];
	readonly order: It["order"];
	readonly rowid: It["rowid"];
	readonly nullRowid: true;
};
export type NullLevel<L extends SqLevel> = {
	readonly [I in keyof L]: NullItem<L[I]>;
};

type SkipIn<L extends SqLevel, U extends string> = {
	readonly [I in keyof L]: {
		readonly [P in keyof L[I]]: P extends "skip"
			? [...L[I]["skip"], ...Extract<U, keyof L[I]["cols"]>[]]
			: L[I][P];
	};
};

type SubstIn<L extends SqLevel, M> = {
	readonly [I in keyof L]: L[I] & { readonly subst: M };
};

type Joined<
	Kind,
	L extends SqLevel,
	R extends SqLevel,
	U extends readonly string[] | null,
> = U extends readonly string[]
	? Kind extends "full"
		? MergedUsing<U, L, R> extends infer M extends SqItem
			? [
					M,
					...SubstIn<SkipIn<NullLevel<L>, U[number]>, M["cols"]>,
					...SkipIn<NullLevel<R>, U[number]>,
				]
			: never
		: Kind extends "right"
			? MergedUsing<U, R, R> extends infer M extends SqItem
				? [
						M,
						...SubstIn<SkipIn<NullLevel<L>, U[number]>, M["cols"]>,
						...SkipIn<R, U[number]>,
					]
				: never
			: Kind extends "left"
				? [...L, ...SkipIn<NullLevel<R>, U[number]>]
				: [...L, ...SkipIn<R, U[number]>]
	: Kind extends "full"
		? [...NullLevel<L>, ...NullLevel<R>]
		: Kind extends "right"
			? [...NullLevel<L>, ...R]
			: Kind extends "left"
				? [...L, ...NullLevel<R>]
				: [...L, ...R];

type MergedUsing<
	U extends readonly string[],
	L extends SqLevel,
	R extends SqLevel,
> = {
	readonly alias: null;
	readonly cols: {
		readonly [C in U[number]]: {
			readonly type: LevelCol<L, C>["type"];
			readonly nullable: LevelCol<L, C>["nullable"] extends true
				? true
				: LevelCol<R, C>["nullable"];
			readonly n: LevelCol<L, C>["n"];
		};
	};
	readonly skip: [];
	readonly order: [];
	readonly rowid: null;
};
type LevelCol<L extends SqLevel, C extends string> = {
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
	Aliases extends SqColMap = {},
> = Ref["tbl"] extends string
	? ResolveQualified<S, Ref["schema"], Ref["tbl"], Ref["name"], Disp>
	: ResolveBare<S, Ref["name"], Disp, Aliases>;

type ResolveBare<
	S extends Scope,
	Name extends string,
	Disp extends string,
	Aliases extends SqColMap,
> = S extends readonly [infer L extends SqLevel, ...infer Rest extends Scope]
	? BareIn<L, Name> extends infer M
		? [M] extends [never]
			? Name extends RowidAlias
				? RowidIn<L, Disp, Rest, Aliases, Name>
				: ResolveBare<Rest, Name, Disp, Aliases>
			: IsUnion<M> extends true
				? SqlError<`ambiguous column name: ${Disp}`, null>
				: M
		: never
	: Name extends keyof Aliases
		? Aliases[Name]
		: SqlError<`no such column: ${Disp}`, null>;

type BareIn<L extends SqLevel, Name extends string> = {
	[I in keyof L]: Name extends keyof L[I]["cols"]
		? Name extends L[I]["skip"][number]
			? never
			: Tag<L[I]["cols"][Name], I>
		: never;
}[number];
type Tag<C, I> = C & { readonly at: I };

type RowidAlias = "rowid" | "oid" | "_rowid_";
type RowidIn<
	L extends SqLevel,
	Disp extends string,
	Rest extends Scope,
	Aliases extends SqColMap,
	Name extends string,
> = {
	[I in keyof L]: L[I]["rowid"] extends string
		? RowidCol<L[I]> & { readonly at: I }
		: never;
}[number] extends infer M
	? [M] extends [never]
		? ResolveBare<Rest, Name, Disp, Aliases>
		: IsUnion<M> extends true
			? SqlError<`ambiguous column name: ${Disp}`, null>
			: M
	: never;
type RowidCol<It extends SqItem> = {
	readonly type: "integer";
	readonly nullable: It extends { readonly nullRowid: true } ? true : false;
	readonly n: It["rowid"] & string;
};

type ResolveQualified<
	S extends Scope,
	Schema extends string | null,
	Tbl extends string,
	Name extends string,
	Disp extends string,
> = S extends readonly [infer L extends SqLevel, ...infer Rest extends Scope]
	? {
			[I in keyof L]: L[I]["alias"] extends Tbl ? L[I] : never;
		}[number] extends infer It
		? [It] extends [never]
			? ResolveQualified<Rest, Schema, Tbl, Name, Disp>
			: IsUnion<It> extends true
				? SqlError<`ambiguous column name: ${Disp}`, null>
				: It extends SqItem
					? Name extends keyof It["cols"]
						? It["cols"][Name]
						: Name extends RowidAlias
							? It["rowid"] extends string
								? RowidCol<It>
								: SqlError<`no such column: ${Disp}`, null>
							: SqlError<`no such column: ${Disp}`, null>
					: never
		: never
	: SqlError<`no such column: ${Disp}`, null>;

type IsUnion<T, U = T> = T extends unknown
	? [U] extends [T]
		? false
		: true
	: never;

export type StarCells<
	L extends SqLevel,
	Tbl extends string | null,
> = Tbl extends string
	? {
			[I in keyof L]: L[I]["alias"] extends Tbl ? L[I] : never;
		}[number] extends infer It
		? [It] extends [never]
			? SqlError<`no such table: ${Tbl}`, null>
			: IsUnion<It> extends true
				? AmbiguousStar<Tbl, It>
				: It extends SqItem
					? ItemCells<It, It["order"], never>
					: never
		: never
	: L extends readonly []
		? SqlError<"no tables specified", null>
		: DupAlias<L, 0, never> extends infer D extends string
			? AmbiguousStar<
					D,
					{ [I in keyof L]: L[I]["alias"] extends D ? L[I] : never }[number]
				>
			: AllCells<L, 0, []>;

type DupAlias<L extends SqLevel, I extends number, Seen> = L[I] extends SqItem
	? L[I]["alias"] extends string
		? L[I]["alias"] extends Seen
			? L[I]["alias"]
			: DupAlias<L, Nx<I>, Seen | L[I]["alias"]>
		: DupAlias<L, Nx<I>, Seen>
	: null;
type AmbiguousStar<Tbl extends string, It> = SqlError<
	`ambiguous column name: main.${Tbl}.${It extends SqItem
		? It["order"][0] extends infer C extends keyof It["cols"]
			? It["cols"][C]["n"]
			: ""
		: ""}`,
	null
>;

type AllCells<
	L extends SqLevel,
	I extends number,
	Acc extends readonly Cell[],
> = L[I] extends SqItem
	? AllCells<
			L,
			Nx<I>,
			[...Acc, ...ItemCells<L[I], L[I]["order"], L[I]["skip"][number]>]
		>
	: Acc;
type ItemCells<
	It extends SqItem,
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
