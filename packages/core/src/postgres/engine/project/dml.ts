import type { AddParam } from "../../../engine/params.js";
import type {
	ColInfo,
	ColMap,
	Cols,
	CteMap,
	Ctx,
	Info,
	MkCtx,
	NullableMap,
	Scope,
	ScopeItem,
	ScopeLevel,
} from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { ColDesc, Table } from "../../../schema.js";
import type {
	Cte,
	DeleteStmt,
	DmlStmt,
	Expr,
	InsertSource,
	InsertStmt,
	MergeStmt,
	OnConflict,
	ReturningOpt,
	SelectStmt,
	SetItem,
	TableRef,
	Target,
	TargetInd,
	UpdateStmt,
	WithClause,
} from "../ast.js";
import type { HasStar } from "../binder/clauses.js";
import type { BindFrom } from "../binder/from.js";
import type { ResolveWritableTable, TableCols } from "../binder/resolve.js";
import type { Nx } from "../parser/util.js";
import type {
	ParamsOfExpr,
	ParamsOfFromItems,
	ParamsOfOpt,
	ParamsOfSelect,
	ParamsOfTargets,
} from "../typer/params.js";
import type { TypeOf } from "../typer/typeof.js";
import type { ParamsOfMerge, ProjectMerge } from "./merge.js";
import type { BindWith, ProjectSelect, ProjectTargets } from "./select.js";

export type ProjectDml<
	S extends DmlStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	BindWith<S["with"], DB, Outer, Ctes> extends infer C2
		? C2 extends CteMap
			? S extends TagInsert
				? ProjectInsert<Extract<S, InsertStmt>, DB, Outer, C2>
				: S extends TagUpdate
					? ProjectUpdate<Extract<S, UpdateStmt>, DB, Outer, C2>
					: S extends TagDelete
						? ProjectDelete<Extract<S, DeleteStmt>, DB, Outer, C2>
						: ProjectMerge<Extract<S, MergeStmt>, DB, Outer, C2>
			: C2
		: never;

export type Target_<Tbl extends Table, Item extends ScopeItem> = {
	readonly tbl: Tbl;
	readonly item: Item;
};

export type ResolveTarget<
	DB,
	Ref extends TableRef,
	Alias extends string | null,
	Verb extends string,
> =
	ResolveWritableTable<DB, Ref> extends infer R
		? R extends Table
			? Target_<
					R,
					{
						readonly alias: Alias extends string ? Alias : Ref["name"];
						readonly cols: TableCols<R>;
						readonly skip: [];
					}
				>
			: R extends SqlError<`cannot modify view "${infer V}"`, null>
				? SqlError<`cannot ${Verb} view "${V}"`, null>
				: R
		: never;

export type DmlCtx<
	DB,
	Level extends ScopeLevel,
	Outer extends Scope,
	Ctes extends CteMap,
> = MkCtx<DB, [Level, ...Outer], Ctes, false>;

// Preserve column identity instead of rebuilding type/nullability for each use.
export type ColInfoOf<Tbl extends Table, Col extends string> = Tbl[Col &
	keyof Tbl];

type IndCtx<Tbl extends Table, Col extends string, C extends Ctx> = MkCtx<
	C["db"],
	[
		[
			{
				readonly alias: null;
				readonly cols: {
					readonly [K in Col & keyof Tbl]: {
						readonly type: Tbl[K]["type"];
						readonly nullable: Tbl[K]["nullable"];
					};
				};
				readonly skip: [];
			},
		],
		...C["scope"],
	],
	C["ctes"],
	false
>;

export type AssignInfo<
	Tbl extends Table,
	Col extends string,
	Ind,
	C extends Ctx,
> = Ind extends Expr
	? TypeOf<Ind, IndCtx<Tbl, Col, C>> extends infer X
		? X extends ColInfo
			? Info<X["type"], true>
			: X
		: never
	: ColInfoOf<Tbl, Col>;

export type NoSubscript =
	| "bool"
	| "int2"
	| "int4"
	| "int8"
	| "float4"
	| "float8"
	| "numeric"
	| "money"
	| "text"
	| "varchar"
	| "bpchar"
	| "char"
	| "bytea"
	| "date"
	| "time"
	| "timetz"
	| "timestamp"
	| "timestamptz"
	| "interval"
	| "uuid"
	| "json"
	| "xml"
	| "inet"
	| "cidr"
	| "macaddr"
	| "macaddr8"
	| "bit"
	| "varbit"
	| "oid"
	| "regclass"
	| "regtype"
	| "regproc"
	| "path"
	| "polygon"
	| "circle"
	| "tsvector"
	| "tsquery"
	| "int4range"
	| "int8range"
	| "numrange"
	| "tsrange"
	| "tstzrange"
	| "daterange";
type AssignParamInfo<
	Tbl extends Table,
	Col extends string,
	Ind,
	C extends Ctx,
> = Extract<AssignInfo<Tbl, Col, Ind, C>, ColInfo>;

export type AssignTargets<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
> = {
	readonly [K in keyof Cs]: Ind extends readonly TargetInd[]
		? Ind[K & keyof Ind]
		: null;
};

export type TargetInfos<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	C extends Ctx,
> = {
	readonly [K in keyof Cs]: Ind extends null
		? ColInfoOf<Tbl, Cs[K]>
		: AssignParamInfo<Tbl, Cs[K], AssignTargets<Cs, Ind>[K], C>;
};

export type ParamsOfInds<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	C extends Ctx,
	M,
> = Ind extends readonly TargetInd[]
	? ParamsOfIndsLoop<Cs, Ind, Tbl, C, M, 0>
	: M;
type ParamsOfIndsLoop<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[],
	Tbl extends Table,
	C extends Ctx,
	M,
	I extends number,
> = Cs[I] extends string
	? ParamsOfIndsLoop<
			Cs,
			Ind,
			Tbl,
			C,
			Ind[I] extends Expr ? ParamsOfExpr<Ind[I], IndCtx<Tbl, Cs[I], C>, M> : M,
			Nx<I>
		>
	: M;

type ProjectInsert<
	S extends InsertStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ResolveTarget<DB, S["table"], S["alias"], "insert into"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? InsertTargetCols<
					S["columns"],
					S["colInd"],
					S["source"],
					Tbl,
					S["table"]["name"],
					DB,
					Outer,
					Ctes
				> extends infer Cs
				? Cs extends readonly string[] | null
					? CheckInsertSource<
							S["source"],
							Cs extends readonly string[] ? Cs : [],
							S["colInd"],
							Tbl,
							S["table"]["name"],
							MkCtx<DB, Outer, Ctes, false>
						> extends infer Chk
						? Chk extends AnyErr
							? Chk
							: CheckRequired<Tbl, Cs, S["table"]["name"]> extends infer Rq
								? Rq extends AnyErr
									? Rq
									: CheckOnConflict<
												S["onConflict"],
												Tbl,
												Item,
												S["table"]["name"],
												DB,
												Outer,
												Ctes
											> extends infer Oc
										? Oc extends AnyErr
											? Oc
											: ProjectReturning<
													S["returning"],
													S["retOpts"],
													[Item],
													TableCols<Tbl>,
													true,
													false,
													DB,
													Outer,
													Ctes
												>
										: never
								: never
						: never
					: Cs
				: never
			: Tg
		: never;

type InsertTargetCols<
	Columns extends readonly string[] | null,
	Ind extends readonly TargetInd[] | null,
	Source extends InsertSource,
	Tbl extends Table,
	Name extends string,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	SourceWidth<Source, DB, Outer, Ctes> extends infer W
		? W extends AnyErr
			? W
			: Columns extends readonly string[]
				? CheckAssignedCols<
						Columns,
						AssignTargets<Columns, Ind>,
						Tbl,
						Name,
						"insert"
					> extends infer E
					? E extends AnyErr
						? E
						: W extends readonly unknown[]
							? WidthResult<WidthCheck<W, Columns>, Columns>
							: Columns
					: never
				: W extends readonly []
					? []
					: W extends readonly unknown[]
						? WidthCheck<W, UnionToTuple<keyof Tbl>> extends "more"
							? SqlError<
									"INSERT has more expressions than target columns",
									null
								>
							: null
						: null
		: never;

type WidthResult<R, Ok_> = R extends "eq"
	? Ok_
	: R extends "more"
		? SqlError<"INSERT has more expressions than target columns", null>
		: SqlError<"INSERT has more target columns than expressions", null>;

type SourceWidth<
	Source extends InsertSource,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = Source extends {
	readonly t: "values";
	readonly rows: readonly [
		infer First extends readonly Expr[],
		...infer Rest extends readonly (readonly Expr[])[],
	];
}
	? SameLength<Rest, First> extends true
		? First
		: SqlError<"VALUES lists must all be the same length", null>
	: Source extends {
				readonly t: "select";
				readonly q: infer Q extends SelectStmt;
			}
		? ProjectSelect<Q, DB, Outer, Ctes> extends infer C
			? C extends Cols
				? HasStar<C> extends true
					? null
					: C
				: C
			: never
		: [];

type SameLength<
	Rows extends readonly (readonly unknown[])[],
	Ref extends readonly unknown[],
> = Rows extends readonly [
	infer R extends readonly unknown[],
	...infer Rest extends readonly (readonly unknown[])[],
]
	? WidthCheck<R, Ref> extends "eq"
		? SameLength<Rest, Ref>
		: false
	: true;

// Equal finite widths need no suffix tuples. Keep the recursive comparison
// for unequal widths and arrays whose lengths are not fixed.
export type WidthCheck<
	A extends readonly unknown[],
	B extends readonly unknown[],
> = A extends unknown
	? B extends unknown
		? number extends A["length"] | B["length"]
			? WidthCheckWalk<A, B>
			: A["length"] extends B["length"]
				? B["length"] extends A["length"]
					? "eq"
					: WidthCheckWalk<A, B>
				: WidthCheckWalk<A, B>
		: never
	: never;
type WidthCheckWalk<
	A extends readonly unknown[],
	B extends readonly unknown[],
> = A extends readonly [unknown, ...infer AR]
	? B extends readonly [unknown, ...infer BR]
		? WidthCheckWalk<AR, BR>
		: "more"
	: B extends readonly [unknown, ...unknown[]]
		? "fewer"
		: "eq";

export type CheckAssignedCols<
	Cs extends readonly string[],
	Tgs extends readonly TargetInd[],
	Tbl extends Table,
	Name extends string,
	Kind extends "insert" | "update",
	Whole extends string = never,
	Part extends string = never,
	I extends number = 0,
> = Cs[I] extends infer C extends string
	? C extends keyof Tbl
		? Tgs[I] extends Expr
			? C extends Whole
				? AssignedTwice<C, Kind>
				: CheckAssignedCols<Cs, Tgs, Tbl, Name, Kind, Whole, Part | C, Nx<I>>
			: C extends Whole | Part
				? AssignedTwice<C, Kind>
				: CheckAssignedCols<Cs, Tgs, Tbl, Name, Kind, Whole | C, Part, Nx<I>>
		: SqlError<`column "${C}" of relation "${Name}" does not exist`, null>
	: true;
type AssignedTwice<C extends string, Kind> = Kind extends "insert"
	? SqlError<`column "${C}" specified more than once`, null>
	: SqlError<`multiple assignments to same column "${C}"`, null>;

type CheckInsertSource<
	Source extends InsertSource,
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> = Source extends {
	readonly t: "values";
	readonly rows: infer Rows extends readonly (readonly Expr[])[];
}
	? Ind extends null
		? Rows[number][number] extends TagParam
			? true
			: CheckRows<Rows, Cs, AssignTargets<Cs, Ind>, Tbl, Name, C>
		: CheckRows<Rows, Cs, AssignTargets<Cs, Ind>, Tbl, Name, C>
	: CheckTargets<Cs, AssignTargets<Cs, Ind>, [], Tbl, Name, C>;

export type CheckRows<
	Rows extends readonly (readonly Expr[])[],
	Cs extends readonly string[],
	Tgs extends readonly TargetInd[],
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> = Rows extends readonly [
	infer R extends readonly Expr[],
	...infer Rest extends readonly (readonly Expr[])[],
]
	? CheckValueItems<R, C> extends infer Ts
		? Ts extends true
			? CheckTargets<Cs, Tgs, R, Tbl, Name, C> extends infer N
				? N extends AnyErr
					? N
					: CheckRows<Rest, Cs, Tgs, Tbl, Name, C>
				: never
			: Ts
		: never
	: true;

export type CheckValueItems<
	Es extends readonly Expr[],
	C extends Ctx,
> = Es[number] extends TagParamDefault ? true : CheckValueItemsWalk<Es, C>;
type CheckValueItemsWalk<
	Es extends readonly Expr[],
	C extends Ctx,
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? E extends TagDefault
		? CheckValueItemsWalk<R, C>
		: TypeOf<E, C> extends infer T
			? T extends ColInfo
				? CheckValueItemsWalk<R, C>
				: T
			: never
	: true;

export type CheckTargets<
	Cs extends readonly string[],
	Tgs extends readonly TargetInd[],
	Es extends readonly (Expr | null)[],
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
	I extends number = 0,
> = Cs[I] extends infer Col extends string
	? Col extends keyof Tbl
		? Tgs[I] extends Expr
			? Es[I] extends TagDefault
				? DefaultIntoInd<Tgs[I]>
				: AssignInfo<Tbl, Col, Tgs[I], C> extends infer X
					? X extends AnyErr
						? X
						: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
					: never
			: Es[I] extends TagNull
				? Tbl[Col]["nullable"] extends false
					? NullViolation<Col, Name>
					: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
				: Es[I] extends TagDefault
					? Tbl[Col] extends {
							readonly nullable: false;
							readonly hasDefault: false;
						}
						? NullViolation<Col, Name>
						: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
					: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
		: SqlError<`column "${Col}" of relation "${Name}" does not exist`, null>
	: true;

type NullViolation<Col extends string, Name extends string> = SqlError<
	`null value in column "${Col}" of relation "${Name}" violates not-null constraint`,
	null
>;

type DefaultIntoInd<Ind> = Ind extends { readonly e: infer In }
	? In extends TagCol
		? Ind extends TagField
			? SqlError<"cannot set a subfield to DEFAULT", null>
			: SqlError<"cannot set an array element to DEFAULT", null>
		: DefaultIntoInd<In>
	: never;

export type CheckRequired<
	Tbl extends Table,
	Cs extends readonly string[] | null,
	Name extends string,
> = Cs extends readonly string[]
	? [MissingRequired<Tbl, Cs[number]>] extends [never]
		? true
		: SqlError<
				`null value in column "${FirstOf<MissingRequired<Tbl, Cs[number]>> & string}" of relation "${Name}" violates not-null constraint`,
				null
			>
	: true;

type MissingRequired<Tbl extends Table, Given extends string> = Exclude<
	RequiredCols<Tbl>,
	Given
>;
type RequiredCols<Tbl extends Table> = {
	[K in keyof Tbl]: Tbl[K] extends {
		readonly nullable: false;
		readonly hasDefault: false;
	}
		? K
		: never;
}[keyof Tbl];

type ExcludedItem<Tbl extends Table> = {
	readonly alias: "excluded";
	readonly cols: TableCols<Tbl>;
	readonly skip: [];
};

type CheckOnConflict<
	Oc extends OnConflict | null,
	Tbl extends Table,
	Item extends ScopeItem,
	Name extends string,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = Oc extends {
	readonly t: "update";
	readonly set: infer Set extends readonly SetItem[];
	readonly where: infer Where extends Expr | null;
}
	? CheckSet<
			Set,
			Tbl,
			Name,
			DmlCtx<DB, [Item, ExcludedItem<Tbl>], Outer, Ctes>
		> extends infer R
		? R extends AnyErr
			? R
			: CheckOptExpr<Where, DmlCtx<DB, [Item, ExcludedItem<Tbl>], Outer, Ctes>>
		: never
	: true;

export type CheckSet<
	Set extends readonly SetItem[],
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> =
	CheckSetValues<Set, C> extends infer X
		? X extends AnyErr
			? X
			: Set[number] extends TagSet
				? CheckPlainSet<Set, Tbl, Name, 0, never, never>
				: SetTargets<Set, [], [], []> extends [
							infer Cs extends readonly string[],
							infer Tgs extends readonly TargetInd[],
							infer Es extends readonly (Expr | null)[],
						]
					? CheckTargets<Cs, Tgs, Es, Tbl, Name, C> extends infer Y
						? Y extends AnyErr
							? Y
							: CheckAssignedCols<Cs, Tgs, Tbl, Name, "update">
						: never
					: never
		: never;
// Ordinary assignments already contain all target metadata. Keep the first
// duplicate until target validation finishes, preserving diagnostic priority.
type CheckPlainSet<
	Set extends readonly SetItem[],
	Tbl extends Table,
	Name extends string,
	I extends number,
	Seen extends string,
	Duplicate extends string,
> = Set extends unknown
	? CheckPlainSetAt<Set, Tbl, Name, I, Seen, Duplicate>
	: never;
type CheckPlainSetAt<
	Set extends readonly SetItem[],
	Tbl extends Table,
	Name extends string,
	I extends number,
	Seen extends string,
	Duplicate extends string,
> = I extends Set["length"]
	? [Duplicate] extends [never]
		? true
		: AssignedTwice<Duplicate, "update">
	: Set[I] extends { readonly t: "set"; readonly col: infer Col extends string }
		? Col extends keyof Tbl
			? PlainSetValue<Set[I]["e"], Tbl[Col], Col, Name> extends infer V
				? V extends AnyErr
					? V
					: CheckPlainSetAt<
							Set,
							Tbl,
							Name,
							Nx<I>,
							Seen | Col,
							[Duplicate] extends [never]
								? Col extends Seen
									? Col
									: never
								: Duplicate
						>
				: never
			: SqlError<`column "${Col}" of relation "${Name}" does not exist`, null>
		: never;
type PlainSetValue<
	E extends Expr,
	T extends ColDesc,
	Col extends string,
	Name extends string,
> = E extends TagNull
	? T["nullable"] extends false
		? NullViolation<Col, Name>
		: true
	: E extends TagDefault
		? T extends { readonly nullable: false; readonly hasDefault: false }
			? NullViolation<Col, Name>
			: true
		: true;
type CheckSetValues<
	Set extends readonly SetItem[],
	C extends Ctx,
> = Set[number] extends {
	readonly t: "set";
	readonly e: TagParam;
}
	? true
	: CheckSetValuesWalk<Set, C>;
type CheckSetValuesWalk<
	Set extends readonly SetItem[],
	C extends Ctx,
> = Set extends readonly [
	infer S extends SetItem,
	...infer R extends readonly SetItem[],
]
	? (
			S extends {
				readonly t: "setmulti";
				readonly cols: infer Cols extends readonly string[];
			}
				? CheckMultiSource<S["e"], Cols, C>
				: CheckValueItems<[S["e"]], C>
		) extends infer X
		? X extends AnyErr
			? X
			: CheckSetValuesWalk<R, C>
		: never
	: true;
type SetTargets<
	Set extends readonly SetItem[],
	Cs extends readonly string[],
	Tgs extends readonly TargetInd[],
	Es extends readonly (Expr | null)[],
> = Set extends readonly [
	infer S extends SetItem,
	...infer R extends readonly SetItem[],
]
	? S extends { readonly t: "set"; readonly col: infer Col extends string }
		? SetTargets<R, [...Cs, Col], [...Tgs, null], [...Es, S["e"]]>
		: S extends {
					readonly t: "setind";
					readonly col: infer Col extends string;
					readonly target: infer Ind extends Expr;
				}
			? SetTargets<R, [...Cs, Col], [...Tgs, Ind], [...Es, S["e"]]>
			: SetTargets<
					R,
					[...Cs, ...Extract<S, TagSetmulti>["cols"]],
					[
						...Tgs,
						...AssignTargets<
							Extract<S, TagSetmulti>["cols"],
							Extract<S, TagSetmulti>["ind"]
						>,
					],
					[
						...Es,
						...(S["e"] extends {
							readonly t: "row";
							readonly items: infer Items extends readonly Expr[];
						}
							? Items
							: Nulls<Extract<S, TagSetmulti>["cols"]>),
					]
				>
	: [Cs, Tgs, Es];
type Nulls<Cs extends readonly string[]> = { readonly [K in keyof Cs]: null };

export type CheckMultiSource<
	E extends Expr,
	Cols_ extends readonly string[],
	C extends Ctx,
> = E extends { readonly t: "sub"; readonly q: infer Q extends SelectStmt }
	? ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
		? R extends Cols
			? HasStar<R> extends true
				? true
				: WidthCheck<R, Cols_> extends "eq"
					? true
					: SqlError<"number of columns does not match number of values", null>
			: R
		: never
	: E extends {
				readonly t: "row";
				readonly items: infer Items extends readonly Expr[];
			}
		? WidthCheck<Items, Cols_> extends "eq"
			? CheckValueItems<Items, C>
			: SqlError<"number of columns does not match number of values", null>
		: SqlError<
				"source for a multiple-column UPDATE item must be a sub-SELECT or ROW() expression",
				null
			>;

export type CheckExpr<E extends Expr, C extends Ctx> = TypeOf<E, C>;
export type CheckOptExpr<E extends Expr | null, C extends Ctx> = E extends Expr
	? CheckExpr<E, C>
	: true;

type ProjectUpdate<
	S extends UpdateStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ResolveTarget<DB, S["table"], S["alias"], "update"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? BindFrom<S["from"], DB, Outer, Ctes> extends infer L
				? L extends ScopeLevel
					? Item["alias"] extends L[number]["alias"]
						? SqlError<
								`table name "${Item["alias"]}" specified more than once`,
								null
							>
						: CheckSet<
									S["set"],
									Tbl,
									S["table"]["name"],
									DmlCtx<DB, [Item, ...L], Outer, Ctes>
								> extends infer R
							? R extends AnyErr
								? R
								: CheckOptExpr<
											S["where"],
											DmlCtx<DB, [Item, ...L], Outer, Ctes>
										> extends infer Wc
									? Wc extends AnyErr
										? Wc
										: ProjectReturning<
												S["returning"],
												S["retOpts"],
												[Item, ...L],
												TableCols<Tbl>,
												false,
												false,
												DB,
												Outer,
												Ctes
											>
									: never
							: never
					: L
				: never
			: Tg
		: never;

type ProjectDelete<
	S extends DeleteStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ResolveTarget<DB, S["table"], S["alias"], "delete from"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? BindFrom<S["using"], DB, Outer, Ctes> extends infer L
				? L extends ScopeLevel
					? Item["alias"] extends L[number]["alias"]
						? SqlError<
								`table name "${Item["alias"]}" specified more than once`,
								null
							>
						: CheckOptExpr<
									S["where"],
									DmlCtx<DB, [Item, ...L], Outer, Ctes>
								> extends infer Wc
							? Wc extends AnyErr
								? Wc
								: ProjectReturning<
										S["returning"],
										S["retOpts"],
										[Item, ...L],
										TableCols<Tbl>,
										false,
										true,
										DB,
										Outer,
										Ctes
									>
							: never
					: L
				: never
			: Tg
		: never;

export type ProjectReturning<
	Ret extends readonly Target[] | null,
	Opts extends readonly ReturningOpt[],
	Level extends ScopeLevel,
	Row extends ColMap,
	OldNull extends boolean,
	NewNull extends boolean,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = Ret extends readonly Target[]
	? OldNewLevel<
			Opts,
			Level,
			Row,
			OldNull,
			NewNull,
			null,
			null,
			[]
		> extends infer ON
		? ON extends ScopeLevel
			? ProjectTargets<Ret, MkCtx<DB, [Level, ON, ...Outer], Ctes, false>, []>
			: ON
		: never
	: null;

type OldNewLevel<
	Opts extends readonly ReturningOpt[],
	Level extends ScopeLevel,
	Row extends ColMap,
	OldNull extends boolean,
	NewNull extends boolean,
	OldA,
	NewA,
	Acc extends ScopeLevel,
> = Opts extends readonly [
	infer O extends ReturningOpt,
	...infer R extends readonly ReturningOpt[],
]
	? O["kind"] extends "old"
		? OldA extends string
			? SqlError<"OLD cannot be specified multiple times", null>
			: O["alias"] extends Level[number]["alias"] | Acc[number]["alias"]
				? SqlError<`table name "${O["alias"]}" specified more than once`, null>
				: OldNewLevel<
						R,
						Level,
						Row,
						OldNull,
						NewNull,
						O["alias"],
						NewA,
						[...Acc, RowItem<O["alias"], Row, OldNull>]
					>
		: NewA extends string
			? SqlError<"NEW cannot be specified multiple times", null>
			: O["alias"] extends Level[number]["alias"] | Acc[number]["alias"]
				? SqlError<`table name "${O["alias"]}" specified more than once`, null>
				: OldNewLevel<
						R,
						Level,
						Row,
						OldNull,
						NewNull,
						OldA,
						O["alias"],
						[...Acc, RowItem<O["alias"], Row, NewNull>]
					>
	: DefaultRow<
			"new",
			NewA,
			Level,
			DefaultRow<"old", OldA, Level, Acc, Row, OldNull>,
			Row,
			NewNull
		>;
type DefaultRow<
	Name extends string,
	Given,
	Level extends ScopeLevel,
	Acc extends ScopeLevel,
	Row extends ColMap,
	Null extends boolean,
> = Given extends string
	? Acc
	: Name extends Level[number]["alias"] | Acc[number]["alias"]
		? Acc
		: [...Acc, RowItem<Name, Row, Null>];
type RowItem<A extends string, Row extends ColMap, Null extends boolean> = {
	readonly alias: A;
	readonly cols: Null extends true ? NullableMap<Row> : Row;
	readonly skip: string[];
};

type UnionToIntersection<U> = (
	U extends unknown
		? (u: U) => void
		: never
) extends (u: infer I) => void
	? I
	: never;
type FirstOf<U> =
	UnionToIntersection<U extends unknown ? (x: U) => void : never> extends (
		x: infer L,
	) => void
		? L
		: never;
export type UnionToTuple<U, Acc extends readonly unknown[] = []> = [U] extends [
	never,
]
	? Acc
	: UnionToTuple<Exclude<U, FirstOf<U>>, [FirstOf<U>, ...Acc]>;

export type ParamsOfDml<S extends DmlStmt, DB, Ctes extends CteMap, M> =
	BindWith<S["with"], DB, [], Ctes> extends infer C2
		? C2 extends CteMap
			? ParamsOfWith<S["with"], DB, C2, M> extends infer M1
				? S extends TagInsert
					? ParamsOfInsert<Extract<S, InsertStmt>, DB, C2, M1>
					: S extends TagUpdate
						? ParamsOfUpdate<Extract<S, UpdateStmt>, DB, C2, M1>
						: S extends TagDelete
							? ParamsOfDelete<Extract<S, DeleteStmt>, DB, C2, M1>
							: ParamsOfMerge<Extract<S, MergeStmt>, DB, C2, M1>
				: never
			: M
		: never;

export type ParamsOfWith<
	W extends WithClause | null,
	DB,
	Ctes extends CteMap,
	M,
> = W extends WithClause ? ParamsOfCteList<W["ctes"], DB, Ctes, M> : M;
type ParamsOfCteList<
	Cs extends readonly Cte[],
	DB,
	Ctes extends CteMap,
	M,
> = Cs extends readonly [
	{ readonly q: infer Q },
	...infer R extends readonly Cte[],
]
	? ParamsOfCteList<
			R,
			DB,
			Ctes,
			Q extends SelectStmt
				? ParamsOfSelect<Q, DB, [], Ctes, M>
				: ParamsOfDml<Extract<Q, DmlStmt>, DB, Ctes, M>
		>
	: M;

type ParamsOfInsert<S extends InsertStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "insert into"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? InsertTargetCols<
					S["columns"],
					S["colInd"],
					S["source"],
					Tbl,
					S["table"]["name"],
					DB,
					[],
					Ctes
				> extends infer Cs
				? ParamsOfReturning<
						S["returning"],
						S["retOpts"],
						[Item],
						TableCols<Tbl>,
						true,
						false,
						DB,
						Ctes,
						ParamsOfOnConflict<
							S["onConflict"],
							Tbl,
							Item,
							DB,
							Ctes,
							ParamsOfInsertSource<
								S["source"],
								Cs extends readonly string[] ? Cs : [],
								S["colInd"],
								Tbl,
								DB,
								MkCtx<DB, [], Ctes, false>,
								M
							>
						>
					>
				: never
			: M
		: never;

type ParamsOfInsertSource<
	Source extends InsertSource,
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	DB,
	C extends Ctx,
	M,
> = Source extends {
	readonly t: "values";
	readonly rows: infer Rows extends readonly (readonly Expr[])[];
}
	? ParamsOfInfoRows<
			Rows,
			TargetInfos<Cs, Ind, Tbl, C>,
			C,
			ParamsOfInds<Cs, Ind, Tbl, C, M>
		>
	: Source extends {
				readonly t: "select";
				readonly q: infer Q extends SelectStmt;
			}
		? ParamsOfSelect<
				Q,
				DB,
				[],
				C["ctes"],
				ParamsOfInds<Cs, Ind, Tbl, C, M>
			> extends infer M1
			? Q["body"] extends {
					readonly t: "simple";
					readonly targets: infer Ts extends readonly Target[];
				}
				? ParamsOfInfoTargets<Ts, TargetInfos<Cs, Ind, Tbl, C>, M1>
				: M1
			: never
		: ParamsOfInds<Cs, Ind, Tbl, C, M>;
type ParamsOfInfoRows<
	Rows extends readonly (readonly Expr[])[],
	Infos extends readonly ColInfo[],
	C extends Ctx,
	M,
> = Rows extends readonly [
	infer R extends readonly Expr[],
	...infer Rest extends readonly (readonly Expr[])[],
]
	? ParamsOfInfoRows<Rest, Infos, C, ParamsOfRowInfos<R, Infos, C, M>>
	: M;
export type ParamsOfRowInfos<
	Es extends readonly Expr[],
	Infos extends readonly ColInfo[],
	C extends Ctx,
	M,
> = Es extends infer ET extends readonly Expr[]
	?
			| M
			| {
					[K in keyof ET]: K extends `${number}`
						? K extends keyof Infos
							? ParamsOfOpt<ET[K] & Expr, C, never, Infos[K]>
							: ParamsOfExpr<ET[K] & Expr, C, never>
						: never;
			  }[number]
	: never;
type ParamsOfInfoTargets<
	Ts extends readonly Target[],
	Infos extends readonly ColInfo[],
	M,
> = Ts extends readonly [
	infer T extends Target,
	...infer TR extends readonly Target[],
]
	? Infos extends readonly [infer CI, ...infer IR extends readonly ColInfo[]]
		? ParamsOfInfoTargets<
				TR,
				IR,
				T["e"] extends {
					readonly t: "param";
					readonly n: infer N extends number;
				}
					? AddParam<M, N, CI>
					: M
			>
		: M
	: M;

type ParamsOfOnConflict<
	Oc extends OnConflict | null,
	Tbl extends Table,
	Item extends ScopeItem,
	DB,
	Ctes extends CteMap,
	M,
> = Oc extends {
	readonly t: "update";
	readonly set: infer Set extends readonly SetItem[];
	readonly where: infer Where extends Expr | null;
}
	? ParamsOfOpt<
			Where,
			DmlCtx<DB, [Item, ExcludedItem<Tbl>], [], Ctes>,
			ParamsOfSet<Set, Tbl, DmlCtx<DB, [Item, ExcludedItem<Tbl>], [], Ctes>, M>,
			Info<"bool">
		>
	: M;

export type ParamsOfSet<
	Set extends readonly SetItem[],
	Tbl extends Table,
	C extends Ctx,
	M,
> = Set[number] extends PlainParamSet
	? M | PlainSetParams<Set[number], Tbl>
	: ParamsOfSetWalk<Set, Tbl, C, M>;
type PlainParamSet = {
	readonly t: "set";
	readonly col: string;
	readonly e: { readonly t: "param"; readonly n: number };
};
type PlainSetParams<S, Tbl extends Table> = S extends PlainParamSet
	? ColInfoOf<Tbl, S["col"]> extends infer T extends ColInfo
		? AddParam<never, S["e"]["n"], T>
		: never
	: never;
type ParamsOfSetWalk<
	Set extends readonly SetItem[],
	Tbl extends Table,
	C extends Ctx,
	M,
> = Set extends readonly [infer S, ...infer R extends readonly SetItem[]]
	? ParamsOfSetWalk<
			R,
			Tbl,
			C,
			S extends {
				readonly t: "set";
				readonly col: infer Col extends string;
				readonly e: infer E extends Expr;
			}
				? ParamsOfOpt<E, C, M, ColInfoOf<Tbl, Col>>
				: S extends {
							readonly t: "setind";
							readonly col: infer Col extends string;
							readonly target: infer Ind extends Expr;
							readonly e: infer E extends Expr;
						}
					? ParamsOfOpt<
							E,
							C,
							ParamsOfInds<[Col], [Ind], Tbl, C, M>,
							AssignParamInfo<Tbl, Col, Ind, C>
						>
					: S extends {
								readonly t: "setmulti";
								readonly cols: infer Cols_ extends readonly string[];
								readonly ind: infer Ind extends readonly TargetInd[] | null;
								readonly e: infer E extends Expr;
							}
						? E extends {
								readonly t: "row";
								readonly items: infer Items extends readonly Expr[];
							}
							? ParamsOfRowInfos<
									Items,
									TargetInfos<Cols_, Ind, Tbl, C>,
									C,
									ParamsOfInds<Cols_, Ind, Tbl, C, M>
								>
							: ParamsOfExpr<E, C, ParamsOfInds<Cols_, Ind, Tbl, C, M>>
						: M
		>
	: M;

export type ParamsOfReturning<
	Ret extends readonly Target[] | null,
	Opts extends readonly ReturningOpt[],
	Level extends ScopeLevel,
	Row extends ColMap,
	OldNull extends boolean,
	NewNull extends boolean,
	DB,
	Ctes extends CteMap,
	M,
> = Ret extends readonly Target[]
	? OldNewLevel<
			Opts,
			Level,
			Row,
			OldNull,
			NewNull,
			null,
			null,
			[]
		> extends infer ON
		? ON extends ScopeLevel
			? ParamsOfTargets<Ret, MkCtx<DB, [Level, ON], Ctes, false>, M>
			: M
		: never
	: M;

type ParamsOfUpdate<S extends UpdateStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "update"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? BindFrom<S["from"], DB, [], Ctes> extends infer L
				? L extends ScopeLevel
					? ParamsOfReturning<
							S["returning"],
							S["retOpts"],
							[Item, ...L],
							TableCols<Tbl>,
							false,
							false,
							DB,
							Ctes,
							ParamsOfOpt<
								S["where"],
								DmlCtx<DB, [Item, ...L], [], Ctes>,
								ParamsOfSet<
									S["set"],
									Tbl,
									DmlCtx<DB, [Item, ...L], [], Ctes>,
									ParamsOfFromItems<
										S["from"],
										DmlCtx<DB, [Item, ...L], [], Ctes>,
										M
									>
								>,
								Info<"bool">
							>
						>
					: M
				: never
			: M
		: never;

type ParamsOfDelete<S extends DeleteStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "delete from"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? BindFrom<S["using"], DB, [], Ctes> extends infer L
				? L extends ScopeLevel
					? ParamsOfReturning<
							S["returning"],
							S["retOpts"],
							[Item, ...L],
							TableCols<Tbl>,
							false,
							true,
							DB,
							Ctes,
							ParamsOfOpt<
								S["where"],
								DmlCtx<DB, [Item, ...L], [], Ctes>,
								ParamsOfFromItems<
									S["using"],
									DmlCtx<DB, [Item, ...L], [], Ctes>,
									M
								>,
								Info<"bool">
							>
						>
					: M
				: never
			: M
		: never;

type TagInsert = { readonly t: "insert" };
type TagUpdate = { readonly t: "update" };
type TagDelete = { readonly t: "delete" };
type TagParam = { readonly t: "param" };
type TagParamDefault = { readonly t: "param" | "default" };
type TagDefault = { readonly t: "default" };
type TagNull = { readonly t: "null" };
type TagCol = { readonly t: "col" };
type TagField = { readonly t: "field" };
type TagSetmulti = { readonly t: "setmulti" };

type TagSet = { readonly t: "set" };
