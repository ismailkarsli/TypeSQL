import type {
	ColumnOrder,
	KnownOrder,
	VisibleKeys,
} from "../../../engine/family/ddl.js";
import type { NameAt, NamedAt } from "../../../engine/family/diagnostics.js";
import type {
	AllCells,
	BareIn,
	CellsMap,
	FindKey,
	ItemCells,
	LevelCol,
	LevelHas,
	NaturalCols,
	NullLevel,
	RefDisplay,
	RenameCells,
	SkipIn,
} from "../../../engine/family/scope.js";
import type { QueryContext } from "../../../engine/family/types.js";
import type { Next } from "../../../engine/next.js";
import type { IsUnion } from "../../../engine/object.js";
import type { Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Table, View } from "../../../schema.js";
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

export type NoTable<Ref extends TableRef> = SqlError<
	`Table '${RefDisplay<Ref>}' doesn't exist`,
	NamedAt<RefDisplay<Ref>, "table">
>;

type TableCols<Tbl> = {
	readonly [K in keyof Tbl & string as Lowercase<K>]: MyColOf<
		Tbl[K] extends { readonly type: infer T } ? NormalizeType<T> : "unknown",
		Tbl[K] extends { readonly nullable: infer N } ? N : true,
		K
	> &
		(Tbl[K] extends { readonly generated: true } ? { readonly gen: true } : {});
};

/** The columns `INSERT INTO t VALUES (…)` without a column list fills, in order: all but invisible ones. */
export type InsertOrder<Tbl> = KnownOrder<Tbl, VisibleKeys<Tbl>>;

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
	readonly order: ColumnOrder<Tbl, VisibleKeys<Tbl>>;
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

/** Derived tables, CTEs and views need unique column names. */
export type DupCell<
	C extends readonly Cell[],
	Seen extends string = never,
> = C extends readonly [
	infer H extends Cell,
	...infer R extends readonly Cell[],
]
	? Lowercase<H["n"]> extends Seen
		? SqlError<`Duplicate column name '${H["n"]}'`, NameAt<Lowercase<H["n"]>>>
		: DupCell<R, Seen | Lowercase<H["n"]>>
	: null;

export type CteEntry<C extends readonly Cell[]> = {
	readonly cols: CellsMap<C>;
	readonly order: { [I in keyof C]: Lowercase<C[I]["n"]> };
};

export type BindFrom<
	F extends FromItem | null,
	E extends Env,
> = F extends FromItem
	? BindItem<F, E, []> extends infer L extends MyLevel
		? DupAlias<L, 0, never> extends infer D extends string
			? SqlError<`Not unique table/alias: '${D}'`, NamedAt<D>>
			: L
		: BindItem<F, E, []>
	: [];

type DupAlias<L extends MyLevel, I extends number, Seen> = L[I] extends MyItem
	? L[I]["alias"] extends string
		? Lowercase<L[I]["alias"]> extends Seen
			? L[I]["alias"]
			: DupAlias<L, Next<I>, Seen | Lowercase<L[I]["alias"]>>
		: DupAlias<L, Next<I>, Seen>
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

type CheckUsing<
	U extends readonly string[],
	L extends MyLevel,
	R extends MyLevel,
	I extends number = 0,
> = U[I] extends infer C extends string
	? [LevelHas<L, C>, LevelHas<R, C>] extends [true, true]
		? CheckUsing<U, L, R, Next<I>>
		: SqlError<`Unknown column '${C}' in 'from clause'`, NamedAt<C, "column">>
	: U;

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
	NamedAt<Disp, "column">
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
				? SqlError<`Column '${Disp}' is ambiguous`, NamedAt<Disp>>
				: M
		: never
	: Name extends keyof Aliases
		? Aliases[Name]
		: UnknownColumn<Disp>;

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
			? SqlError<`Unknown table '${Tbl}'`, NamedAt<Tbl>>
			: It extends MyItem
				? ItemCells<It, It["order"], never>
				: never
		: never
	: L extends readonly []
		? SqlError<"No tables used", null>
		: AllCells<L, 0, []>;
