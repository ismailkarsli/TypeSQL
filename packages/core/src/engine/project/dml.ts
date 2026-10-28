import type { Table } from "../../schema/column.js";
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
import type { HasStar, TypeDisplay } from "../binder/clauses.js";
import type { BindFrom } from "../binder/from.js";
import type { ResolveWritableTable, TableCols } from "../binder/resolve.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Nx } from "../parser/util.js";
import type {
	AddParam,
	ParamsOfExpr,
	ParamsOfFromItems,
	ParamsOfOpt,
	ParamsOfSelect,
	ParamsOfTargets,
} from "../typer/params.js";
import type { TypeOf } from "../typer/typeof.js";
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
} from "../types.js";
import type { ParamsOfMerge, ProjectMerge } from "./merge.js";
import type { BindWith, ProjectSelect, ProjectTargets } from "./select.js";

/**
 * DML projection and validation.
 *
 * `ProjectDml<S, DB, Outer, Ctes>` → `Cols` (RETURNING), `null` (no RETURNING) or `SqlError`.
 *
 * Checks performed (messages follow Postgres):
 *   - the target is a writable table (`relation "x" does not exist`, `cannot insert into view "v"`);
 *     CTE names are not DML targets, exactly as in Postgres;
 *   - INSERT column list: columns exist and are listed once (`column "c" specified more than
 *     once`, unless only elements or fields of it are assigned), VALUES rows / SELECT width
 *     match the column count (`INSERT has more expressions than target columns` / `... more
 *     target columns than expressions`, `VALUES lists must all be the same length`);
 *   - every NOT NULL column without a default is assigned
 *     (`null value in column "c" of relation "t" violates not-null constraint`), also for a
 *     literal `NULL` assigned to a NOT NULL column and `DEFAULT` assigned to one without a
 *     default; `DEFAULT` anywhere but a VALUES item or a SET value is
 *     `DEFAULT is not allowed in this context`, and through an indirection `cannot set an
 *     array element to DEFAULT` / `cannot set a subfield to DEFAULT`;
 *   - SET, in Postgres's order: the values are typed (multi-column sources have the right
 *     width), then the columns exist (`column "c" of relation "t" does not exist`) and take
 *     what is assigned, then none is assigned twice (`multiple assignments to same column "c"`);
 *   - UPDATE's FROM and DELETE's USING do not reuse the target's name
 *     (`table name "t" specified more than once`);
 *   - every expression (VALUES, SET, WHERE, ON CONFLICT, RETURNING) is typed and the first
 *     error propagates.
 *
 * Scopes: VALUES sees only the outer scope; UPDATE SET / WHERE / RETURNING see the target
 * (by alias or name) plus the FROM items; DELETE likewise with USING; ON CONFLICT DO UPDATE
 * sees the target plus `excluded` (so an unqualified column present in both is ambiguous,
 * as in Postgres). `RETURNING *` expands every item of the level (target + FROM/USING).
 * RETURNING also sees the `old` and `new` rows of the target (PostgreSQL 18; renamed with
 * `RETURNING WITH (OLD AS o, NEW AS n)`), qualified only: `old.*` is NULL for an INSERT,
 * `new.*` for a DELETE, so their columns are nullable there. MERGE is in merge.ts.
 *
 * Assignment targets with indirection (`SET a[1] = …`, `INSERT INTO t (c.f, a[1:2])`) take the
 * type of the element, slice or field (`unknown` for a field of a composite type the schema
 * does not describe), always nullable; the column itself must exist.
 *
 * Without a column list, `INSERT INTO t VALUES (...)` assigns the first N columns *in
 * declaration order*. That order is not observable at the type level (TypeScript 7
 * orders `keyof` unions alphabetically), so in that case the width check is still done
 * but positional typing is skipped: `$n` is `unknown` and the required-column check is
 * not performed.
 */
export type ProjectDml<
	S extends DmlStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	BindWith<S["with"], DB, Outer, Ctes> extends infer C2
		? C2 extends CteMap
			? S extends { readonly t: "insert" }
				? ProjectInsert<Extract<S, InsertStmt>, DB, Outer, C2>
				: S extends { readonly t: "update" }
					? ProjectUpdate<Extract<S, UpdateStmt>, DB, Outer, C2>
					: S extends { readonly t: "delete" }
						? ProjectDelete<Extract<S, DeleteStmt>, DB, Outer, C2>
						: ProjectMerge<Extract<S, MergeStmt>, DB, Outer, C2>
			: C2
		: never;

// ───────────────────────────── target table ─────────────────────────────

/** Resolved DML target: the raw table (with `hasDefault`) and its scope item. */
export type Target_<Tbl extends Table, Item extends ScopeItem> = {
	readonly tbl: Tbl;
	readonly item: Item;
};

/** `Target_` or `SqlError`. `Verb` rewrites the generic view error into Postgres wording. */
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

/** `{ type, nullable }` of a table column (without `hasDefault`); the callers pass existing columns (checked first, or a statement already validated). */
export type ColInfoOf<Tbl extends Table, Col extends string> = {
	readonly type: Tbl[Col & keyof Tbl]["type"];
	readonly nullable: Tbl[Col & keyof Tbl]["nullable"];
};

// ───────────────────────────── indirection ─────────────────────────────

/**
 * Typing context for an indirection (`a[i].f`): the bare column `Col` resolves to the target
 * column (an innermost level of its own), anything else (subscripts) to `C`'s scope.
 */
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

/**
 * What an assignment to the existing column `Col` with indirection `Ind` stores: the column's
 * info without indirection; with it, the element / slice / field type, nullable (a NULL element
 * or field is fine in a NOT NULL column). `SqlError` when the indirection does not type-check.
 */
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

/** Built-in types without subscripting (arrays, `jsonb`, `point`, `name`, … have it; unknown types may be domains over arrays). */
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
/** `AssignInfo` for the parameter pass, of a statement already validated (so never an error). */
type AssignParamInfo<
	Tbl extends Table,
	Col extends string,
	Ind,
	C extends Ctx,
> = Extract<AssignInfo<Tbl, Col, Ind, C>, ColInfo>;

/** The indirection of each target of `Cs`, `null` for a whole column (`Ind` is null when no target has any, else it has an entry for every target). */
export type AssignTargets<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
> = {
	readonly [K in keyof Cs]: Ind extends readonly TargetInd[]
		? Ind[K & keyof Ind]
		: null;
};

/** Infos of the targets (`AssignParamInfo` of each), for typing `$n` by position. */
export type TargetInfos<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	C extends Ctx,
> = {
	readonly [K in keyof Cs]: AssignParamInfo<
		Tbl,
		Cs[K],
		AssignTargets<Cs, Ind>[K],
		C
	>;
};

/** Parameters in the subscripts of the targets' indirection. */
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

// ───────────────────────────── INSERT ─────────────────────────────

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

/**
 * The assigned columns: the explicit list (validated and width-checked against the
 * source), `[]` for `DEFAULT VALUES`, `null` when there is no list (positional order
 * unknown; only "more expressions than columns" is checked), or `SqlError`.
 */
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

/**
 * Width of the source as a tuple (the first VALUES row, the SELECT's columns, `[]` for
 * DEFAULT VALUES), `null` when unknown (a `*` in the SELECT), or `SqlError`.
 */
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
		: []; // DEFAULT VALUES

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

/** Compare two widths: `"eq"`, `"more"` (A longer), `"fewer"` (B longer). */
export type WidthCheck<
	A extends readonly unknown[],
	B extends readonly unknown[],
> = A extends readonly [unknown, ...infer AR]
	? B extends readonly [unknown, ...infer BR]
		? WidthCheck<AR, BR>
		: "more"
	: B extends readonly [unknown, ...unknown[]]
		? "fewer"
		: "eq";

/**
 * Postgres's checks of the assigned columns `Cs`, in order: each exists, and a column assigned
 * whole is assigned only once, while its elements or fields may be assigned several times
 * (`Tgs`: `AssignTargets` of `Cs`, `null` for a whole assignment). INSERT's column list says
 * `column "c" specified more than once`; UPDATE's rewriter, after the statement is analyzed,
 * `multiple assignments to same column "c"`.
 */
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

/**
 * An INSERT's source against its targets `Cs` (with indirection `Ind`; `[]` without a column
 * list): each VALUES row is typed (outer scope only), then checked against the targets; a
 * query's targets are checked without values (`CheckTargets`).
 */
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
	? CheckRows<Rows, Cs, AssignTargets<Cs, Ind>, Tbl, Name, C>
	: CheckTargets<Cs, AssignTargets<Cs, Ind>, [], Tbl, Name, C>;

/** Type each row (`CheckValueItems`), then check what it stores in the targets (`CheckTargets`). */
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

/** Type each item of a VALUES row or multi-column SET source; a bare `DEFAULT` is allowed there and skipped. */
export type CheckValueItems<
	Es extends readonly Expr[],
	C extends Ctx,
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? E extends { readonly t: "default" }
		? CheckValueItems<R, C>
		: TypeOf<E, C> extends infer T
			? T extends ColInfo
				? CheckValueItems<R, C>
				: T
			: never
	: true;

/**
 * What each assignment stores, in order (Postgres's transformAssignedExpr, after the values are
 * typed): the column exists; `DEFAULT` cannot be stored in an element or a field (a NULL can),
 * and the indirection is typed (`AssignInfo`); a literal `NULL`, or a `DEFAULT` where there is
 * no default, in a NOT NULL column is a NOT NULL violation. `Cs`: the columns, `Tgs`: their
 * `AssignTargets`, `Es`: the values (`null`, or none, for the columns of a query).
 */
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
			? Es[I] extends { readonly t: "default" }
				? DefaultIntoInd<Tgs[I]>
				: AssignInfo<Tbl, Col, Tgs[I], C> extends infer X
					? X extends AnyErr
						? X
						: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
					: never
			: Es[I] extends { readonly t: "null" }
				? Tbl[Col]["nullable"] extends false
					? NullViolation<Col, Name>
					: CheckTargets<Cs, Tgs, Es, Tbl, Name, C, Nx<I>>
				: Es[I] extends { readonly t: "default" }
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

/** `DEFAULT` assigned through an indirection: Postgres names its first step (on the bare column). */
type DefaultIntoInd<Ind> = Ind extends { readonly e: infer In }
	? In extends { readonly t: "col" }
		? Ind extends { readonly t: "field" }
			? SqlError<"cannot set a subfield to DEFAULT", null>
			: SqlError<"cannot set an array element to DEFAULT", null>
		: DefaultIntoInd<In>
	: never;

/** Every NOT NULL column without a default must be in `Cs` (skipped when `Cs` is unknown). */
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

type MissingRequired<Tbl extends Table, Given extends string> = {
	[K in keyof Tbl]: K extends Given
		? never
		: Tbl[K] extends { readonly nullable: false; readonly hasDefault: false }
			? K
			: never;
}[keyof Tbl];

// ─── ON CONFLICT ───

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

// ───────────────────────────── SET ─────────────────────────────

/**
 * A SET list, in Postgres's order: every value is typed (`CheckSetValues`), then each target is
 * checked (`CheckTargets`), then the rewriter rejects a column assigned twice (`CheckAssignedCols`).
 */
export type CheckSet<
	Set extends readonly SetItem[],
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> =
	CheckSetValues<Set, C> extends infer X
		? X extends AnyErr
			? X
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
type CheckSetValues<
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
			: CheckSetValues<R, C>
		: never
	: true;
/** The columns a SET list assigns, in order, their `AssignTargets` and the values (`null` from a sub-SELECT). */
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
					[...Cs, ...Extract<S, { readonly t: "setmulti" }>["cols"]],
					[
						...Tgs,
						...AssignTargets<
							Extract<S, { readonly t: "setmulti" }>["cols"],
							Extract<S, { readonly t: "setmulti" }>["ind"]
						>,
					],
					[
						...Es,
						...(S["e"] extends {
							readonly t: "row";
							readonly items: infer Items extends readonly Expr[];
						}
							? Items
							: Nulls<Extract<S, { readonly t: "setmulti" }>["cols"]>),
					]
				>
	: [Cs, Tgs, Es];
type Nulls<Cs extends readonly string[]> = { readonly [K in keyof Cs]: null };

/** `(a, b) = (e1, e2)` / `= ROW(…)` / `= (SELECT ...)`: width must match, expressions typed; any other source is an error. */
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

/** `ColInfo` or `SqlError`: the callers only look for an error. */
export type CheckExpr<E extends Expr, C extends Ctx> = TypeOf<E, C>;
export type CheckOptExpr<E extends Expr | null, C extends Ctx> = E extends Expr
	? CheckExpr<E, C>
	: true;

// ───────────────────────────── UPDATE / DELETE ─────────────────────────────

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

/**
 * RETURNING: `Cols` or `SqlError`, `null` without RETURNING. `Level` is the statement's level
 * (target + FROM / USING items); `Row` the target's columns, from which the `old` / `new` rows
 * are built (nullable when the statement can produce no such row: `OldNull`, `NewNull`).
 */
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

/**
 * The `old` / `new` rows as a scope level of their own, just outside the statement's level:
 * reachable qualified (`old.x`, `new.*`, `old` as a whole row, also from sub-queries), never
 * unqualified nor by `*` (their columns are all in `skip`). Postgres's rules: an explicit
 * `WITH (OLD AS o)` must not repeat its kind (`OLD cannot be specified multiple times`) nor
 * reuse a name of the level (`table name "o" specified more than once`); without one, `old` /
 * `new` are added unless a FROM item (or the target alias) already has that name.
 */
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

// ───────────────────────────── helpers ─────────────────────────────

type UnionToIntersection<U> = (
	U extends unknown
		? (u: U) => void
		: never
) extends (u: infer I) => void
	? I
	: never;
/** One member of a union (the last in TypeScript's internal order). */
type FirstOf<U> =
	UnionToIntersection<U extends unknown ? (x: U) => void : never> extends (
		x: infer L,
	) => void
		? L
		: never;
/** Union → tuple (order is TypeScript's, i.e. alphabetical for string literals; only the length is relied upon). */
export type UnionToTuple<U, Acc extends readonly unknown[] = []> = [U] extends [
	never,
]
	? Acc
	: UnionToTuple<Exclude<U, FirstOf<U>>, [FirstOf<U>, ...Acc]>;

// ───────────────────────────── parameters ─────────────────────────────

/**
 * Parameter typing for DML. `VALUES ($1)` and `SET c = $1` give the column's type with the
 * column's nullability (so `null` is accepted only for nullable columns); bare `$n` targets
 * of an `INSERT ... SELECT` are typed positionally from the target columns; everything else
 * (WHERE, FROM/USING, ON CONFLICT, RETURNING, sub-selects) goes through the expression pass
 * with a scope that contains the target table. Parameters inside WITH bodies are collected
 * too. Only reached for statements that already passed `ProjectDml`.
 */
export type ParamsOfDml<S extends DmlStmt, DB, Ctes extends CteMap, M> =
	BindWith<S["with"], DB, [], Ctes> extends infer C2
		? C2 extends CteMap
			? ParamsOfWith<S["with"], DB, C2, M> extends infer M1
				? S extends { readonly t: "insert" }
					? ParamsOfInsert<Extract<S, InsertStmt>, DB, C2, M1>
					: S extends { readonly t: "update" }
						? ParamsOfUpdate<Extract<S, UpdateStmt>, DB, C2, M1>
						: S extends { readonly t: "delete" }
							? ParamsOfDelete<Extract<S, DeleteStmt>, DB, C2, M1>
							: ParamsOfMerge<Extract<S, MergeStmt>, DB, C2, M1>
				: never
			: M
		: never;

/** Parameters inside the bodies of a WITH clause (SELECT and DML CTEs). */
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
				: ParamsOfDml<Extract<Q, DmlStmt>, DB, Ctes, M> // a CTE ProjectDml accepted is a query or a data statement
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

/**
 * Parameters of an INSERT into the targets `Cs` (with indirection `Ind`): those in the targets'
 * subscripts, then the source's. A bare `$n` (or `$n::T`) of a VALUES row or of a plain SELECT's
 * targets takes the type of what its target stores (`TargetInfos`; nothing past the targets, as
 * without a column list); everything else goes through the expression pass. `C`: the outer scope.
 */
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
		: ParamsOfInds<Cs, Ind, Tbl, C, M>; // DEFAULT VALUES
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
/** Zip expressions with target infos: a bare `$n` (or `$n::T`) takes the info, anything else recurses. */
export type ParamsOfRowInfos<
	Es extends readonly Expr[],
	Infos extends readonly ColInfo[],
	C extends Ctx,
	M,
> = Es extends readonly [
	infer E extends Expr,
	...infer ER extends readonly Expr[],
]
	? Infos extends readonly [infer CI, ...infer IR extends readonly ColInfo[]]
		? ParamsOfRowInfos<ER, IR, C, ParamsOfOpt<E, C, M, CI>>
		: ParamsOfRowInfos<ER, [], C, ParamsOfExpr<E, C, M>>
	: M;
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
> = Set extends readonly [infer S, ...infer R extends readonly SetItem[]]
	? ParamsOfSet<
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
