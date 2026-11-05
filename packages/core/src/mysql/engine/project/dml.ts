import type { Nx } from "../../../engine/parse.js";
import type { ColInfo, QueryContext, Scope } from "../../../engine/types.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Table, View } from "../../../schema.js";
import type {
	DeleteStmt,
	DmlStmt,
	Expr,
	InsertStmt,
	SelectStmt,
	SetItem,
	TableRef,
	Target,
	UpdateStmt,
} from "../ast.js";
import type {
	BindFrom,
	InsertOrder,
	LookupRelation,
	NoTable,
	RelationItem,
	StarCells,
} from "../binder/scope.js";
import type {
	FnArgs,
	LimitParams,
	ParamsOfFrom,
	ParamsOfList,
	ParamsOfOpt,
	ParamsOfSelect,
	ParamsOfTargets,
	Slot,
} from "../typer/params.js";
import type { Info, TypeList, TypeOf } from "../typer/typeof.js";
import type {
	Cell,
	FlavorOf,
	MkCtx,
	MyCol,
	MyCteMap,
	MyCtx,
	MyItem,
	MyLevel,
} from "../types.js";
import type { BindWith, ExprName, HasAgg, ProjectSelect } from "./select.js";

type Ctx<DB, S extends Scope, Ctes extends MyCteMap> = MkCtx<DB, S, Ctes>;
type Env<DB, Ctes extends MyCteMap> = QueryContext<DB, [], Ctes>;

type ColsOf<Rel> =
	Rel extends View<infer C extends Table> ? C : Rel extends Table ? Rel : never;

type Target_<DB, Ref extends TableRef> =
	LookupRelation<DB, Ref> extends [infer Rel, infer K extends string]
		? [ColsOf<Rel>, K]
		: NoTable<Ref>;

type Item<Rel, Alias extends string> =
	RelationItem<Rel, Alias> extends infer It extends MyItem ? It : never;

export type ProjectDml<S extends DmlStmt, DB, Ctes0 extends MyCteMap> =
	BindWith<S["with"], Env<DB, Ctes0>> extends infer Ctes extends MyCteMap
		? S extends { readonly t: "insert" }
			? ProjectInsert<Extract<S, InsertStmt>, DB, Ctes>
			: S extends { readonly t: "update" }
				? CheckUpdate<Extract<S, UpdateStmt>, DB, Ctes>
				: S extends { readonly t: "delete" }
					? CheckDelete<Extract<S, DeleteStmt>, DB, Ctes>
					: []
		: BindWith<S["with"], Env<DB, Ctes0>>;

type NoReturning<DB> =
	FlavorOf<DB> extends "mariadb"
		? null
		: SqlError<"You have an error in your SQL syntax near 'RETURNING'", null>;

type Returning<
	Ts extends readonly Target[],
	It extends MyItem,
	C extends MyCtx,
> = RetLoop<Ts, It, C, 0, []>;
type RetLoop<
	Ts extends readonly Target[],
	It extends MyItem,
	C extends MyCtx,
	I extends number,
	Acc extends readonly Cell[],
> = Ts[I] extends infer T extends Target
	? T extends { readonly t: "star" }
		? StarCells<[It], T["tbl"]> extends infer S
			? S extends readonly Cell[]
				? RetLoop<Ts, It, C, Nx<I>, [...Acc, ...S]>
				: S
			: never
		: T extends {
					readonly e: infer E extends Expr;
					readonly alias: infer A;
					readonly span: infer Sp extends string;
					readonly tail: infer Tl extends string;
				}
			? HasAgg<E, C["db"]> extends true
				? SqlError<"Invalid use of group function", null>
				: TypeOf<E, C> extends infer X
					? X extends ColInfo
						? RetLoop<
								Ts,
								It,
								C,
								Nx<I>,
								[
									...Acc,
									{
										readonly n: A extends string
											? A
											: ExprName<E, Sp, FlavorOf<C["db"]>, Tl>;
										readonly t: Info<X["type"], X["nullable"]>;
									},
								]
							>
						: X
					: never
			: never
	: Acc;

type ColOf<Rel, C extends string> = {
	[K in keyof Rel & string]: Lowercase<K> extends C ? Rel[K] : never;
}[keyof Rel & string];
type NameOf<Rel, C extends string> = {
	[K in keyof Rel & string]: Lowercase<K> extends C ? K : never;
}[keyof Rel & string];

type GeneratedErr<Name extends string, K extends string> = SqlError<
	`The value specified for generated column '${Name}' in table '${K}' is not allowed.`,
	null
>;

type CheckCols<
	Cols extends readonly string[],
	Rel,
	K extends string,
	Values extends readonly (readonly Expr[])[] | null,
	I extends number = 0,
> = Cols[I] extends infer C extends string
	? [ColOf<Rel, C>] extends [never]
		? SqlError<`Unknown column '${C}' in 'field list'`, null>
		: ColOf<Rel, C> extends { readonly generated: true }
			? AllDefault<Values, I> extends true
				? CheckCols<Cols, Rel, K, Values, Nx<I>>
				: GeneratedErr<NameOf<Rel, C>, K>
			: CheckCols<Cols, Rel, K, Values, Nx<I>>
	: true;
/** Generated columns accept only DEFAULT. */
type AllDefault<
	Rows,
	I extends number,
> = Rows extends readonly (readonly Expr[])[]
	? false extends {
			[R in keyof Rows]: Rows[R][I & keyof Rows[R]] extends {
				readonly t: "default";
			}
				? true
				: false;
		}[number]
		? false
		: true
	: false;

type SourceWidth<
	S extends InsertStmt,
	DB,
	Ctes extends MyCteMap,
> = S["source"] extends {
	readonly t: "select";
	readonly q: infer Q extends SelectStmt;
}
	? ProjectSelect<Q, Env<DB, Ctes>> extends infer X extends readonly Cell[]
		? X["length"]
		: ProjectSelect<Q, Env<DB, Ctes>>
	: null;

type RowsMatch<
	Rows extends readonly (readonly Expr[])[],
	N extends number,
	I extends number = 0,
> = Rows[I] extends infer R extends readonly Expr[]
	? R["length"] extends N
		? RowsMatch<Rows, N, Nx<I>>
		: SqlError<`Column count doesn't match value count at row ${Nx<I>}`, null>
	: true;

type InsertCols<S extends InsertStmt, Rel> = S["source"] extends {
	readonly t: "set";
	readonly set: infer Set extends readonly SetItem[];
}
	? { [I in keyof Set]: Set[I]["col"] }
	: S["columns"] extends readonly string[]
		? S["columns"]
		: InsertOrder<Rel>;

type ProjectInsert<S extends InsertStmt, DB, Ctes extends MyCteMap> =
	Target_<DB, S["table"]> extends infer Tg
		? Tg extends [infer Rel, infer K extends string]
			? (
					S["returning"] extends readonly Target[]
						? NoReturning<DB>
						: S["rowAlias"] extends null
							? null
							: FlavorOf<DB> extends "mariadb"
								? SqlError<
										"You have an error in your SQL syntax near 'AS'",
										null
									>
								: null
				) extends infer RE extends AnyErr
				? RE
				: InsertCols<S, Rel> extends infer Cols extends readonly string[]
					? CheckCols<
							Cols,
							Rel,
							K,
							S["source"] extends {
								readonly t: "values";
								readonly rows: infer R extends readonly (readonly Expr[])[];
							}
								? R
								: S["source"] extends {
											readonly t: "set";
											readonly set: infer Set extends readonly SetItem[];
										}
									? [{ [I in keyof Set]: Set[I]["e"] }]
									: null
						> extends infer E1
						? E1 extends AnyErr
							? E1
							: (
										S["source"] extends {
											readonly t: "values";
											readonly rows: infer Rows extends
												readonly (readonly Expr[])[];
										}
											? RowsMatch<Rows, Cols["length"]>
											: SourceWidth<S, DB, Ctes> extends infer W
												? W extends AnyErr
													? W
													: W extends number
														? W extends Cols["length"]
															? true
															: SqlError<
																	"Column count doesn't match value count at row 1",
																	null
																>
														: true
												: never
									) extends infer E2
								? E2 extends AnyErr
									? E2
									: InsertRest<S, Rel, K, Cols, DB, Ctes>
								: never
						: never
					: never
			: Tg
		: never;

type InsertRest<
	S extends InsertStmt,
	Rel,
	K extends string,
	Cols extends readonly string[],
	DB,
	Ctes extends MyCteMap,
> =
	Item<Rel, Lowercase<S["table"]["name"]>> extends infer It extends MyItem
		? (
				S["source"] extends {
					readonly t: "values";
					readonly rows: infer Rows extends readonly (readonly Expr[])[];
				}
					? ValuesTyped<Rows, Ctx<DB, [[It]], Ctes>, 0>
					: S["source"] extends {
								readonly t: "set";
								readonly set: infer Set extends readonly SetItem[];
							}
						? ValuesTyped<
								[{ [I in keyof Set]: Set[I]["e"] }],
								Ctx<DB, [[It]], Ctes>,
								0
							>
						: true
			) extends infer E1
			? E1 extends AnyErr
				? E1
				: MissingRequired<Rel, Cols> extends infer E2
					? E2 extends AnyErr
						? E2
						: (
									S["odku"] extends readonly SetItem[]
										? S["replace"] extends true
											? SqlError<
													"You have an error in your SQL syntax near 'ON DUPLICATE'",
													null
												>
											: OdkuCtx<S, It, DB, Ctes> extends infer C
												? C extends MyCtx
													? CheckSet<S["odku"], [It], C, K>
													: C
												: never
										: true
								) extends infer E3
							? E3 extends AnyErr
								? E3
								: S["returning"] extends readonly Target[]
									? Returning<S["returning"], It, Ctx<DB, [[It]], Ctes>>
									: []
							: never
					: never
			: never
		: never;

// ON DUPLICATE KEY UPDATE resolves a bare name against the table first; the
// row alias (`AS new` or `AS new(m, n)`) answers only to a qualified name, or
// to a bare column alias the table does not have. An outer level behind the
// table gives that order, as SQLite's `excluded` has.
type OdkuCtx<
	S extends InsertStmt,
	It extends MyItem,
	DB,
	Ctes extends MyCteMap,
> = S["rowAlias"] extends {
	readonly name: infer A extends string;
	readonly cols: infer AC;
}
	? Ctx<
			DB,
			[
				[It],
				[
					AC extends readonly string[]
						? RenamedItem<It, InsertCols<S, ColsRel<It>>, AC, A>
						: {
								readonly alias: A;
								readonly cols: It["cols"];
								readonly skip: [];
								readonly order: It["order"];
							},
				],
			],
			Ctes
		>
	: Ctx<DB, [[It]], Ctes>;
type ColsRel<It extends MyItem> = It["cols"];

type RenamedItem<
	It extends MyItem,
	Cols extends readonly string[],
	As extends readonly string[],
	A extends string,
> = {
	readonly alias: A;
	readonly cols: {
		readonly [I in keyof As & `${number}` as Lowercase<As[I]>]: Cols[I &
			keyof Cols] extends infer C extends keyof It["cols"]
			? It["cols"][C]
			: {
					readonly type: "unknown";
					readonly nullable: true;
					readonly n: As[I];
				};
	};
	readonly skip: [];
	readonly order: [];
};

type ValuesTyped<
	Rows extends readonly (readonly Expr[])[],
	C extends MyCtx,
	I extends number,
> = Rows[I] extends infer R extends readonly Expr[]
	? TypeList<NonDefault<R>, C> extends infer X
		? X extends AnyErr
			? X
			: ValuesTyped<Rows, C, Nx<I>>
		: never
	: true;
type NonDefault<R extends readonly Expr[]> = R extends readonly [
	infer H extends Expr,
	...infer T extends readonly Expr[],
]
	? H extends { readonly t: "default" }
		? NonDefault<T>
		: [H, ...NonDefault<T>]
	: [];

type MissingRequired<Rel, Cols extends readonly string[]> = {
	[C in keyof Rel & string]: Rel[C] extends {
		readonly nullable: false;
		readonly hasDefault: false;
	}
		? Lowercase<C> extends Lowercase<Cols[number]>
			? never
			: C
		: never;
}[keyof Rel & string] extends infer M extends string
	? [M] extends [never]
		? true
		: SqlError<`Field '${FirstOf<M>}' doesn't have a default value`, null>
	: never;
type FirstOf<U> =
	import("../../../sql/splice.js").UnionList<U> extends readonly [
		infer F extends string,
		...unknown[],
	]
		? F
		: never;

/** The column a SET item assigns, in the tables being updated. */
type SetCol<L extends MyLevel, S extends SetItem> = {
	[I in keyof L]: S["tbl"] extends string
		? L[I]["alias"] extends string
			? Lowercase<L[I]["alias"]> extends S["tbl"]
				? S["col"] extends keyof L[I]["cols"]
					? L[I]["cols"][S["col"]] & { readonly tbl: L[I]["alias"] }
					: never
				: never
			: never
		: S["col"] extends keyof L[I]["cols"]
			? S["col"] extends L[I]["skip"][number]
				? never
				: L[I]["cols"][S["col"]] & { readonly tbl: L[I]["alias"] }
			: never;
}[number];

type IsUnion<T, U = T> = T extends unknown
	? [U] extends [T]
		? false
		: true
	: never;

type CheckSet<
	Set extends readonly SetItem[],
	L extends MyLevel,
	C extends MyCtx,
	K extends string,
	I extends number = 0,
> = Set[I] extends infer S extends SetItem
	? SetCol<L, S> extends infer Col
		? [Col] extends [never]
			? SqlError<
					`Unknown column '${S["tbl"] extends string ? `${S["tbl"]}.` : ""}${S["col"]}' in 'field list'`,
					null
				>
			: IsUnion<Col> extends true
				? SqlError<`Column '${S["col"]}' in field list is ambiguous`, null>
				: Col extends { readonly gen: true }
					? S["e"] extends { readonly t: "default" }
						? CheckSet<Set, L, C, K, Nx<I>>
						: GeneratedErr<
								Col extends MyCol ? Col["n"] : S["col"],
								Col extends { readonly tbl: infer T extends string } ? T : K
							>
					: S["e"] extends { readonly t: "default" }
						? CheckSet<Set, L, C, K, Nx<I>>
						: HasAgg<S["e"], C["db"]> extends true
							? SqlError<"Invalid use of group function", null>
							: TypeOf<S["e"], C> extends infer X
								? X extends AnyErr
									? X
									: CheckSet<Set, L, C, K, Nx<I>>
								: never
		: never
	: true;

type OrderLimitOk<
	S,
	Multi extends boolean,
	Verb extends string,
> = Multi extends true
	? S extends { readonly orderBy: readonly [unknown, ...unknown[]] }
		? SqlError<`Incorrect usage of ${Verb} and ORDER BY`, null>
		: S extends { readonly limit: Expr }
			? SqlError<`Incorrect usage of ${Verb} and LIMIT`, null>
			: true
	: true;

type CheckUpdate<S extends UpdateStmt, DB, Ctes extends MyCteMap> =
	BindFrom<S["from"], Env<DB, Ctes>> extends infer L
		? L extends MyLevel
			? OrderLimitOk<
					S,
					S["from"] extends { readonly t: "table" }
						? false
						: FlavorOf<DB> extends "mariadb"
							? false
							: true,
					"UPDATE"
				> extends infer E0
				? E0 extends AnyErr
					? E0
					: Ctx<DB, [L], Ctes> extends infer C extends MyCtx
						? CheckSet<S["set"], L, C, FirstAlias<L>> extends infer X
							? X extends AnyErr
								? X
								: TypeList<
											[
												...(S["where"] extends Expr ? [S["where"]] : []),
												...S["orderBy"],
											],
											C
										> extends infer W
									? W extends AnyErr
										? W
										: S["where"] extends Expr
											? HasAgg<S["where"], DB> extends true
												? SqlError<"Invalid use of group function", null>
												: []
											: []
									: never
							: never
						: never
				: never
			: L
		: never;
type FirstAlias<L extends MyLevel> = L[0]["alias"] extends string
	? L[0]["alias"]
	: "";

type DeleteTargetsOk<
	Ts extends readonly TableRef[],
	L extends MyLevel,
	I extends number = 0,
> = Ts[I] extends infer R extends TableRef
	? true extends {
			[J in keyof L]: L[J]["alias"] extends string
				? Lowercase<L[J]["alias"]> extends Lowercase<R["name"]>
					? true
					: false
				: false;
		}[number]
		? DeleteTargetsOk<Ts, L, Nx<I>>
		: SqlError<`Unknown table '${R["name"]}' in MULTI DELETE`, null>
	: true;

type CheckDelete<S extends DeleteStmt, DB, Ctes extends MyCteMap> = (
	S["returning"] extends readonly Target[]
		? NoReturning<DB>
		: null
) extends infer RE extends AnyErr
	? RE
	: BindFrom<S["from"], Env<DB, Ctes>> extends infer L
		? L extends MyLevel
			? (
					S["multi"] extends true
						? DeleteTargetsOk<S["targets"], L>
						: true
				) extends infer E0
				? E0 extends AnyErr
					? E0
					: Ctx<DB, [L], Ctes> extends infer C extends MyCtx
						? TypeList<
								[
									...(S["where"] extends Expr ? [S["where"]] : []),
									...S["orderBy"],
								],
								C
							> extends infer W
							? W extends AnyErr
								? W
								: S["returning"] extends readonly Target[]
									? Returning<S["returning"], L[0], C>
									: []
							: never
						: never
				: never
			: L
		: never;

export type ParamsOfDml<S extends DmlStmt, DB, Ctes0 extends MyCteMap> =
	BindWith<S["with"], Env<DB, Ctes0>> extends infer Ctes extends MyCteMap
		? S extends { readonly t: "insert" }
			? InsertParams<Extract<S, InsertStmt>, DB, Ctes>
			: S extends { readonly t: "update" }
				? UpdateParams<Extract<S, UpdateStmt>, DB, Ctes>
				: S extends { readonly t: "delete" }
					? DeleteParams<Extract<S, DeleteStmt>, DB, Ctes>
					: never
		: never;

type ColParam<It extends MyItem, C> = C extends keyof It["cols"]
	? Info<It["cols"][C]["type"], It["cols"][C]["nullable"]>
	: Info<"unknown", true>;

type InsertParams<S extends InsertStmt, DB, Ctes extends MyCteMap> =
	Target_<DB, S["table"]> extends [infer Rel, string]
		? Item<Rel, Lowercase<S["table"]["name"]>> extends infer It extends MyItem
			? InsertCols<S, Rel> extends infer Cols extends readonly string[]
				? Ctx<DB, [[It]], Ctes> extends infer C extends MyCtx
					?
							| (S["source"] extends {
									readonly t: "values";
									readonly rows: infer Rows extends
										readonly (readonly Expr[])[];
							  }
									? RowParams<Rows[number], Cols, It, C>
									: S["source"] extends {
												readonly t: "select";
												readonly q: infer Q extends SelectStmt;
											}
										? ParamsOfSelect<Q, Env<DB, Ctes>>
										: S["source"] extends {
													readonly t: "set";
													readonly set: infer Set extends readonly SetItem[];
												}
											? SetParams<Set[number], [It], C>
											: never)
							| (S["odku"] extends readonly SetItem[]
									? OdkuCtx<S, It, DB, Ctes> extends infer OC extends MyCtx
										? SetParams<S["odku"][number], [It], OC>
										: never
									: never)
							| (S["returning"] extends readonly Target[]
									? ParamsOfTargets<S["returning"], C>
									: never)
					: never
				: never
			: never
		: never;

type RowParams<
	R extends readonly Expr[],
	Cols extends readonly string[],
	It extends MyItem,
	C extends MyCtx,
> = R extends unknown
	? FnArgs<
			R,
			C,
			never,
			{ [K in keyof Cols]: ColParam<It, Lowercase<Cols[K] & string>> }
		>
	: never;

type SetParams<
	S extends SetItem,
	L extends MyLevel,
	C extends MyCtx,
> = S extends unknown
	? Slot<
			S["e"],
			C,
			SetCol<L, S> extends infer Col extends ColInfo
				? Info<Col["type"], Col["nullable"]>
				: Info<"unknown", true>
		>
	: never;

type UpdateParams<S extends UpdateStmt, DB, Ctes extends MyCteMap> =
	| ParamsOfFrom<S["from"], Env<DB, Ctes>>
	| (BindFrom<S["from"], Env<DB, Ctes>> extends infer L extends MyLevel
			? Ctx<DB, [L], Ctes> extends infer C extends MyCtx
				?
						| SetParams<S["set"][number], L, C>
						| ParamsOfOpt<S["where"], C>
						| ParamsOfList<S["orderBy"], C>
						| LimitParams<S["limit"]>
				: never
			: never);

type DeleteParams<S extends DeleteStmt, DB, Ctes extends MyCteMap> =
	| ParamsOfFrom<S["from"], Env<DB, Ctes>>
	| (BindFrom<S["from"], Env<DB, Ctes>> extends infer L extends MyLevel
			? Ctx<DB, [L], Ctes> extends infer C extends MyCtx
				?
						| ParamsOfOpt<S["where"], C>
						| ParamsOfList<S["orderBy"], C>
						| LimitParams<S["limit"]>
						| (S["returning"] extends readonly Target[]
								? ParamsOfTargets<S["returning"], C>
								: never)
				: never
			: never);
