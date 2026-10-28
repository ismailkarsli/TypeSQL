import type {
	ColDef,
	Expr,
	FromItem,
	FromTable,
	JoinKind,
	SelectStmt,
	TableRef,
} from "../ast.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Nx } from "../parser/util.js";
import type { ColumnName } from "../project/naming.js";
import type { ProjectSelect } from "../project/select.js";
import type { SrfType } from "../typer/catalog.js";
import type { CommonType } from "../typer/operators.js";
import type { BindJsonTable } from "../typer/sqljson.js";
import type { TypeList, TypeOf } from "../typer/typeof.js";
import type { XmlTableCols } from "../typer/xml.js";
import type {
	ColInfo,
	ColMap,
	Cols,
	ColsToMap,
	CteMap,
	Ctx,
	Info,
	MkCtx,
	NullableMap,
	Scope,
	ScopeItem,
	ScopeLevel,
} from "../types.js";
import type { CheckCondition, TypeDisplay } from "./clauses.js";
import type { NarrowKeys, NarrowLevel, UsingKeys } from "./narrow.js";
import type { ResolveTable } from "./resolve.js";

/**
 * Build the scope level for a FROM clause. Items are bound left to right; LATERAL items
 * (and function calls, which are implicitly lateral) can see the items bound so far.
 *
 * `BindFrom<Items, DB, Outer, Ctes>` → `ScopeLevel` or `SqlError`.
 */
export type BindFrom<
	Items extends readonly FromItem[],
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Acc extends ScopeLevel = [],
	I extends number = 0,
> = Items[I] extends undefined
	? Acc
	: BindFromItem<Items[I], DB, Outer, Ctes, Acc> extends infer L
		? L extends ScopeLevel
			? BindFrom<Items, DB, Outer, Ctes, [...Acc, ...L], Nx<I>>
			: L
		: never;

/** Bind one FROM item into the scope items it contributes. `Sofar`: items already bound in this level. */
export type BindFromItem<
	F extends FromItem,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = F extends { readonly t: "table" }
	? BindTable<F["ref"], F["alias"], F["colAliases"], DB, Ctes, Sofar>
	: F extends { readonly t: "sub" }
		? BindSub<
				F["q"],
				F["alias"],
				F["colAliases"],
				F["lateral"],
				DB,
				Outer,
				Ctes,
				Sofar
			>
		: F extends { readonly t: "func" }
			? BindFunc<
					F["call"],
					F["alias"],
					F["colAliases"],
					F["colDefs"],
					F["withOrdinality"],
					DB,
					Outer,
					Ctes,
					Sofar
				>
			: F extends { readonly t: "join" }
				? BindJoin<
						F["kind"],
						F["l"],
						F["r"],
						F["on"],
						F["using"],
						F["natural"],
						DB,
						Outer,
						Ctes,
						Sofar
					>
				: F extends { readonly t: "xmltable" }
					? BindXmlTable<F, F["alias"], F["colAliases"], DB, Outer, Ctes, Sofar>
					: F extends { readonly t: "jsontable" }
						? BindJsonTable<
								F["jt"],
								F["alias"],
								F["colAliases"],
								DB,
								Outer,
								Ctes,
								Sofar
							>
						: F extends { readonly t: "sample" }
							? BindSample<
									F["table"],
									F["method"],
									F["args"],
									F["repeatable"],
									DB,
									Outer,
									Ctes,
									Sofar
								>
							: F extends { readonly t: "rowsfrom" }
								? BindRowsFrom<
										F["funcs"],
										F["alias"],
										F["colAliases"],
										F["colDefs"],
										F["withOrdinality"],
										DB,
										Outer,
										Ctes,
										Sofar
									>
								: SqlError<"unsupported FROM item", null>;

/**
 * `XMLTABLE(...) [alias [(cols)]]`: always lateral, named `xmltable` without an alias; a bare
 * alias does not rename its columns, a column alias list does (positionally).
 */
type BindXmlTable<
	F,
	Alias extends string | null,
	CA extends readonly string[] | null,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = F extends { readonly defaultNs: true }
	? SqlError<"DEFAULT namespace is not supported", null>
	: CheckAlias<Alias extends string ? Alias : "xmltable", Sofar> extends infer A
		? A extends string
			? XmlTableCols<
					F,
					MkCtx<DB, [Sofar, ...Outer], Ctes, false>
				> extends infer Base
				? Base extends Cols
					? (
							CA extends readonly string[]
								? RenameCols<Base, CA, [], "XMLTABLE function">
								: Base
						) extends infer C2
						? C2 extends Cols
							? [
									{
										readonly alias: A;
										readonly cols: ColsToMap<C2>;
										readonly skip: [];
									},
								]
							: C2
						: never
					: Base
				: never
			: A
		: never;

/** `table name "u" specified more than once` when the alias is already used in this level. */
export type CheckAlias<
	A extends string,
	Sofar extends ScopeLevel,
> = A extends Sofar[number]["alias"]
	? SqlError<`table name "${A}" specified more than once`, null>
	: A;

type BindTable<
	Ref extends TableRef,
	Alias extends string | null,
	CA extends readonly string[] | null,
	DB,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = CA extends readonly string[]
	? SqlError<
			"column alias lists on table references are not supported; use a subquery to rename columns",
			null
		>
	: CheckAlias<
				Alias extends string ? Alias : Ref["name"],
				Sofar
			> extends infer A
		? A extends string
			? ResolveTable<DB, Ref, Ctes> extends infer M
				? M extends ColMap
					? [{ readonly alias: A; readonly cols: M; readonly skip: [] }]
					: M
				: never
			: A
		: never;

// ─── TABLESAMPLE ───

/**
 * Sampling methods and the type their argument is coerced to: `system` and `bernoulli` are
 * built in, `system_rows` and `system_time` come with the contrib modules of the same name.
 */
type SampleMethods = {
	system: "float4";
	bernoulli: "float4";
	system_rows: "int8";
	system_time: "float8";
};

/**
 * `t TABLESAMPLE method (args) [REPEATABLE (seed)]`: the arguments see the outer query
 * levels only (not the other items of this FROM clause). A CTE cannot be sampled; a view
 * cannot either, but schemas do not tell views from materialized views, so that is not checked.
 */
type BindSample<
	Tbl extends FromTable,
	Method extends string,
	Args extends readonly Expr[],
	Rep extends Expr | null,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = Tbl["ref"] extends { readonly schema: null; readonly name: keyof Ctes }
	? SqlError<
			"TABLESAMPLE clause can only be applied to tables and materialized views",
			null
		>
	: Method extends keyof SampleMethods
		? Args["length"] extends 1
			? LateralHint<
					SampleArgs<
						[...Args, ...(Rep extends Expr ? [Rep] : [])],
						[SampleMethods[Method], ...(Rep extends Expr ? ["float8"] : [])],
						MkCtx<DB, Outer, Ctes, false>,
						0
					>,
					Sofar,
					Tbl["alias"] extends string ? Tbl["alias"] : Tbl["ref"]["name"]
				> extends infer E
				? E extends AnyErr
					? E
					: BindTable<
							Tbl["ref"],
							Tbl["alias"],
							Tbl["colAliases"],
							DB,
							Ctes,
							Sofar
						>
				: never
			: SqlError<
					`tablesample method ${Method} requires 1 argument, not ${Args["length"]}`,
					null
				>
		: SqlError<`tablesample method ${Method} does not exist`, null>;
/** Each argument must be coercible to its type (numbers are; NULL is rejected when the scan starts). */
type SampleArgs<
	Args extends readonly Expr[],
	Ts extends readonly string[],
	C extends Ctx,
	I extends number,
> = Args[I] extends Expr
	? Args[I] extends { readonly t: "null" }
		? SqlError<
				`TABLESAMPLE ${I extends 0 ? "" : "REPEATABLE "}parameter cannot be null`,
				null
			>
		: TypeOf<Args[I], C> extends infer A
			? A extends ColInfo
				? A["type"] extends
						| "int2"
						| "int4"
						| "int8"
						| "numeric"
						| "float4"
						| "float8"
						| "unknown"
					? SampleArgs<Args, Ts, C, Nx<I>>
					: Args[I] extends { readonly t: "str" }
						? SampleArgs<Args, Ts, C, Nx<I>>
						: SqlError<
								// an expression of the NULL type (`CASE … THEN NULL END`) resolves to text
								`argument of ${I extends 0 ? "TABLESAMPLE" : "REPEATABLE"} must be type ${TypeDisplay<Ts[I]>}, not type ${TypeDisplay<A["type"] extends "null" ? "text" : A["type"]>}`,
								null
							>
				: A
			: never
	: true;

type BindSub<
	Q extends SelectStmt,
	Alias extends string | null,
	ColAliases extends readonly string[] | null,
	Lateral extends boolean,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = (Alias extends string ? CheckAlias<Alias, Sofar> : null) extends infer A
	? A extends AnyErr
		? A
		: ProjectSelect<
					Q,
					DB,
					Lateral extends true ? [Sofar, ...Outer] : Outer,
					Ctes
				> extends infer C
			? C extends Cols
				? (
						ColAliases extends readonly string[]
							? RenameCols<
									C,
									ColAliases,
									[],
									`table "${Alias extends string ? Alias : "unnamed_subquery"}"`
								>
							: C
					) extends infer C2
					? C2 extends Cols
						? [
								{
									readonly alias: A;
									readonly cols: ColsToMap<C2>;
									readonly skip: [];
								},
							]
						: C2
					: never
				: Lateral extends true
					? C
					: LateralHint<C, Sofar, "">
			: never
	: never;

/**
 * A reference to a FROM item of the same level that is not visible from here: Postgres
 * reports "invalid reference" (the subquery is not LATERAL, or the join type does not
 * allow a LATERAL reference) rather than "missing FROM-clause entry".
 */
type LateralHint<E, Sofar extends ScopeLevel, Extra extends string> =
	E extends SqlError<
		`missing FROM-clause entry for table "${infer X}"`,
		infer At
	>
		? X extends Sofar[number]["alias"] | Extra
			? SqlError<`invalid reference to FROM-clause entry for table "${X}"`, At>
			: E
		: E;

/**
 * Positionally rename plain entries (`AS t(a, b)`). More names than columns is an error
 * (`<who> has N columns available but M columns specified`); renaming across a `*` entry
 * is not supported.
 */
export type RenameCols<
	C extends Cols,
	Names extends readonly string[],
	Acc extends Cols,
	Who extends string = 'table "t"',
> = Names extends readonly [
	infer N extends string,
	...infer NR extends readonly string[],
]
	? C extends readonly [infer H, ...infer R extends Cols]
		? H extends { readonly t: infer T extends ColInfo }
			? RenameCols<R, NR, [...Acc, { readonly n: N; readonly t: T }], Who>
			: SqlError<
					"a column alias list cannot rename the columns of a * projection",
					null
				>
		: SqlError<
				`${Who} has ${Acc["length"]} columns available but ${[...Acc, ...Names]["length"] & number} columns specified`,
				null
			>
	: [...Acc, ...C];

// ─── functions in FROM ───

/** Multi-column set-returning functions (ordered). */
type RecordSrf = {
	json_each: [
		{ readonly n: "key"; readonly t: Info<"text"> },
		{ readonly n: "value"; readonly t: Info<"json"> },
	];
	jsonb_each: [
		{ readonly n: "key"; readonly t: Info<"text"> },
		{ readonly n: "value"; readonly t: Info<"jsonb"> },
	];
	json_each_text: [
		{ readonly n: "key"; readonly t: Info<"text"> },
		{ readonly n: "value"; readonly t: Info<"text", true> },
	];
	jsonb_each_text: [
		{ readonly n: "key"; readonly t: Info<"text"> },
		{ readonly n: "value"; readonly t: Info<"text", true> },
	];
};
/** Functions returning `record`: a column definition list is required. */
type RecordFunc =
	| "json_to_record"
	| "jsonb_to_record"
	| "json_to_recordset"
	| "jsonb_to_recordset";
/** Set-returning functions whose single output column is named `value` (declared with an OUT parameter). */
type ValueNamed =
	| "json_array_elements"
	| "jsonb_array_elements"
	| "json_array_elements_text"
	| "jsonb_array_elements_text";

type BindFunc<
	Call extends Expr,
	Alias extends string | null,
	CA extends readonly string[] | null,
	CD,
	Ord extends boolean,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = Call extends { readonly t: "call" }
	? CheckAlias<
			Alias extends string ? Alias : Call["name"],
			Sofar
		> extends infer A
		? A extends string
			? FuncBaseCols<
					Call["name"],
					Call["args"],
					CD,
					Call,
					MkCtx<DB, [Sofar, ...Outer], Ctes, false>
				> extends infer Base
				? Base extends Cols
					? FuncRename<
							Ord extends true
								? [
										...Base,
										{ readonly n: "ordinality"; readonly t: Info<"int8"> },
									]
								: Base,
							Alias,
							CA,
							CD extends null
								? Base extends readonly [unknown]
									? false
									: true
								: true,
							A
						> extends infer C2
						? C2 extends Cols
							? [
									{
										readonly alias: A;
										readonly cols: ColsToMap<C2>;
										readonly skip: [];
									},
								]
							: C2
						: never
					: Base
				: never
			: A
		: never
	: Call extends { readonly t: "cast" }
		? BindCastFunc<
				Call,
				Alias,
				CA,
				Ord,
				MkCtx<DB, [Sofar, ...Outer], Ctes, false>,
				Sofar
			>
		: SqlError<"unsupported function call in FROM", null>;

/** `FROM CAST(e AS T) [AS] a`: one row, one column named like the expression (`T`) or the alias. */
type BindCastFunc<
	E extends Expr,
	Alias extends string | null,
	CA extends readonly string[] | null,
	Ord extends boolean,
	C extends MkCtx<unknown, Scope, CteMap, false>,
	Sofar extends ScopeLevel,
> =
	ColumnName<E, null, C> extends infer N extends string
		? CheckAlias<Alias extends string ? Alias : N, Sofar> extends infer A
			? A extends string
				? TypeOf<E, C> extends infer T
					? T extends ColInfo
						? FuncRename<
								Ord extends true
									? [
											{ readonly n: N; readonly t: T },
											{ readonly n: "ordinality"; readonly t: Info<"int8"> },
										]
									: [{ readonly n: N; readonly t: T }],
								Alias,
								CA,
								false,
								A
							> extends infer C2
							? C2 extends Cols
								? [
										{
											readonly alias: A;
											readonly cols: ColsToMap<C2>;
											readonly skip: [];
										},
									]
								: C2
							: never
						: T
					: never
				: A
			: never
		: never;

/**
 * Natural (pre-alias) columns of a function in FROM, as ordered entries. A set-returning
 * function produces no row for NULL input, so its column is nullable only when the
 * function itself can return NULL elements (`jsonb_array_elements_text`, multi-array
 * `unnest`); a plain function in FROM is one row holding the function's value.
 */
type FuncBaseCols<
	Name extends string,
	Args extends readonly Expr[],
	CD,
	Call extends Expr,
	C extends MkCtx<unknown, Scope, CteMap, false>,
> = CD extends readonly ColDef[]
	? TypeList<Args, C, []> extends infer As
		? As extends readonly ColInfo[]
			? ColDefsCols<CD, []>
			: As
		: never
	: TypeList<Args, C, []> extends infer As
		? As extends readonly ColInfo[]
			? Name extends keyof RecordSrf
				? RecordSrf[Name]
				: Name extends RecordFunc
					? SqlError<
							'a column definition list is required for functions returning "record"',
							null
						>
					: Name extends "unnest"
						? As extends readonly [ColInfo, ColInfo, ...ColInfo[]]
							? MultiUnnest<As, []>
							: SrfOrScalar<Name, As, Call, C>
						: SrfOrScalar<Name, As, Call, C>
			: As
		: never;

type NonNullInfos<As extends readonly ColInfo[]> = {
	readonly [K in keyof As]: Info<As[K]["type"]>;
};

type SrfOrScalar<
	Name extends string,
	As extends readonly ColInfo[],
	Call extends Expr,
	C extends MkCtx<unknown, Scope, CteMap, false>,
> =
	SrfType<Name, NonNullInfos<As>, C["db"]> extends infer S
		? S extends ColInfo
			? [
					{
						readonly n: Name extends ValueNamed ? "value" : Name;
						readonly t: S;
					},
				]
			: TypeOf<Call, C> extends infer T
				? T extends ColInfo
					? [{ readonly n: Name; readonly t: T }]
					: T
				: never
		: never;

/** `unnest(a, b, ...)`: one column per array (all named `unnest`); shorter arrays are padded with NULLs. */
type MultiUnnest<
	As extends readonly ColInfo[],
	Acc extends Cols,
> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? MultiUnnest<
			R,
			[
				...Acc,
				{
					readonly n: "unnest";
					readonly t: Info<
						A["type"] extends `${infer E}[]` ? E : "unknown",
						true
					>;
				},
			]
		>
	: Acc;

type ColDefsCols<
	CD extends readonly ColDef[],
	Acc extends Cols,
> = CD extends readonly [
	infer D extends ColDef,
	...infer R extends readonly ColDef[],
]
	? ColDefsCols<
			R,
			[...Acc, { readonly n: D["name"]; readonly t: Info<D["type"], true> }]
		>
	: Acc;

// ─── ROWS FROM ───

type RowsFromFunc = {
	readonly call: Expr;
	readonly colDefs: readonly ColDef[] | null;
};

/**
 * `ROWS FROM (f(...), g(...)) [WITH ORDINALITY] [AS t(cols)]`: the columns of each function
 * in order (a multi-argument `unnest` contributes one per array), then `ordinality` (int8).
 * The functions are zipped and shorter results padded with NULLs, so with more than one
 * function every column is nullable. One function behaves like the function alone.
 */
type BindRowsFrom<
	Fs extends readonly RowsFromFunc[],
	Alias extends string | null,
	CA extends readonly string[] | null,
	CD extends readonly ColDef[] | null,
	Ord extends boolean,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> = Fs extends readonly [infer F extends RowsFromFunc]
	? BindFunc<
			F["call"],
			Alias,
			CA,
			CD extends null ? F["colDefs"] : CD,
			Ord,
			DB,
			Outer,
			Ctes,
			Sofar
		>
	: CD extends readonly ColDef[]
		? SqlError<
				"ROWS FROM() with multiple functions cannot have a column definition list",
				null
			>
		: CheckAlias<
					Alias extends string
						? Alias
						: Fs[0]["call"] extends { readonly name: infer N extends string }
							? N
							: "rows",
					Sofar
				> extends infer A
			? A extends string
				? RowsFromCols<
						Fs,
						MkCtx<DB, [Sofar, ...Outer], Ctes, false>,
						[]
					> extends infer Base
					? Base extends Cols
						? (
								Ord extends true
									? [
											...Base,
											{ readonly n: "ordinality"; readonly t: Info<"int8"> },
										]
									: Base
							) extends infer C1 extends Cols
							? (
									CA extends readonly string[]
										? RenameCols<C1, CA, [], `table "${A}"`>
										: C1
								) extends infer C2
								? C2 extends Cols
									? [
											{
												readonly alias: A;
												readonly cols: ColsToMap<C2>;
												readonly skip: [];
											},
										]
									: C2
								: never
							: never
						: Base
					: never
				: A
			: never;
type RowsFromCols<
	Fs extends readonly RowsFromFunc[],
	C extends MkCtx<unknown, Scope, CteMap, false>,
	Acc extends Cols,
> = Fs extends readonly [
	infer F extends RowsFromFunc,
	...infer R extends readonly RowsFromFunc[],
]
	? F["call"] extends { readonly t: "call" }
		? FuncBaseCols<
				F["call"]["name"],
				F["call"]["args"],
				F["colDefs"],
				F["call"],
				C
			> extends infer B
			? B extends Cols
				? RowsFromCols<R, C, [...Acc, ...NullableCols<B>]>
				: B
			: never
		: SqlError<"unsupported function call in FROM", null>
	: Acc;
type NullableCols<B extends Cols> = {
	readonly [K in keyof B]: B[K] extends {
		readonly n: infer N extends string;
		readonly t: infer T extends ColInfo;
	}
		? { readonly n: N; readonly t: Info<T["type"], true> }
		: B[K];
};

/**
 * Column naming of a function table: `AS t(a, b)` renames positionally (including the
 * ordinality column); a bare alias renames the single column of a scalar/SRF function
 * but not the columns of a record-returning one.
 */
type FuncRename<
	Base extends Cols,
	Alias extends string | null,
	CA extends readonly string[] | null,
	Record extends boolean,
	A extends string,
> = CA extends readonly string[]
	? RenameCols<Base, CA, [], `table "${A}"`>
	: Alias extends string
		? Record extends true
			? Base
			: RenameFirst<Base, Alias>
		: Base;
type RenameFirst<
	Base extends Cols,
	Alias extends string,
> = Base extends readonly [{ readonly t: infer T }, ...infer R]
	? [{ readonly n: Alias; readonly t: T }, ...R]
	: Base;

// ─── joins ───

/**
 * `l <kind> JOIN r ON ... | USING (...) | NATURAL`. The right side of a RIGHT/FULL join
 * cannot reference the left side (no LATERAL). The ON condition sees the two sides only
 * (not the other items of the FROM clause). An INNER join's ON condition narrows the
 * columns it proves non-null (see narrow.ts); USING / NATURAL columns of an inner join are
 * non-null on both sides.
 */
type BindJoin<
	K extends JoinKind,
	L extends FromItem,
	R extends FromItem,
	On extends Expr | null,
	Using extends readonly string[] | null,
	Natural extends boolean,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Sofar extends ScopeLevel,
> =
	BindFromItem<L, DB, Outer, Ctes, Sofar> extends infer LL
		? LL extends ScopeLevel
			? (
					K extends "right" | "full"
						? LateralHint<BindFromItem<R, DB, Outer, Ctes, Sofar>, LL, "">
						: BindFromItem<R, DB, Outer, Ctes, [...Sofar, ...LL]>
				) extends infer RL
				? RL extends ScopeLevel
					? LateralHint<
							CheckCondition<
								"JOIN/ON",
								On,
								MkCtx<DB, [[...LL, ...RL], ...Outer], Ctes, false>
							>,
							Sofar,
							""
						> extends infer Chk
						? Chk extends AnyErr
							? Chk
							: Natural extends true
								? MergeUsing<K, LL, RL, CommonNames<LL, RL>>
								: Using extends readonly string[]
									? CheckUsing<Using, LL, RL> extends infer U
										? U extends AnyErr
											? U
											: MergeUsing<K, LL, RL, Using[number]>
										: never
									: K extends "inner"
										? NarrowKeys<On> extends infer Keys
											? [...NarrowLevel<LL, Keys>, ...NarrowLevel<RL, Keys>]
											: never
										: [
												...ApplyNullability<K, "l", LL>,
												...ApplyNullability<K, "r", RL>,
											]
						: never
					: RL
				: never
			: LL
		: never;

type ApplyNullability<
	K extends JoinKind,
	Side extends "l" | "r",
	L extends ScopeLevel,
> = K extends "full"
	? NullableLevel<L>
	: K extends "left"
		? Side extends "r"
			? NullableLevel<L>
			: L
		: K extends "right"
			? Side extends "l"
				? NullableLevel<L>
				: L
			: L;
type NullableLevel<L extends ScopeLevel> = {
	readonly [I in keyof L]: L[I] extends ScopeItem
		? {
				readonly alias: L[I]["alias"];
				readonly cols: NullableMap<L[I]["cols"]>;
				readonly skip: L[I]["skip"];
			}
		: L[I];
};

/** Column names present on both sides (NATURAL JOIN). */
type CommonNames<L extends ScopeLevel, R extends ScopeLevel> = Extract<
	LevelKeys<L>,
	LevelKeys<R>
>;
type LevelKeys<L extends ScopeLevel> = L[number] extends infer I
	? I extends ScopeItem
		? Exclude<keyof I["cols"], I["skip"][number]> & string
		: never
	: never;

/**
 * Combine the two sides of a USING / NATURAL join: the merged columns become a synthetic
 * first item (alias null) and are hidden (`skip`) on both sides for unqualified lookup
 * and `*` (Postgres lists the merged columns first, then the other columns of each side).
 * `t.c` still reaches the original columns.
 */
type MergeUsing<
	K extends JoinKind,
	L extends ScopeLevel,
	R extends ScopeLevel,
	U extends string,
> = (
	K extends "inner"
		? NarrowLevel<L, UsingKeys<U>>
		: L
) extends infer L1 extends ScopeLevel
	? (
			K extends "inner"
				? NarrowLevel<R, UsingKeys<U>>
				: R
		) extends infer R1 extends ScopeLevel
		? HideCols<ApplyNullability<K, "l", L1>, U> extends infer HL extends
				ScopeLevel
			? HideCols<ApplyNullability<K, "r", R1>, U> extends infer HR extends
					ScopeLevel
				? [
						{
							readonly alias: null;
							readonly cols: UsingCols<U, K, L, R>;
							readonly skip: [];
						},
						...HL,
						...HR,
					]
				: never
			: never
		: never
	: never;

type CheckUsing<
	Using extends readonly string[],
	L extends ScopeLevel,
	R extends ScopeLevel,
> = Using extends readonly [
	infer U extends string,
	...infer Rest extends readonly string[],
]
	? FindInLevel<L, U> extends ColInfo
		? FindInLevel<R, U> extends ColInfo
			? CheckUsing<Rest, L, R>
			: SqlError<
					`column "${U}" specified in USING clause does not exist in right table`,
					null
				>
		: SqlError<
				`column "${U}" specified in USING clause does not exist in left table`,
				null
			>
	: true;

type FindInLevel<
	L extends ScopeLevel,
	Name extends string,
> = L extends readonly [
	infer I extends ScopeItem,
	...infer R extends ScopeLevel,
]
	? Name extends I["skip"][number]
		? FindInLevel<R, Name>
		: Name extends keyof I["cols"]
			? I["cols"][Name]
			: FindInLevel<R, Name>
	: null;

/**
 * Merged USING column: the common type of both sides. Nullability: an INNER join's
 * equality can never match NULLs; LEFT keeps the left column, RIGHT the right one;
 * FULL is `COALESCE(l.c, r.c)`, which is NULL for a row of either side whose column is (the
 * other side has no match for it).
 */
type UsingCols<
	U extends string,
	K extends JoinKind,
	L extends ScopeLevel,
	R extends ScopeLevel,
> = {
	readonly [C in U]: UsingCol<K, FindInLevel<L, C>, FindInLevel<R, C>>;
};
type UsingCol<K extends JoinKind, LI, RI> = LI extends ColInfo
	? RI extends ColInfo
		? Info<
				CommonType<LI["type"], RI["type"]>,
				K extends "left"
					? LI["nullable"]
					: K extends "right"
						? RI["nullable"]
						: K extends "full"
							? LI["nullable"] extends true
								? true
								: RI["nullable"]
							: false
			>
		: Info<"unknown", true>
	: Info<"unknown", true>;

type HideCols<L extends ScopeLevel, U extends string> = {
	readonly [I in keyof L]: L[I] extends ScopeItem
		? {
				readonly alias: L[I]["alias"];
				readonly cols: L[I]["cols"];
				readonly skip: [...L[I]["skip"], U];
			}
		: L[I];
};
