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
import type { TypeDisplay } from "../binder/clauses.js";
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
 *   - INSERT column list: columns exist, VALUES rows / SELECT width match the column count
 *     (`INSERT has more expressions than target columns` / `... more target columns than
 *     expressions`, `VALUES lists must all be the same length`);
 *   - every NOT NULL column without a default is assigned
 *     (`null value in column "c" of relation "t" violates not-null constraint`), also for a
 *     literal `NULL` assigned to a NOT NULL column and `DEFAULT` assigned to one without a
 *     default; `DEFAULT` anywhere but a VALUES item or a SET value is
 *     `DEFAULT is not allowed in this context`;
 *   - SET columns exist (`column "c" of relation "t" does not exist`), multi-column SET
 *     sources have the right width;
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
						: S extends { readonly t: "merge" }
							? ProjectMerge<Extract<S, MergeStmt>, DB, Outer, C2>
							: never
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
> = MkCtx<DB, [Level, ...Outer], Ctes, false>; // type-mutate: equivalent bool-flip – aggregates are not allowed directly in data statements, so no valid statement depends on it

/** `{ type, nullable }` of a table column (without `hasDefault`), or `null` for an unknown name. */
export type ColInfoOf<
	Tbl extends Table,
	Col extends string,
> = Col extends keyof Tbl // type-mutate: equivalent cond-true – the callers pass existing columns (checked first, or a statement already validated)
	? { readonly type: Tbl[Col]["type"]; readonly nullable: Tbl[Col]["nullable"] }
	: null;

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
	false // type-mutate: equivalent bool-flip – aggregates are not allowed directly in data statements, so no valid statement depends on it
>;

/**
 * What an assignment to `Col` with indirection `Ind` stores: the column's info without
 * indirection; with it, the element / slice / field type, nullable (a NULL element or field is
 * fine in a NOT NULL column). `SqlError` when the indirection does not type-check. `null` for
 * an unknown column (reported by the existence check).
 */
export type AssignInfo<
	Tbl extends Table,
	Col extends string,
	Ind,
	C extends Ctx,
> = Col extends keyof Tbl // type-mutate: equivalent cond-true – the callers pass existing columns (checked first, or a statement already validated)
	? Ind extends Expr
		? CheckSubscripts<Ind, IndCtx<Tbl, Col, C>> extends infer K
			? K extends AnyErr
				? K
				: TypeOf<Ind, IndCtx<Tbl, Col, C>> extends infer X
					? X extends ColInfo
						? Info<X["type"], true>
						: X
					: never
			: never
		: ColInfoOf<Tbl, Col>
	: null;

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
/** Postgres's errors for subscripting a type that has none, and for a `jsonb` slice. */
type CheckSubscripts<E, C extends Ctx> = E extends {
	readonly t: "idx" | "slice";
	readonly e: infer B extends Expr;
}
	? TypeOf<B, C> extends infer BT
		? BT extends ColInfo
			? BT["type"] extends NoSubscript
				? SqlError<
						`cannot subscript type ${TypeDisplay<BT["type"]>} because it does not support subscripting`,
						null
					>
				: E extends { readonly t: "slice" }
					? BT["type"] extends "jsonb"
						? SqlError<"jsonb subscript does not support slices", null>
						: CheckSubscripts<B, C>
					: CheckSubscripts<B, C>
			: BT
		: never
	: E extends { readonly t: "field"; readonly e: infer B }
		? CheckSubscripts<B, C>
		: true;
/** `AssignInfo` for the parameter pass (errors are the main pass's business). */
type AssignParamInfo<
	Tbl extends Table,
	Col extends string,
	Ind,
	C extends Ctx,
> =
	AssignInfo<Tbl, Col, Ind, C> extends infer X
		? X extends ColInfo
			? X
			: null
		: never;

/** Type-check the indirection of each target (`Ind` is null when no target has any). */
export type CheckInds<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	C extends Ctx,
> = Ind extends readonly TargetInd[] ? CheckIndsLoop<Cs, Ind, Tbl, C, 0> : true;
type CheckIndsLoop<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[],
	Tbl extends Table,
	C extends Ctx,
	I extends number,
> = Cs[I] extends string
	? Ind[I] extends Expr
		? AssignInfo<Tbl, Cs[I], Ind[I], C> extends infer X
			? X extends AnyErr
				? X
				: CheckIndsLoop<Cs, Ind, Tbl, C, Nx<I>>
			: never
		: CheckIndsLoop<Cs, Ind, Tbl, C, Nx<I>>
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

/** Column names for the NULL-literal check: a target with indirection does not store NULL in the column (`""` never matches). */
export type NullCheckCols<
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
> = Ind extends readonly TargetInd[] // type-mutate: equivalent cond-true – mapping the names over a null Ind gives the same names
	? {
			readonly [K in keyof Cs]: K extends keyof Ind
				? Ind[K] extends null
					? Cs[K]
					: ""
				: Cs[K]; // type-mutate: equivalent never-false – Ind has an entry for every target
		}
	: Cs;

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
		Ind extends readonly TargetInd[]
			? K extends keyof Ind
				? Ind[K]
				: null // type-mutate: equivalent never-false – Ind has an entry for every target
			: null,
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
	: M; // type-mutate: equivalent never-false – only called for targets with indirection
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
		? Tg extends Target_<infer Tbl extends Table, infer Item>
			? InsertTargetCols<
					S["columns"],
					S["source"],
					Tbl,
					S["table"]["name"],
					DB,
					Outer,
					Ctes
				> extends infer Cs
				? Cs extends readonly string[] | null
					? CheckInds<
							Cs extends readonly string[] ? Cs : [], // type-mutate: equivalent never-false – without a column list there is no indirection to check
							S["colInd"],
							Tbl,
							MkCtx<DB, Outer, Ctes, false>
						> extends infer Ci
						? Ci extends AnyErr
							? Ci
							: CheckInsertSource<
										S["source"],
										Cs extends readonly string[]
											? NullCheckCols<Cs, S["colInd"]>
											: null,
										Tbl,
										S["table"]["name"],
										DB,
										Outer,
										Ctes
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
				? CheckColsExist<Columns, Tbl, Name> extends infer E
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
		: Source extends { readonly t: "default" }
			? []
			: SqlError<
					// type-mutate: equivalent never-false – an INSERT source is VALUES, a query or DEFAULT VALUES
					"INSERT source must be VALUES, a query or DEFAULT VALUES",
					null
				>;

type SameLength<
	Rows extends readonly (readonly unknown[])[],
	Ref extends readonly unknown[],
> = Rows extends readonly [
	infer R extends readonly unknown[],
	...infer Rest extends readonly (readonly unknown[])[],
]
	? WidthCheck<R, Ref> extends "eq"
		? SameLength<Rest, Ref> // type-mutate: equivalent never-true – a never passes the caller's `SameLength<…> extends true` too
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

export type HasStar<C extends Cols> = C[number] extends infer E
	? (E extends { readonly star: ColMap } ? true : false) extends false
		? false
		: true
	: false;

export type CheckColsExist<
	Columns extends readonly string[],
	Tbl extends Table,
	Name extends string,
> = Columns extends readonly [
	infer C extends string,
	...infer R extends readonly string[],
]
	? C extends keyof Tbl
		? CheckColsExist<R, Tbl, Name>
		: SqlError<`column "${C}" of relation "${Name}" does not exist`, null>
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

/** Type every VALUES row (outer scope only) and reject literal NULL in NOT NULL columns. */
type CheckInsertSource<
	Source extends InsertSource,
	Cs extends readonly string[] | null,
	Tbl extends Table,
	Name extends string,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = Source extends {
	readonly t: "values";
	readonly rows: infer Rows extends readonly (readonly Expr[])[];
}
	? CheckRows<Rows, Cs, Tbl, Name, MkCtx<DB, Outer, Ctes, false>> // type-mutate: equivalent bool-flip – aggregates are not allowed in VALUES, so no valid statement depends on it
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

type CheckRows<
	Rows extends readonly (readonly Expr[])[],
	Cs extends readonly string[] | null,
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> = Rows extends readonly [
	infer R extends readonly Expr[],
	...infer Rest extends readonly (readonly Expr[])[],
]
	? CheckValueItems<R, C> extends infer Ts
		? Ts extends true
			? CheckNullLiterals<
					R,
					Cs extends readonly string[] ? Cs : [],
					Tbl,
					Name
				> extends infer N
				? N extends AnyErr
					? N
					: CheckRows<Rest, Cs, Tbl, Name, C>
				: never
			: Ts
		: never
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

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

export type CheckNullLiterals<
	Es extends readonly Expr[],
	Cs extends readonly string[],
	Tbl extends Table,
	Name extends string,
> = Es extends readonly [infer E, ...infer ER extends readonly Expr[]]
	? Cs extends readonly [
			infer Col extends string,
			...infer CR extends readonly string[],
		]
		? E extends { readonly t: "null" }
			? NotNullCol<Tbl, Col> extends true
				? SqlError<
						`null value in column "${Col}" of relation "${Name}" violates not-null constraint`,
						null
					>
				: CheckNullLiterals<ER, CR, Tbl, Name>
			: E extends { readonly t: "default" }
				? RequiredCol<Tbl, Col> extends true
					? SqlError<
							`null value in column "${Col}" of relation "${Name}" violates not-null constraint`,
							null
						>
					: CheckNullLiterals<ER, CR, Tbl, Name>
				: CheckNullLiterals<ER, CR, Tbl, Name>
		: true
	: true;

type NotNullCol<Tbl extends Table, Col extends string> = Col extends keyof Tbl
	? Tbl[Col]["nullable"] extends false
		? true
		: false
	: false;
/** NOT NULL without a default: `DEFAULT` stores NULL there, which Postgres rejects. */
type RequiredCol<Tbl extends Table, Col extends string> = Col extends keyof Tbl
	? Tbl[Col] extends { readonly nullable: false; readonly hasDefault: false }
		? true
		: false
	: false; // type-mutate: equivalent bool-flip – the callers pass existing columns (checked first)

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
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

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
			DmlCtx<DB, [Item, ExcludedItem<Tbl>], Outer, Ctes> // type-mutate: equivalent tuple-swap – a name in both is ambiguous either way (FindAlias)
		> extends infer R
		? R extends AnyErr
			? R
			: CheckOptExpr<Where, DmlCtx<DB, [Item, ExcludedItem<Tbl>], Outer, Ctes>> // type-mutate: equivalent tuple-swap – a name in both is ambiguous either way (FindAlias)
		: never
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

// ───────────────────────────── SET ─────────────────────────────

export type CheckSet<
	Set extends readonly SetItem[],
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> = Set extends readonly [
	infer S extends SetItem,
	...infer R extends readonly SetItem[],
]
	? CheckSetItem<S, Tbl, Name, C> extends infer X
		? X extends AnyErr
			? X
			: CheckSet<R, Tbl, Name, C>
		: never
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

type CheckSetItem<
	S extends SetItem,
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> = S extends {
	readonly t: "set";
	readonly col: infer Col extends string;
	readonly e: infer E extends Expr;
}
	? Col extends keyof Tbl
		? E extends { readonly t: "null" }
			? NotNullCol<Tbl, Col> extends true
				? SqlError<
						`null value in column "${Col}" of relation "${Name}" violates not-null constraint`,
						null
					>
				: true // type-mutate: equivalent bool-flip – CheckSet only looks for an error
			: E extends { readonly t: "default" }
				? RequiredCol<Tbl, Col> extends true
					? SqlError<
							`null value in column "${Col}" of relation "${Name}" violates not-null constraint`,
							null
						>
					: true // type-mutate: equivalent bool-flip – CheckSet only looks for an error
				: CheckExpr<E, C>
		: SqlError<`column "${Col}" of relation "${Name}" does not exist`, null>
	: S extends {
				readonly t: "setind";
				readonly col: infer Col extends string;
				readonly target: infer Ind;
				readonly e: infer E extends Expr;
			}
		? Col extends keyof Tbl
			? AssignInfo<Tbl, Col, Ind, C> extends infer X
				? X extends AnyErr
					? X
					: CheckExpr<E, C>
				: never
			: SqlError<`column "${Col}" of relation "${Name}" does not exist`, null>
		: S extends {
					readonly t: "setmulti";
					readonly cols: infer Cols extends readonly string[];
					readonly ind: infer Ind extends readonly TargetInd[] | null;
					readonly e: infer E extends Expr;
				}
			? CheckColsExist<Cols, Tbl, Name> extends infer X
				? X extends AnyErr
					? X
					: CheckInds<Cols, Ind, Tbl, C> extends infer Y
						? Y extends AnyErr
							? Y
							: CheckMultiSource<E, Cols, C>
						: never
				: never
			: true; // type-mutate: equivalent bool-flip – a SET item is one of the three kinds above

/** `(a, b) = (e1, e2)` / `= ROW(…)` / `= (SELECT ...)`: width must match, expressions typed; any other source is an error. */
export type CheckMultiSource<
	E extends Expr,
	Cols_ extends readonly string[],
	C extends Ctx,
> = E extends { readonly t: "sub"; readonly q: infer Q extends SelectStmt }
	? ProjectSelect<Q, C["db"], C["scope"], C["ctes"]> extends infer R
		? R extends Cols
			? HasStar<R> extends true
				? true // type-mutate: equivalent bool-flip – the callers only look for an error
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

export type CheckExpr<E extends Expr, C extends Ctx> =
	TypeOf<E, C> extends infer T ? (T extends ColInfo ? true : T) : never;
export type CheckOptExpr<E extends Expr | null, C extends Ctx> = E extends Expr
	? CheckExpr<E, C>
	: true; // type-mutate: equivalent bool-flip – the callers only look for an error

// ───────────────────────────── UPDATE / DELETE ─────────────────────────────

type ProjectUpdate<
	S extends UpdateStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ResolveTarget<DB, S["table"], S["alias"], "update"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item extends ScopeItem>
			? BindFrom<S["from"], DB, Outer, Ctes> extends infer L
				? L extends ScopeLevel
					? CheckSet<
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
		? Tg extends Target_<infer Tbl extends Table, infer Item>
			? BindFrom<S["using"], DB, Outer, Ctes> extends infer L
				? L extends ScopeLevel
					? CheckOptExpr<
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
							: S extends { readonly t: "merge" }
								? ParamsOfMerge<Extract<S, MergeStmt>, DB, C2, M1>
								: M1 // type-mutate: equivalent never-false – a data statement is one of the four kinds above
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
				: Q extends DmlStmt
					? ParamsOfDml<Q, DB, Ctes, M>
					: M
		>
	: M;

type ParamsOfInsert<S extends InsertStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "insert into"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item extends ScopeItem>
			? InsertTargetCols<
					S["columns"],
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
						false, // type-mutate: equivalent bool-flip – parameters in RETURNING are typed nullable either way
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
								Ctes,
								M
							>
						>
					>
				: never
			: M // type-mutate: equivalent never-false – only reached for statements ProjectDml accepted, whose target resolves
		: never;

type ParamsOfInsertSource<
	Source extends InsertSource,
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	DB,
	Ctes extends CteMap,
	M,
> = Ind extends null
	? Source extends {
			readonly t: "values";
			readonly rows: infer Rows extends readonly (readonly Expr[])[];
		}
		? ParamsOfRows<Rows, Cs, Tbl, MkCtx<DB, [], Ctes, false>, M>
		: Source extends {
					readonly t: "select";
					readonly q: infer Q extends SelectStmt;
				}
			? ParamsOfSelectTargets<Q, Cs, Tbl, ParamsOfSelect<Q, DB, [], Ctes, M>>
			: M
	: ParamsOfIndSource<
			Source,
			TargetInfos<Cs, Ind, Tbl, MkCtx<DB, [], Ctes, false>>,
			DB,
			Ctes,
			ParamsOfInds<Cs, Ind, Tbl, MkCtx<DB, [], Ctes, false>, M>
		>;

/** INSERT source when a target has indirection: `$n` takes the type of what its target stores. */
type ParamsOfIndSource<
	Source extends InsertSource,
	Infos extends readonly (ColInfo | null)[],
	DB,
	Ctes extends CteMap,
	M,
> = Source extends {
	readonly t: "values";
	readonly rows: infer Rows extends readonly (readonly Expr[])[];
}
	? ParamsOfInfoRows<Rows, Infos, MkCtx<DB, [], Ctes, false>, M> // type-mutate: equivalent bool-flip – aggregates are not allowed in VALUES, so no valid statement depends on it
	: Source extends {
				readonly t: "select";
				readonly q: infer Q extends SelectStmt;
			}
		? Q["body"] extends {
				readonly t: "simple";
				readonly targets: infer Ts extends readonly Target[];
			}
			? ParamsOfInfoTargets<Ts, Infos, ParamsOfSelect<Q, DB, [], Ctes, M>>
			: ParamsOfSelect<Q, DB, [], Ctes, M>
		: M;
type ParamsOfInfoRows<
	Rows extends readonly (readonly Expr[])[],
	Infos extends readonly (ColInfo | null)[],
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
	Infos extends readonly (ColInfo | null)[],
	C extends Ctx,
	M,
> = Es extends readonly [
	infer E extends Expr,
	...infer ER extends readonly Expr[],
]
	? Infos extends readonly [
			infer CI,
			...infer IR extends readonly (ColInfo | null)[],
		]
		? ParamsOfRowInfos<ER, IR, C, ParamsOfOpt<E, C, M, CI>>
		: ParamsOfRowInfos<ER, [], C, ParamsOfExpr<E, C, M>>
	: M;
type ParamsOfInfoTargets<
	Ts extends readonly Target[],
	Infos extends readonly (ColInfo | null)[],
	M,
> = Ts extends readonly [
	infer T extends Target,
	...infer TR extends readonly Target[],
]
	? Infos extends readonly [
			infer CI,
			...infer IR extends readonly (ColInfo | null)[],
		]
		? ParamsOfInfoTargets<
				TR,
				IR,
				T["e"] extends {
					readonly t: "param";
					readonly n: infer N extends number;
				}
					? CI extends ColInfo
						? AddParam<M, N, CI>
						: M
					: M
			>
		: M
	: M;

type ParamsOfRows<
	Rows extends readonly (readonly Expr[])[],
	Cs extends readonly string[],
	Tbl extends Table,
	C extends Ctx,
	M,
> = Rows extends readonly [
	infer R extends readonly Expr[],
	...infer Rest extends readonly (readonly Expr[])[],
]
	? ParamsOfRows<Rest, Cs, Tbl, C, ParamsOfRowCols<R, Cs, Tbl, C, M>>
	: M;

/** Zip expressions with target columns: a bare `$n` takes the column's type, anything else recurses. */
export type ParamsOfRowCols<
	Es extends readonly Expr[],
	Cs extends readonly string[],
	Tbl extends Table,
	C extends Ctx,
	M,
> = Es extends readonly [
	infer E extends Expr,
	...infer ER extends readonly Expr[],
]
	? Cs extends readonly [
			infer Col extends string,
			...infer CR extends readonly string[],
		]
		? ParamsOfRowCols<ER, CR, Tbl, C, ParamsOfOpt<E, C, M, ColInfoOf<Tbl, Col>>>
		: ParamsOfRowCols<ER, [], Tbl, C, ParamsOfExpr<E, C, M>>
	: M;

/** `INSERT INTO t (a, b) SELECT $1, $2`: bare parameter targets take the target column types. */
type ParamsOfSelectTargets<
	Q extends SelectStmt,
	Cs extends readonly string[],
	Tbl extends Table,
	M,
> = Q["body"] extends {
	readonly t: "simple";
	readonly targets: infer Ts extends readonly Target[];
}
	? ParamsOfTargetCols<Ts, Cs, Tbl, M>
	: M;
type ParamsOfTargetCols<
	Ts extends readonly Target[],
	Cs extends readonly string[],
	Tbl extends Table,
	M,
> = Ts extends readonly [
	infer T extends Target,
	...infer TR extends readonly Target[],
]
	? Cs extends readonly [
			infer Col extends string,
			...infer CR extends readonly string[],
		]
		? ParamsOfTargetCols<
				TR,
				CR,
				Tbl,
				T["e"] extends {
					readonly t: "param";
					readonly n: infer N extends number;
				}
					? ColInfoOf<Tbl, Col> extends infer CI
						? CI extends ColInfo // type-mutate: equivalent cond-true – the columns exist (a statement already validated)
							? AddParam<M, N, CI>
							: M
						: never
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
			ParamsOfSet<Set, Tbl, DmlCtx<DB, [Item, ExcludedItem<Tbl>], [], Ctes>, M>, // type-mutate: equivalent tuple-swap – a name in both is ambiguous either way (FindAlias)
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
							? Ind extends null
								? ParamsOfRowCols<Items, Cols_, Tbl, C, M>
								: ParamsOfRowInfos<
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
			: M // type-mutate: equivalent never-false – OLD / NEW were validated with the statement
		: never
	: M;

type ParamsOfUpdate<S extends UpdateStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "update"> extends infer Tg
		? Tg extends Target_<infer Tbl extends Table, infer Item>
			? BindFrom<S["from"], DB, [], Ctes> extends infer L
				? L extends ScopeLevel
					? ParamsOfReturning<
							S["returning"],
							S["retOpts"],
							[Item, ...L],
							TableCols<Tbl>,
							false, // type-mutate: equivalent bool-flip – parameters in RETURNING are typed nullable either way
							false, // type-mutate: equivalent bool-flip – parameters in RETURNING are typed nullable either way
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
					: M // type-mutate: equivalent never-false – only reached for statements ProjectDml accepted
				: never
			: M // type-mutate: equivalent never-false – only reached for statements ProjectDml accepted
		: never;

type ParamsOfDelete<S extends DeleteStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "delete from"> extends infer Tg
		? Tg extends Target_<infer Tbl extends Table, infer Item>
			? BindFrom<S["using"], DB, [], Ctes> extends infer L
				? L extends ScopeLevel
					? ParamsOfReturning<
							S["returning"],
							S["retOpts"],
							[Item, ...L],
							TableCols<Tbl>,
							false, // type-mutate: equivalent bool-flip – parameters in RETURNING are typed nullable either way
							true, // type-mutate: equivalent bool-flip – parameters in RETURNING are typed nullable either way
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
					: M // type-mutate: equivalent never-false – only reached for statements ProjectDml accepted
				: never
			: M // type-mutate: equivalent never-false – only reached for statements ProjectDml accepted
		: never;
