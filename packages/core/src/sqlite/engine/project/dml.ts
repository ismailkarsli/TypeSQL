import type { Nx } from "../../../engine/parse.js";
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
	Upsert,
} from "../ast.js";
import type {
	BindFrom,
	InsertOrder,
	LookupRelation,
	RefDisplay,
	RelationItem,
} from "../binder/scope.js";
import type {
	FnArgs,
	ParamsOfExpr,
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
	MkCtx,
	SqCteMap,
	SqCtx,
	SqItem,
	SqLevel,
} from "../types.js";
import type {
	BindWith,
	FirstName,
	ProjectSelect,
	ProjectTargets,
} from "./select.js";

type Target_<
	DB,
	Ref extends TableRef,
	Ctes extends SqCteMap,
> = Ref["schema"] extends null
	? Ref["name"] extends keyof Ctes
		? SqlError<`no such table: ${Ref["name"]}`, null>
		: Writable<DB, Ref>
	: Writable<DB, Ref>;
type Writable<DB, Ref extends TableRef> =
	LookupRelation<DB, Ref> extends [infer Rel, infer K extends string]
		? Rel extends View<Table>
			? SqlError<`cannot modify ${K} because it is a view`, null>
			: Rel extends Table
				? [Rel, K]
				: SqlError<`no such table: ${RefDisplay<Ref>}`, null>
		: SqlError<`no such table: ${RefDisplay<Ref>}`, null>;

type Item<Rel, Alias extends string> =
	RelationItem<Rel, Alias> extends infer It extends SqItem ? It : never;

export type ProjectDml<S extends DmlStmt, DB, Ctes0 extends SqCteMap> =
	BindWith<S["with"], DB, [], Ctes0> extends infer Ctes extends SqCteMap
		? Target_<DB, S["table"], Ctes> extends infer Tg
			? Tg extends [infer Rel extends Table, infer K extends string]
				? (
						S extends { readonly t: "insert" }
							? CheckInsert<Extract<S, InsertStmt>, Rel, K, DB, Ctes>
							: S extends { readonly t: "update" }
								? CheckUpdate<Extract<S, UpdateStmt>, Rel, DB, Ctes>
								: S extends { readonly t: "delete" }
									? CheckDelete<Extract<S, DeleteStmt>, Rel, DB, Ctes>
									: true
					) extends infer X
					? X extends AnyErr
						? X
						: S["returning"] extends readonly Target[]
							? Returning<
									S["returning"],
									Item<Rel, S["table"]["name"]>,
									DB,
									Ctes
								>
							: []
					: never
				: Tg
			: never
		: BindWith<S["with"], DB, [], Ctes0>;

type Returning<
	Ts extends readonly Target[],
	It extends SqItem,
	DB,
	Ctes extends SqCteMap,
> = ProjectTargets<Ts, [It], MkCtx<DB, [[It]], Ctes>, 0, [], true>;

type ColOf<Rel extends Table, C extends string> = {
	[K in keyof Rel & string]: Lowercase<K> extends C ? Rel[K] : never;
}[keyof Rel & string];

type NameOf<Rel, C extends string> = {
	[K in keyof Rel & string]: Lowercase<K> extends C ? K : never;
}[keyof Rel & string];

type CheckCols<
	Cols extends readonly string[],
	Rel extends Table,
	Msg extends string,
	I extends number = 0,
> = Cols[I] extends infer C extends string
	? [ColOf<Rel, C>] extends [never]
		? SqlError<`${Msg}${C}`, null>
		: ColOf<Rel, C> extends { readonly generated: true }
			? SqlError<
					`cannot INSERT into generated column "${NameOf<Rel, C>}"`,
					null
				>
			: CheckCols<Cols, Rel, Msg, Nx<I>>
	: true;

type Width<
	S extends InsertStmt,
	DB,
	Ctes extends SqCteMap,
> = S["source"] extends {
	readonly t: "values";
	readonly rows: readonly [infer R extends readonly Expr[], ...unknown[]];
}
	? R["length"]
	: S["source"] extends {
				readonly t: "select";
				readonly q: infer Q extends SelectStmt;
			}
		? ProjectSelect<Q, DB, [], Ctes> extends infer X extends readonly Cell[]
			? X["length"]
			: ProjectSelect<Q, DB, [], Ctes>
		: null;

type TableWidth<Rel extends Table> =
	InsertOrder<Rel> extends infer O extends readonly unknown[] ? O["length"] : 0;

type CheckInsert<
	S extends InsertStmt,
	Rel extends Table,
	K extends string,
	DB,
	Ctes extends SqCteMap,
> = (
	S["columns"] extends readonly string[]
		? CheckCols<S["columns"], Rel, `table ${K} has no column named `>
		: true
) extends infer E1 extends AnyErr
	? E1
	: Width<S, DB, Ctes> extends infer W
		? W extends AnyErr
			? W
			: W extends number
				? S["columns"] extends readonly string[]
					? W extends S["columns"]["length"]
						? InsertRest<S, Rel, K, DB, Ctes>
						: SqlError<
								`${W} values for ${S["columns"]["length"]} columns`,
								null
							>
					: W extends TableWidth<Rel>
						? InsertRest<S, Rel, K, DB, Ctes>
						: SqlError<
								`table ${K} has ${TableWidth<Rel>} columns but ${W} values were supplied`,
								null
							>
				: InsertRest<S, Rel, K, DB, Ctes>
		: never;

type InsertRest<
	S extends InsertStmt,
	Rel extends Table,
	K extends string,
	DB,
	Ctes extends SqCteMap,
> = (
	S["source"] extends {
		readonly t: "values";
		readonly rows: infer Rows extends readonly (readonly Expr[])[];
	}
		? ValuesTyped<Rows, MkCtx<DB, [], Ctes>, 0>
		: true
) extends infer E1 extends AnyErr
	? E1
	: MissingRequired<S, Rel, K> extends AnyErr
		? MissingRequired<S, Rel, K>
		: UpsertLoop<
				S["upsert"],
				Rel,
				Item<Rel, S["alias"] extends string ? S["alias"] : S["table"]["name"]>,
				DB,
				Ctes,
				0
			>;

type ValuesTyped<
	Rows extends readonly (readonly Expr[])[],
	C extends SqCtx,
	I extends number,
> = Rows[I] extends infer R extends readonly Expr[]
	? TypeList<R, C> extends AnyErr
		? TypeList<R, C>
		: ValuesTyped<Rows, C, Nx<I>>
	: true;

type MissingRequired<
	S extends InsertStmt,
	Rel extends Table,
	K extends string,
> = S["columns"] extends readonly string[]
	? {
			[C in keyof Rel & string]: Rel[C] extends {
				readonly nullable: false;
				readonly hasDefault: false;
			}
				? Lowercase<C> extends S["columns"][number]
					? never
					: C
				: never;
		}[keyof Rel & string] extends infer M extends string
		? [M] extends [never]
			? true
			: SqlError<`NOT NULL constraint failed: ${K}.${FirstName<M>}`, null>
		: never
	: S["source"] extends { readonly t: "default" }
		? {
				[C in keyof Rel & string]: Rel[C] extends {
					readonly nullable: false;
					readonly hasDefault: false;
				}
					? C
					: never;
			}[keyof Rel & string] extends infer M extends string
			? [M] extends [never]
				? true
				: SqlError<`NOT NULL constraint failed: ${K}.${FirstName<M>}`, null>
			: never
		: true;

// In DO UPDATE, SQLite resolves names against the table first and tries
// `excluded` only for a qualified name nothing else matched, so a bare `n` is
// the table's column and a table aliased `excluded` shadows it. An outer level
// behind the table gives that order.
type UpsertScope<Rel extends Table, It extends SqItem> = [
	[It],
	[Item<Rel, "excluded">],
];

type UpsertLoop<
	Us extends readonly Upsert[],
	Rel extends Table,
	It extends SqItem,
	DB,
	Ctes extends SqCteMap,
	I extends number,
> = Us[I] extends infer U extends Upsert
	? MkCtx<DB, UpsertScope<Rel, It>, Ctes> extends infer C extends SqCtx
		? TypeList<
				[
					...(U["target"] extends readonly Expr[] ? U["target"] : []),
					...(U["where"] extends Expr ? [U["where"]] : []),
				],
				MkCtx<DB, [[It]], Ctes>
			> extends infer X
			? X extends AnyErr
				? X
				: // DO UPDATE … WHERE sees excluded.*, like SET; the conflict
					// target and its WHERE see only the table.
					(
							U["setWhere"] extends Expr
								? TypeList<[U["setWhere"]], C>
								: true
						) extends infer W extends AnyErr
					? W
					: (
								U["set"] extends readonly SetItem[]
									? CheckSet<U["set"], It, C, Rel>
									: true
							) extends infer Y
						? Y extends AnyErr
							? Y
							: UpsertLoop<Us, Rel, It, DB, Ctes, Nx<I>>
						: never
			: never
		: never
	: true;

type CheckSet<
	Set extends readonly SetItem[],
	It extends SqItem,
	C extends SqCtx,
	Rel,
	I extends number = 0,
> = Set[I] extends infer S extends SetItem
	? MissingCol<S["cols"], It, Rel> extends AnyErr
		? MissingCol<S["cols"], It, Rel>
		: S["cols"]["length"] extends 1
			? TypeOf<S["e"], C> extends AnyErr
				? TypeOf<S["e"], C>
				: CheckSet<Set, It, C, Rel, Nx<I>>
			: S["e"] extends {
						readonly t: "row";
						readonly items: infer Items extends readonly Expr[];
					}
				? Items["length"] extends S["cols"]["length"]
					? TypeList<Items, C> extends AnyErr
						? TypeList<Items, C>
						: CheckSet<Set, It, C, Rel, Nx<I>>
					: SqlError<
							`${S["cols"]["length"]} columns assigned ${Items["length"]} values`,
							null
						>
				: S["e"] extends {
							readonly t: "sub";
							readonly q: infer Q extends SelectStmt;
						}
					? ProjectSelect<
							Q,
							C["db"],
							C["scope"],
							C["ctes"]
						> extends infer X extends readonly Cell[]
						? X["length"] extends S["cols"]["length"]
							? CheckSet<Set, It, C, Rel, Nx<I>>
							: SqlError<
									`${S["cols"]["length"]} columns assigned ${X["length"]} values`,
									null
								>
						: ProjectSelect<Q, C["db"], C["scope"], C["ctes"]>
					: SqlError<`${S["cols"]["length"]} columns assigned 1 values`, null>
	: true;
type GenCol<Rel, C extends string> = true extends {
	[K in keyof Rel & string]: Lowercase<K> extends C
		? Rel[K] extends { readonly generated: true }
			? true
			: false
		: false;
}[keyof Rel & string]
	? true
	: false;

type MissingCol<
	Cols extends readonly string[],
	It extends SqItem,
	Rel,
	I extends number = 0,
> = Cols[I] extends infer C extends string
	? C extends keyof It["cols"]
		? GenCol<Rel, C> extends true
			? SqlError<`cannot UPDATE generated column "${NameOf<Rel, C>}"`, null>
			: MissingCol<Cols, It, Rel, Nx<I>>
		: SqlError<`no such column: ${C}`, null>
	: true;

type CheckUpdate<
	S extends UpdateStmt,
	Rel extends Table,
	DB,
	Ctes extends SqCteMap,
> =
	BindFrom<S["from"], DB, [], Ctes> extends infer L extends SqLevel
		? Item<
				Rel,
				S["alias"] extends string ? S["alias"] : S["table"]["name"]
			> extends infer It extends SqItem
			? MkCtx<DB, [[It, ...L]], Ctes> extends infer C extends SqCtx
				? CheckSet<S["set"], It, C, Rel> extends AnyErr
					? CheckSet<S["set"], It, C, Rel>
					: S["where"] extends Expr
						? TypeOf<S["where"], C> extends AnyErr
							? TypeOf<S["where"], C>
							: true
						: true
				: never
			: never
		: BindFrom<S["from"], DB, [], Ctes>;

type CheckDelete<
	S extends DeleteStmt,
	Rel extends Table,
	DB,
	Ctes extends SqCteMap,
> = S["where"] extends Expr
	? TypeOf<
			S["where"],
			MkCtx<
				DB,
				[
					[
						Item<
							Rel,
							S["alias"] extends string ? S["alias"] : S["table"]["name"]
						>,
					],
				],
				Ctes
			>
		> extends infer W
		? W extends AnyErr
			? W
			: true
		: never
	: true;

export type ParamsOfDml<S extends DmlStmt, DB, Ctes0 extends SqCteMap, M> =
	BindWith<S["with"], DB, [], Ctes0> extends infer Ctes
		? Ctes extends SqCteMap
			? Target_<DB, S["table"], Ctes> extends [infer Rel extends Table, string]
				? Item<
						Rel,
						S["alias"] extends string ? S["alias"] : S["table"]["name"]
					> extends infer It extends SqItem
					? (
							S extends { readonly t: "insert" }
								? InsertParams<Extract<S, InsertStmt>, Rel, It, DB, Ctes, M>
								: S extends { readonly t: "update" }
									? UpdateParams<Extract<S, UpdateStmt>, It, DB, Ctes, M>
									: S extends { readonly t: "delete" }
										? ParamsOfOpt<S["where"], MkCtx<DB, [[It]], Ctes>, M>
										: M
						) extends infer M1
						? S["returning"] extends readonly Target[]
							? ParamsOfTargets<
									S["returning"],
									MkCtx<DB, [[Item<Rel, S["table"]["name"]>]], Ctes>,
									M1
								>
							: M1
						: never
					: M
				: M
			: M
		: M;

type ColParam<It extends SqItem, C> = C extends keyof It["cols"]
	? Info<It["cols"][C]["type"], It["cols"][C]["nullable"]>
	: Info<"unknown", true>;

type InsertParams<
	S extends InsertStmt,
	Rel extends Table,
	It extends SqItem,
	DB,
	Ctes extends SqCteMap,
	M,
> = (
	S["columns"] extends readonly string[]
		? S["columns"]
		: InsertOrder<Rel>
) extends infer Cols extends readonly string[]
	? (
			S["source"] extends {
				readonly t: "values";
				readonly rows: infer Rows extends readonly (readonly Expr[])[];
			}
				? RowsParams<Rows, Cols, It, MkCtx<DB, [], Ctes>, M, 0>
				: S["source"] extends {
							readonly t: "select";
							readonly q: infer Q extends SelectStmt;
						}
					? ParamsOfSelect<Q, DB, [], Ctes, M>
					: M
		) extends infer M1
		? UpsertParams<S["upsert"], Rel, It, DB, Ctes, M1, 0>
		: never
	: never;

type RowsParams<
	Rows extends readonly (readonly Expr[])[],
	Cols extends readonly string[],
	It extends SqItem,
	C extends SqCtx,
	M,
	I extends number,
> = Rows[I] extends infer R extends readonly Expr[]
	? RowsParams<Rows, Cols, It, C, RowParams<R, Cols, It, C, M>, Nx<I>>
	: M;
type RowParams<
	R extends readonly Expr[],
	Cols extends readonly string[],
	It extends SqItem,
	C extends SqCtx,
	M,
> = FnArgs<R, C, M, { [K in keyof Cols]: ColParam<It, Cols[K]> }>;

type UpsertParams<
	Us extends readonly Upsert[],
	Rel extends Table,
	It extends SqItem,
	DB,
	Ctes extends SqCteMap,
	M,
	I extends number,
> = Us[I] extends infer U extends Upsert
	? MkCtx<DB, UpsertScope<Rel, It>, Ctes> extends infer C extends SqCtx
		? UpsertParams<
				Us,
				Rel,
				It,
				DB,
				Ctes,
				ParamsOfOpt<
					U["setWhere"],
					C,
					(
						U["set"] extends readonly SetItem[]
							? SetParams<U["set"], It, C, M, 0>
							: M
					) extends infer M1
						? ParamsOfOpt<
								U["where"],
								C,
								ParamsOfList<
									U["target"] extends readonly Expr[] ? U["target"] : [],
									C,
									M1
								>
							>
						: never
				>,
				Nx<I>
			>
		: never
	: M;

type SetParams<
	Set extends readonly SetItem[],
	It extends SqItem,
	C extends SqCtx,
	M,
	I extends number,
> = Set[I] extends infer S extends SetItem
	? SetParams<
			Set,
			It,
			C,
			S["cols"]["length"] extends 1
				? Slot<S["e"], C, M, ColParam<It, S["cols"][0]>>
				: S["e"] extends {
							readonly t: "row";
							readonly items: infer Items extends readonly Expr[];
						}
					? RowParams<Items, S["cols"], It, C, M>
					: ParamsOfExpr<S["e"], C, M>,
			Nx<I>
		>
	: M;

type UpdateParams<
	S extends UpdateStmt,
	It extends SqItem,
	DB,
	Ctes extends SqCteMap,
	M,
> =
	ParamsOfFrom<S["from"], DB, [], Ctes, M> extends infer M1
		? BindFrom<S["from"], DB, [], Ctes> extends infer L extends SqLevel
			? MkCtx<DB, [[It, ...L]], Ctes> extends infer C extends SqCtx
				? ParamsOfOpt<S["where"], C, SetParams<S["set"], It, C, M1, 0>>
				: never
			: M1
		: never;
