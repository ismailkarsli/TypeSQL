import type {
	LastPart,
	NameAt,
	NamedAt,
} from "../../../engine/family/diagnostics.js";
import type { RefDisplay } from "../../../engine/family/scope.js";
import type { QueryContext } from "../../../engine/family/types.js";
import type { Next } from "../../../engine/next.js";
import type { Members } from "../../../engine/object.js";
import type { Info } from "../../../engine/types.js";
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
	InsertKeys,
	InsertOrder,
	LookupRelation,
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
import type { TypeList, TypeOf } from "../typer/typeof.js";
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
		? SqlError<`no such table: ${Ref["name"]}`, NamedAt<Ref["name"], "table">>
		: Writable<DB, Ref>
	: Writable<DB, Ref>;
type Writable<DB, Ref extends TableRef> =
	LookupRelation<DB, Ref> extends [infer Rel, infer K extends string]
		? Rel extends View<Table>
			? SqlError<`cannot modify ${K} because it is a view`, NamedAt<K>>
			: Rel extends Table
				? [Rel, K]
				: SqlError<
						`no such table: ${RefDisplay<Ref>}`,
						NamedAt<RefDisplay<Ref>, "table">
					>
		: SqlError<
				`no such table: ${RefDisplay<Ref>}`,
				NamedAt<RefDisplay<Ref>, "table">
			>;

type Item<Rel, Alias extends string> =
	RelationItem<Rel, Alias> extends infer It extends SqItem ? It : never;

export type ProjectDml<S extends DmlStmt, DB, Ctes0 extends SqCteMap> =
	BindWith<S["with"], QueryContext<DB, [], Ctes0>> extends infer Ctes extends
		SqCteMap
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
		: BindWith<S["with"], QueryContext<DB, [], Ctes0>>;

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
	K extends string,
	I extends number = 0,
> = Cols[I] extends infer C extends string
	? [ColOf<Rel, C>] extends [never]
		? SqlError<
				`table ${K} has no column named ${C}`,
				NameAt<LastPart<Lowercase<K>>, "column", LastPart<Lowercase<C>>>
			>
		: ColOf<Rel, C> extends { readonly generated: true }
			? SqlError<
					`cannot INSERT into generated column "${NameOf<Rel, C>}"`,
					null
				>
			: CheckCols<Cols, Rel, K, Next<I>>
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
		? ProjectSelect<Q, QueryContext<DB, [], Ctes>> extends infer X extends
				readonly Cell[]
			? X["length"]
			: ProjectSelect<Q, QueryContext<DB, [], Ctes>>
		: null;

type TableWidth<Rel extends Table> =
	InsertOrder<Rel> extends infer O extends readonly unknown[]
		? O["length"]
		: Members<InsertKeys<Rel>> extends infer L extends readonly unknown[]
			? L["length"]
			: 0;

type CheckInsert<
	S extends InsertStmt,
	Rel extends Table,
	K extends string,
	DB,
	Ctes extends SqCteMap,
> = (
	S["columns"] extends readonly string[]
		? CheckCols<S["columns"], Rel, K>
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
								NameAt<"values">
							>
					: W extends TableWidth<Rel>
						? InsertRest<S, Rel, K, DB, Ctes>
						: SqlError<
								`table ${K} has ${TableWidth<Rel>} columns but ${W} values were supplied`,
								NameAt<"values">
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
		: ValuesTyped<Rows, C, Next<I>>
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
							: UpsertLoop<Us, Rel, It, DB, Ctes, Next<I>>
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
				: CheckSet<Set, It, C, Rel, Next<I>>
			: S["e"] extends {
						readonly t: "row";
						readonly items: infer Items extends readonly Expr[];
					}
				? Items["length"] extends S["cols"]["length"]
					? TypeList<Items, C> extends AnyErr
						? TypeList<Items, C>
						: CheckSet<Set, It, C, Rel, Next<I>>
					: SqlError<
							`${S["cols"]["length"]} columns assigned ${Items["length"]} values`,
							null
						>
				: S["e"] extends {
							readonly t: "sub";
							readonly q: infer Q extends SelectStmt;
						}
					? ProjectSelect<Q, C> extends infer X extends readonly Cell[]
						? X["length"] extends S["cols"]["length"]
							? CheckSet<Set, It, C, Rel, Next<I>>
							: SqlError<
									`${S["cols"]["length"]} columns assigned ${X["length"]} values`,
									null
								>
						: ProjectSelect<Q, C>
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
			: MissingCol<Cols, It, Rel, Next<I>>
		: SqlError<`no such column: ${C}`, NamedAt<C, "column">>
	: true;

type CheckUpdate<
	S extends UpdateStmt,
	Rel extends Table,
	DB,
	Ctes extends SqCteMap,
> =
	BindFrom<S["from"], QueryContext<DB, [], Ctes>> extends infer L extends
		SqLevel
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
		: BindFrom<S["from"], QueryContext<DB, [], Ctes>>;

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

export type ParamsOfDml<S extends DmlStmt, DB, Ctes0 extends SqCteMap> =
	BindWith<S["with"], QueryContext<DB, [], Ctes0>> extends infer Ctes
		? Ctes extends SqCteMap
			? Target_<DB, S["table"], Ctes> extends [infer Rel extends Table, string]
				? Item<
						Rel,
						S["alias"] extends string ? S["alias"] : S["table"]["name"]
					> extends infer It extends SqItem
					? (
							S extends { readonly t: "insert" }
								? InsertParams<Extract<S, InsertStmt>, Rel, It, DB, Ctes>
								: S extends { readonly t: "update" }
									? UpdateParams<Extract<S, UpdateStmt>, It, DB, Ctes>
									: S extends { readonly t: "delete" }
										? ParamsOfOpt<S["where"], MkCtx<DB, [[It]], Ctes>>
										: never
						) extends infer M1
						? S["returning"] extends readonly Target[]
							?
									| M1
									| ParamsOfTargets<
											S["returning"],
											MkCtx<DB, [[Item<Rel, S["table"]["name"]>]], Ctes>
									  >
							: M1
						: never
					: never
				: never
			: never
		: never;

type ColParam<It extends SqItem, C> = C extends keyof It["cols"]
	? Info<It["cols"][C]["type"], It["cols"][C]["nullable"]>
	: Info<"unknown", true>;

type InsertParams<
	S extends InsertStmt,
	Rel extends Table,
	It extends SqItem,
	DB,
	Ctes extends SqCteMap,
> = (
	S["columns"] extends readonly string[]
		? S["columns"]
		: // Without the table's column order, the values are typed `unknown`.
			InsertOrder<Rel> extends infer O extends readonly string[]
			? O
			: []
) extends infer Cols extends readonly string[]
	?
			| (S["source"] extends {
					readonly t: "values";
					readonly rows: infer Rows extends readonly (readonly Expr[])[];
			  }
					? RowParams<Rows[number], Cols, It, MkCtx<DB, [], Ctes>>
					: S["source"] extends {
								readonly t: "select";
								readonly q: infer Q extends SelectStmt;
							}
						? ParamsOfSelect<Q, QueryContext<DB, [], Ctes>>
						: never)
			| UpsertParams<
					S["upsert"][number],
					It,
					MkCtx<DB, UpsertScope<Rel, It>, Ctes>
			  >
	: never;

type RowParams<
	R extends readonly Expr[],
	Cols extends readonly string[],
	It extends SqItem,
	C extends SqCtx,
> = R extends unknown
	? FnArgs<R, C, never, { [K in keyof Cols]: ColParam<It, Cols[K]> }>
	: never;

type UpsertParams<
	U extends Upsert,
	It extends SqItem,
	C extends SqCtx,
> = U extends unknown
	?
			| (U["set"] extends readonly SetItem[]
					? SetParams<U["set"][number], It, C>
					: never)
			| ParamsOfList<U["target"] extends readonly Expr[] ? U["target"] : [], C>
			| ParamsOfOpt<U["where"] | U["setWhere"], C>
	: never;

type SetParams<
	S extends SetItem,
	It extends SqItem,
	C extends SqCtx,
> = S extends unknown
	? S["cols"]["length"] extends 1
		? Slot<S["e"], C, ColParam<It, S["cols"][0]>>
		: S["e"] extends {
					readonly t: "row";
					readonly items: infer Items extends readonly Expr[];
				}
			? RowParams<Items, S["cols"], It, C>
			: ParamsOfExpr<S["e"], C>
	: never;

type UpdateParams<
	S extends UpdateStmt,
	It extends SqItem,
	DB,
	Ctes extends SqCteMap,
> =
	| ParamsOfFrom<S["from"], QueryContext<DB, [], Ctes>>
	| (BindFrom<S["from"], QueryContext<DB, [], Ctes>> extends infer L extends
			SqLevel
			? MkCtx<DB, [[It, ...L]], Ctes> extends infer C extends SqCtx
				? SetParams<S["set"][number], It, C> | ParamsOfOpt<S["where"], C>
				: never
			: never);
