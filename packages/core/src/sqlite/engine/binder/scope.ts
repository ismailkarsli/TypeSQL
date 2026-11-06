import type {
	ColumnOrder,
	KnownOrder,
	VisibleKeys,
} from "../../../engine/family/ddl.js";
import type { HintKind, NamedAt } from "../../../engine/family/diagnostics.js";
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
	SkipIn,
} from "../../../engine/family/scope.js";
import type { QueryContext } from "../../../engine/family/types.js";
import type { Next } from "../../../engine/next.js";
import type { IsUnion } from "../../../engine/object.js";
import type { Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Table, View } from "../../../schema.js";
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

type TableCols<Tbl> = {
	readonly [K in keyof Tbl & string as Lowercase<K>]: SqColOf<
		Tbl[K] extends { readonly type: infer T } ? T : "any",
		Tbl[K] extends { readonly nullable: infer N } ? N : true,
		K
	>;
};

/** The columns `INSERT INTO t VALUES (…)` without a column list fills, in order: all but hidden and generated ones. */
export type InsertOrder<Tbl> = KnownOrder<Tbl, InsertKeys<Tbl>>;
export type InsertKeys<Tbl> = {
	[K in keyof Tbl & string]: Tbl[K] extends
		| { readonly hidden: true }
		| { readonly generated: true }
		? never
		: K;
}[keyof Tbl & string];

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
	readonly order: ColumnOrder<Tbl, VisibleKeys<Tbl>>;
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
			: SqlError<
					`no such table: ${RefDisplay<Ref>}`,
					NamedAt<RefDisplay<Ref>, "table">
				>
		: SqlError<
				`no such table: ${RefDisplay<Ref>}`,
				NamedAt<RefDisplay<Ref>, "table">
			>;

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
	Lowercase<`${N}:${K}`> extends Seen ? Renamed<N, Seen, Next<K>> : `${N}:${K}`;

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
	: SqlError<`no such table: ${Name}`, NamedAt<Name, "table">>;

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

type CheckUsing<
	U extends readonly string[],
	L extends SqLevel,
	R extends SqLevel,
	I extends number = 0,
> = U[I] extends infer C extends string
	? [LevelHas<L, C>, LevelHas<R, C>] extends [true, true]
		? CheckUsing<U, L, R, Next<I>>
		: SqlError<
				`cannot join using column ${C} - column not present in both tables`,
				null
			>
	: U;

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
	? ResolveQualified<S, Ref["schema"], Ref["tbl"], Ref["name"], Disp, Disp>
	: Ref extends { readonly quoted: true }
		? ResolveBare<
				S,
				Ref["name"],
				`"${Disp}" - should this be a string literal in single-quotes?`,
				Aliases,
				Disp,
				null
			>
		: ResolveBare<S, Ref["name"], Disp, Aliases, Disp>;

type ResolveBare<
	S extends Scope,
	Name extends string,
	Disp extends string,
	Aliases extends SqColMap,
	/** The name as written, which errors point at. */
	Raw extends string,
	H extends HintKind = "column",
> = S extends readonly [infer L extends SqLevel, ...infer Rest extends Scope]
	? BareIn<L, Name> extends infer M
		? [M] extends [never]
			? Name extends RowidAlias
				? RowidIn<L, Disp, Rest, Aliases, Name, Raw, H>
				: ResolveBare<Rest, Name, Disp, Aliases, Raw, H>
			: IsUnion<M> extends true
				? SqlError<`ambiguous column name: ${Disp}`, NamedAt<Raw>>
				: M
		: never
	: Name extends keyof Aliases
		? Aliases[Name]
		: SqlError<`no such column: ${Disp}`, NamedAt<Raw, H>>;

type RowidAlias = "rowid" | "oid" | "_rowid_";
type RowidIn<
	L extends SqLevel,
	Disp extends string,
	Rest extends Scope,
	Aliases extends SqColMap,
	Name extends string,
	/** The name as written, which errors point at. */
	Raw extends string,
	H extends HintKind,
> = {
	[I in keyof L]: L[I]["rowid"] extends string
		? RowidCol<L[I]> & { readonly at: I }
		: never;
}[number] extends infer M
	? [M] extends [never]
		? ResolveBare<Rest, Name, Disp, Aliases, Raw, H>
		: IsUnion<M> extends true
			? SqlError<`ambiguous column name: ${Disp}`, NamedAt<Raw>>
			: M
	: never;
type RowidCol<It extends SqItem> = {
	readonly type: "integer";
	readonly nullable: It extends { readonly orig: unknown } ? true : false;
	readonly n: It["rowid"] & string;
};

type ResolveQualified<
	S extends Scope,
	Schema extends string | null,
	Tbl extends string,
	Name extends string,
	Disp extends string,
	/** The name as written, which errors point at. */
	Raw extends string,
> = S extends readonly [infer L extends SqLevel, ...infer Rest extends Scope]
	? {
			[I in keyof L]: L[I]["alias"] extends Tbl ? L[I] : never;
		}[number] extends infer It
		? [It] extends [never]
			? ResolveQualified<Rest, Schema, Tbl, Name, Disp, Raw>
			: IsUnion<It> extends true
				? SqlError<`ambiguous column name: ${Disp}`, NamedAt<Raw>>
				: It extends SqItem
					? Name extends keyof It["cols"]
						? It["cols"][Name]
						: Name extends RowidAlias
							? It["rowid"] extends string
								? RowidCol<It>
								: SqlError<`no such column: ${Disp}`, NamedAt<Raw, "column">>
							: SqlError<`no such column: ${Disp}`, NamedAt<Raw, "column">>
					: never
		: never
	: SqlError<`no such column: ${Disp}`, NamedAt<Raw, "column">>;

export type StarCells<
	L extends SqLevel,
	Tbl extends string | null,
> = Tbl extends string
	? {
			[I in keyof L]: L[I]["alias"] extends Tbl ? L[I] : never;
		}[number] extends infer It
		? [It] extends [never]
			? SqlError<`no such table: ${Tbl}`, NamedAt<Tbl, "table">>
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
			: DupAlias<L, Next<I>, Seen | L[I]["alias"]>
		: DupAlias<L, Next<I>, Seen>
	: null;
type AmbiguousStar<Tbl extends string, It> = (
	It extends SqItem
		? It["order"][0] extends infer C extends keyof It["cols"]
			? It["cols"][C]["n"]
			: ""
		: ""
) extends infer C extends string
	? SqlError<`ambiguous column name: main.${Tbl}.${C}`, NamedAt<C>>
	: never;
