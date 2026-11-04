import type { ParamEntry } from "../../../engine/params.js";
import type {
	ColInfo,
	ColMap,
	Cols,
	CteMap,
	Ctx,
	Info,
	MkCtx,
	NullableMap,
	QueryContext,
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
	FromItem,
	InsertSource,
	InsertStmt,
	MergeStmt,
	OnConflict,
	ReturningOpt,
	SelectStmt,
	SetItem,
	TableRef,
	Tag,
	Target,
	TargetInd,
	UpdateStmt,
	WithClause,
} from "../ast.js";
import type { HasStar } from "../binder/clauses.js";
import type { BindFrom } from "../binder/from.js";
import type { ResolveWritableTable } from "../binder/resolve.js";
import type { Nx } from "../parser/util.js";
import type {
	ParamOf,
	ParamsOfExpr,
	ParamsOfFromItems,
	ParamsOfOpt,
	ParamsOfSelect,
	ParamsOfTargets,
} from "../typer/params.js";
import type { TypeOf } from "../typer/typeof.js";
import type { ParamsOfMerge, ProjectMerge } from "./merge.js";
import type { BindWith, ProjectSelect, ProjectTargets } from "./select.js";

export type ProjectDml<S extends DmlStmt, Env extends QueryContext> =
	BindWith<S["with"], Env> extends infer C2 extends CteMap
		? S extends Tag<"insert">
			? ProjectInsert<
					Extract<S, InsertStmt>,
					QueryContext<Env["db"], Env["scope"], C2>
				>
			: S extends Tag<"update">
				? ProjectUpdDel<
						Extract<S, UpdateStmt>,
						Extract<S, UpdateStmt>["from"],
						QueryContext<Env["db"], Env["scope"], C2>
					>
				: S extends Tag<"delete">
					? ProjectUpdDel<
							Extract<S, DeleteStmt>,
							Extract<S, DeleteStmt>["using"],
							QueryContext<Env["db"], Env["scope"], C2>
						>
					: ProjectMerge<
							Extract<S, MergeStmt>,
							QueryContext<Env["db"], Env["scope"], C2>
						>
		: BindWith<S["with"], Env>;

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
	ResolveWritableTable<DB, Ref> extends infer R extends Table
		? Target_<
				R,
				{
					readonly alias: Alias extends string ? Alias : Ref["name"];
					readonly cols: R;
					readonly skip: [];
				}
			>
		: ResolveWritableTable<DB, Ref> extends SqlError<
					`cannot modify view "${infer V}"`,
					null
				>
			? SqlError<`cannot ${Verb} view "${V}"`, null>
			: ResolveWritableTable<DB, Ref>;

export type DmlCtx<Env extends QueryContext, Level extends ScopeLevel> = MkCtx<
	Env["db"],
	[Level, ...Env["scope"]],
	Env["ctes"],
	false
>;

// Preserve column identity instead of rebuilding type/nullability for each use.
type ColInfoOf<Tbl extends Table, Col extends string> = Tbl[Col & keyof Tbl];

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

type AssignInfo<
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

// Inferred rather than checked against `readonly ColInfo[]` where it is
// passed: that check would evaluate TypeOf over the whole `Expr` union.
export type TargetInfos<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	C extends Ctx,
> =
	TargetInfoMap<Cs, Ind, Tbl, C> extends infer Infos extends readonly ColInfo[]
		? Infos
		: never;

type TargetInfoMap<
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
> = Ind extends readonly TargetInd[]
	? {
			[K in keyof Cs]: K extends keyof Ind
				? Ind[K] extends Expr
					? ParamsOfExpr<Ind[K], IndCtx<Tbl, Cs[K], C>>
					: never
				: never;
		}[number]
	: never;

type ProjectInsert<S extends InsertStmt, Env extends QueryContext> =
	ResolveTarget<
		Env["db"],
		S["table"],
		S["alias"],
		"insert into"
	> extends Target_<infer Tbl, infer Item>
		? InsertTargetCols<
				S["columns"],
				S["colInd"],
				S["source"],
				Tbl,
				S["table"]["name"],
				Env
			> extends infer Cs
			? Cs extends readonly string[] | null
				? CheckInsertSource<
						S["source"],
						Cs extends readonly string[] ? Cs : [],
						S["colInd"],
						Tbl,
						S["table"]["name"],
						MkCtx<Env["db"], Env["scope"], Env["ctes"], false>
					> extends infer Chk
					? Chk extends AnyErr
						? Chk
						: CheckRequired<Tbl, Cs, S["table"]["name"]> extends AnyErr
							? CheckRequired<Tbl, Cs, S["table"]["name"]>
							: CheckOnConflict<
										S["onConflict"],
										Tbl,
										Item,
										S["table"]["name"],
										Env
									> extends infer Oc
								? Oc extends AnyErr
									? Oc
									: ProjectReturning<
											S["returning"],
											S["retOpts"],
											[Item],
											Tbl,
											true,
											false,
											Env
										>
								: never
					: never
				: Cs
			: never
		: ResolveTarget<Env["db"], S["table"], S["alias"], "insert into">;

type InsertTargetCols<
	Columns extends readonly string[] | null,
	Ind extends readonly TargetInd[] | null,
	Source extends InsertSource,
	Tbl extends Table,
	Name extends string,
	Env extends QueryContext,
> =
	SourceWidth<Source, Env> extends infer W
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

export type WidthResult<R, Ok_> = R extends "eq"
	? Ok_
	: R extends "more"
		? SqlError<"INSERT has more expressions than target columns", null>
		: SqlError<"INSERT has more target columns than expressions", null>;

type SourceWidth<
	Source extends InsertSource,
	Env extends QueryContext,
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
		? ProjectSelect<Q, Env> extends infer C extends Cols
			? HasStar<C> extends true
				? null
				: C
			: ProjectSelect<Q, Env>
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
		? Rows[number][number] extends Tag<"param">
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
	? CheckValueItems<R, C> extends true
		? CheckTargets<Cs, Tgs, R, Tbl, Name, C> extends AnyErr
			? CheckTargets<Cs, Tgs, R, Tbl, Name, C>
			: CheckRows<Rest, Cs, Tgs, Tbl, Name, C>
		: CheckValueItems<R, C>
	: true;

export type CheckValueItems<Es extends readonly Expr[], C extends Ctx> =
	Es[number] extends Tag<"param" | "default">
		? true
		: CheckValueItemsWalk<Es, C>;
type CheckValueItemsWalk<
	Es extends readonly Expr[],
	C extends Ctx,
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? E extends Tag<"default">
		? CheckValueItemsWalk<R, C>
		: TypeOf<E, C> extends ColInfo
			? CheckValueItemsWalk<R, C>
			: TypeOf<E, C>
	: true;

type CheckTargets<
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
			? Es[I] extends Tag<"default">
				? DefaultIntoInd<Tgs[I]>
				: AssignInfo<Tbl, Col, Tgs[I], C> extends AnyErr
					? AssignInfo<Tbl, Col, Tgs[I], C>
					: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
			: Es[I] extends Tag<"null">
				? Tbl[Col]["nullable"] extends false
					? NullViolation<Col, Name>
					: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
				: Es[I] extends Tag<"default">
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
	? In extends Tag<"col">
		? Ind extends Tag<"field">
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
	readonly cols: Tbl;
	readonly skip: [];
};

type CheckOnConflict<
	Oc extends OnConflict | null,
	Tbl extends Table,
	Item extends ScopeItem,
	Name extends string,
	Env extends QueryContext,
> = Oc extends {
	readonly t: "update";
	readonly set: infer Set extends readonly SetItem[];
	readonly where: infer Where extends Expr | null;
}
	? CheckSet<
			Set,
			Tbl,
			Name,
			DmlCtx<Env, [Item, ExcludedItem<Tbl>]>
		> extends infer R
		? R extends AnyErr
			? R
			: CheckOptExpr<Where, DmlCtx<Env, [Item, ExcludedItem<Tbl>]>>
		: never
	: true;

export type CheckSet<
	Set extends readonly SetItem[],
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> =
	CheckSetValues<Set, C> extends AnyErr
		? CheckSetValues<Set, C>
		: Set[number] extends Tag<"set">
			? CheckPlainSet<Set, Tbl, Name, 0, never, never>
			: SetTargets<Set, [], [], []> extends [
						infer Cs extends readonly string[],
						infer Tgs extends readonly TargetInd[],
						infer Es extends readonly (Expr | null)[],
					]
				? CheckTargets<Cs, Tgs, Es, Tbl, Name, C> extends AnyErr
					? CheckTargets<Cs, Tgs, Es, Tbl, Name, C>
					: CheckAssignedCols<Cs, Tgs, Tbl, Name, "update">
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
			? PlainSetValue<Set[I]["e"], Tbl[Col], Col, Name> extends AnyErr
				? PlainSetValue<Set[I]["e"], Tbl[Col], Col, Name>
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
			: SqlError<`column "${Col}" of relation "${Name}" does not exist`, null>
		: never;
type PlainSetValue<
	E extends Expr,
	T extends ColDesc,
	Col extends string,
	Name extends string,
> =
	E extends Tag<"null">
		? T["nullable"] extends false
			? NullViolation<Col, Name>
			: true
		: E extends Tag<"default">
			? T extends { readonly nullable: false; readonly hasDefault: false }
				? NullViolation<Col, Name>
				: true
			: true;
type CheckSetValues<
	Set extends readonly SetItem[],
	C extends Ctx,
> = Set[number] extends {
	readonly t: "set";
	readonly e: Tag<"param">;
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
					[...Cs, ...Extract<S, Tag<"setmulti">>["cols"]],
					[
						...Tgs,
						...AssignTargets<
							Extract<S, Tag<"setmulti">>["cols"],
							Extract<S, Tag<"setmulti">>["ind"]
						>,
					],
					[
						...Es,
						...(S["e"] extends {
							readonly t: "row";
							readonly items: infer Items extends readonly Expr[];
						}
							? Items
							: Nulls<Extract<S, Tag<"setmulti">>["cols"]>),
					]
				>
	: [Cs, Tgs, Es];
type Nulls<Cs extends readonly string[]> = { readonly [K in keyof Cs]: null };

type CheckMultiSource<
	E extends Expr,
	Cols_ extends readonly string[],
	C extends Ctx,
> = E extends { readonly t: "sub"; readonly q: infer Q extends SelectStmt }
	? ProjectSelect<Q, C> extends infer R extends Cols
		? HasStar<R> extends true
			? true
			: WidthCheck<R, Cols_> extends "eq"
				? true
				: SqlError<"number of columns does not match number of values", null>
		: ProjectSelect<Q, C>
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

export type CheckOptExpr<E extends Expr | null, C extends Ctx> = E extends Expr
	? TypeOf<E, C>
	: true;

type ProjectUpdDel<
	S extends UpdateStmt | DeleteStmt,
	From extends readonly FromItem[],
	Env extends QueryContext,
> =
	ResolveTarget<
		Env["db"],
		S["table"],
		S["alias"],
		UpdDelVerb<S>
	> extends Target_<infer Tbl, infer Item>
		? BindFrom<From, Env> extends infer L extends ScopeLevel
			? Item["alias"] extends L[number]["alias"]
				? SqlError<
						`table name "${Item["alias"]}" specified more than once`,
						null
					>
				: (
							S extends UpdateStmt
								? CheckSet<
										S["set"],
										Tbl,
										S["table"]["name"],
										DmlCtx<Env, [Item, ...L]>
									>
								: null
						) extends infer R
					? R extends AnyErr
						? R
						: CheckOptExpr<
									S["where"],
									DmlCtx<Env, [Item, ...L]>
								> extends infer Wc
							? Wc extends AnyErr
								? Wc
								: ProjectReturning<
										S["returning"],
										S["retOpts"],
										[Item, ...L],
										Tbl,
										false,
										S extends UpdateStmt ? false : true,
										Env
									>
							: never
					: never
			: BindFrom<From, Env>
		: ResolveTarget<Env["db"], S["table"], S["alias"], UpdDelVerb<S>>;
type UpdDelVerb<S extends UpdateStmt | DeleteStmt> = S extends UpdateStmt
	? "update"
	: "delete from";

export type ProjectReturning<
	Ret extends readonly Target[] | null,
	Opts extends readonly ReturningOpt[],
	Level extends ScopeLevel,
	Row extends ColMap,
	OldNull extends boolean,
	NewNull extends boolean,
	Env extends QueryContext,
> = Ret extends readonly Target[]
	? OldNewLevel<Opts, Level, Row, OldNull, NewNull> extends infer ON extends
			ScopeLevel
		? ProjectTargets<
				Ret,
				MkCtx<Env["db"], [Level, ON, ...Env["scope"]], Env["ctes"], false>,
				[]
			>
		: OldNewLevel<Opts, Level, Row, OldNull, NewNull>
	: null;

type OldNewLevel<
	Opts extends readonly ReturningOpt[],
	Level extends ScopeLevel,
	Row extends ColMap,
	OldNull extends boolean,
	NewNull extends boolean,
	OldA = null,
	NewA = null,
	Acc extends ScopeLevel = [],
> = Opts extends readonly [
	infer O extends ReturningOpt,
	...infer R extends readonly ReturningOpt[],
]
	? (O["kind"] extends "old" ? OldA : NewA) extends string
		? SqlError<
				`${Uppercase<O["kind"]>} cannot be specified multiple times`,
				null
			>
		: O["alias"] extends Level[number]["alias"] | Acc[number]["alias"]
			? SqlError<`table name "${O["alias"]}" specified more than once`, null>
			: OldNewLevel<
					R,
					Level,
					Row,
					OldNull,
					NewNull,
					O["kind"] extends "old" ? O["alias"] : OldA,
					O["kind"] extends "old" ? NewA : O["alias"],
					[
						...Acc,
						RowItem<
							O["alias"],
							Row,
							O["kind"] extends "old" ? OldNull : NewNull
						>,
					]
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

export type UnionToIntersection<U> = (
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

export type ParamsOfDml<S extends DmlStmt, DB, Ctes extends CteMap> =
	BindWith<S["with"], QueryContext<DB, [], Ctes>> extends infer C2 extends
		CteMap
		? ParamsOfWith<S["with"], DB, C2> extends infer M1
			? S extends Tag<"insert">
				? M1 | ParamsOfInsert<Extract<S, InsertStmt>, DB, C2>
				: S extends Tag<"update">
					?
							| M1
							| ParamsOfUpdDel<
									Extract<S, UpdateStmt>,
									Extract<S, UpdateStmt>["from"],
									DB,
									C2
							  >
					: S extends Tag<"delete">
						?
								| M1
								| ParamsOfUpdDel<
										Extract<S, DeleteStmt>,
										Extract<S, DeleteStmt>["using"],
										DB,
										C2
								  >
						: M1 | ParamsOfMerge<Extract<S, MergeStmt>, DB, C2>
			: never
		: never;

export type ParamsOfWith<
	W extends WithClause | null,
	DB,
	Ctes extends CteMap,
> = W extends WithClause ? ParamsOfCteList<W["ctes"], DB, Ctes> : never;
type ParamsOfCteList<
	Cs extends readonly Cte[],
	DB,
	Ctes extends CteMap,
> = ParamsOfCte<Cs[number]["q"], DB, Ctes>;
type ParamsOfCte<Q, DB, Ctes extends CteMap> = Q extends SelectStmt
	? ParamsOfSelect<Q, QueryContext<DB, [], Ctes>>
	: ParamsOfDml<Extract<Q, DmlStmt>, DB, Ctes>;

type ParamsOfInsert<S extends InsertStmt, DB, Ctes extends CteMap> =
	ResolveTarget<DB, S["table"], S["alias"], "insert into"> extends Target_<
		infer Tbl,
		infer Item
	>
		? InsertTargetCols<
				S["columns"],
				S["colInd"],
				S["source"],
				Tbl,
				S["table"]["name"],
				QueryContext<DB, [], Ctes>
			> extends infer Cs
			?
					| ParamsOfInsertSource<
							S["source"],
							Cs extends readonly string[] ? Cs : [],
							S["colInd"],
							Tbl,
							DB,
							MkCtx<DB, [], Ctes, false>
					  >
					| ParamsOfOnConflict<S["onConflict"], Tbl, Item, DB, Ctes>
					| ParamsOfReturning<
							S["returning"],
							S["retOpts"],
							[Item],
							Tbl,
							true,
							false,
							DB,
							Ctes
					  >
			: never
		: never;

type ParamsOfInsertSource<
	Source extends InsertSource,
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	DB,
	C extends Ctx,
> = Source extends {
	readonly t: "values";
	readonly rows: infer Rows extends readonly (readonly Expr[])[];
}
	?
			| ParamsOfInds<Cs, Ind, Tbl, C>
			| ParamsOfInfoRows<Rows, TargetInfos<Cs, Ind, Tbl, C>, C>
	: Source extends {
				readonly t: "select";
				readonly q: infer Q extends SelectStmt;
			}
		?
				| ParamsOfInds<Cs, Ind, Tbl, C>
				| ParamsOfSelect<Q, QueryContext<DB, [], C["ctes"]>> extends infer M1
			? Q["body"] extends {
					readonly t: "simple";
					readonly targets: infer Ts extends readonly Target[];
				}
				? M1 | ParamsOfInfoTargets<Ts, TargetInfos<Cs, Ind, Tbl, C>>
				: M1
			: never
		: ParamsOfInds<Cs, Ind, Tbl, C>;
type ParamsOfInfoRows<
	Rows extends readonly (readonly Expr[])[],
	Infos extends readonly ColInfo[],
	C extends Ctx,
> = ParamsOfRowInfos<Rows[number], Infos, C>;
export type ParamsOfRowInfos<
	Es extends readonly Expr[],
	Infos extends readonly ColInfo[],
	C extends Ctx,
> = Es extends infer ET extends readonly Expr[]
	? {
			[K in keyof ET]: K extends `${number}`
				? K extends keyof Infos
					? ParamsOfOpt<ET[K] & Expr, C, Infos[K]>
					: ParamsOfExpr<ET[K] & Expr, C>
				: never;
		}[number]
	: never;
type ParamsOfInfoTargets<
	Ts extends readonly Target[],
	Infos extends readonly ColInfo[],
> = {
	[K in keyof Ts]: K extends keyof Infos
		? Ts[K]["e"] extends ParamOf<infer N extends number>
			? ParamEntry<N, Infos[K]>
			: never
		: never;
}[number];

type ParamsOfOnConflict<
	Oc extends OnConflict | null,
	Tbl extends Table,
	Item extends ScopeItem,
	DB,
	Ctes extends CteMap,
> = Oc extends {
	readonly t: "update";
	readonly set: infer Set extends readonly SetItem[];
	readonly where: infer Where extends Expr | null;
}
	?
			| ParamsOfSet<
					Set,
					Tbl,
					DmlCtx<QueryContext<DB, [], Ctes>, [Item, ExcludedItem<Tbl>]>
			  >
			| ParamsOfOpt<
					Where,
					DmlCtx<QueryContext<DB, [], Ctes>, [Item, ExcludedItem<Tbl>]>,
					Info<"bool">
			  >
	: never;

export type ParamsOfSet<
	Set extends readonly SetItem[],
	Tbl extends Table,
	C extends Ctx,
> = Set[number] extends PlainParamSet
	? PlainSetParams<Set[number], Tbl>
	: ParamsOfSetItem<Set[number], Tbl, C>;
type PlainParamSet = {
	readonly t: "set";
	readonly col: string;
	readonly e: { readonly t: "param"; readonly n: number };
};
type PlainSetParams<S, Tbl extends Table> = S extends PlainParamSet
	? ColInfoOf<Tbl, S["col"]> extends infer T extends ColInfo
		? ParamEntry<S["e"]["n"], T>
		: never
	: never;
type ParamsOfSetItem<
	S extends SetItem,
	Tbl extends Table,
	C extends Ctx,
> = S extends {
	readonly t: "set";
	readonly col: infer Col extends string;
	readonly e: infer E extends Expr;
}
	? ParamsOfOpt<E, C, ColInfoOf<Tbl, Col>>
	: S extends {
				readonly t: "setind";
				readonly col: infer Col extends string;
				readonly target: infer Ind extends Expr;
				readonly e: infer E extends Expr;
			}
		?
				| ParamsOfInds<[Col], [Ind], Tbl, C>
				| ParamsOfOpt<E, C, AssignParamInfo<Tbl, Col, Ind, C>>
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
				?
						| ParamsOfInds<Cols_, Ind, Tbl, C>
						| ParamsOfRowInfos<Items, TargetInfos<Cols_, Ind, Tbl, C>, C>
				: ParamsOfInds<Cols_, Ind, Tbl, C> | ParamsOfExpr<E, C>
			: never;

export type ParamsOfReturning<
	Ret extends readonly Target[] | null,
	Opts extends readonly ReturningOpt[],
	Level extends ScopeLevel,
	Row extends ColMap,
	OldNull extends boolean,
	NewNull extends boolean,
	DB,
	Ctes extends CteMap,
> = Ret extends readonly Target[]
	? OldNewLevel<Opts, Level, Row, OldNull, NewNull> extends infer ON extends
			ScopeLevel
		? ParamsOfTargets<Ret, MkCtx<DB, [Level, ON], Ctes, false>>
		: never
	: never;

type ParamsOfUpdDel<
	S extends UpdateStmt | DeleteStmt,
	From extends readonly FromItem[],
	DB,
	Ctes extends CteMap,
> =
	ResolveTarget<DB, S["table"], S["alias"], UpdDelVerb<S>> extends Target_<
		infer Tbl,
		infer Item
	>
		? BindFrom<From, QueryContext<DB, [], Ctes>> extends infer L
			? L extends ScopeLevel
				?
						| (ParamsOfFromItems<
								From,
								DmlCtx<QueryContext<DB, [], Ctes>, [Item, ...L]>
						  > extends infer MF
								? S extends UpdateStmt
									?
											| MF
											| ParamsOfSet<
													S["set"],
													Tbl,
													DmlCtx<QueryContext<DB, [], Ctes>, [Item, ...L]>
											  >
									: MF
								: never)
						| ParamsOfOpt<
								S["where"],
								DmlCtx<QueryContext<DB, [], Ctes>, [Item, ...L]>,
								Info<"bool">
						  >
						| ParamsOfReturning<
								S["returning"],
								S["retOpts"],
								[Item, ...L],
								Tbl,
								false,
								S extends UpdateStmt ? false : true,
								DB,
								Ctes
						  >
				: never
			: never
		: never;
