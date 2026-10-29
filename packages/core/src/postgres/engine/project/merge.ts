import type {
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
import type { Table } from "../../../schema.js";
import type { Expr, MergeStmt, MergeWhen, SetItem, TargetInd } from "../ast.js";
import type { BindFrom } from "../binder/from.js";
import type { TableCols } from "../binder/resolve.js";
import type { ParamsOfFromItems, ParamsOfOpt } from "../typer/params.js";
import type {
	AssignTargets,
	CheckAssignedCols,
	CheckExpr,
	CheckOptExpr,
	CheckRequired,
	CheckRows,
	CheckSet,
	CheckValueItems,
	DmlCtx,
	ParamsOfInds,
	ParamsOfReturning,
	ParamsOfRowInfos,
	ParamsOfSet,
	ProjectReturning,
	ResolveTarget,
	Target_,
	TargetInfos,
	UnionToTuple,
	WidthCheck,
} from "./dml.js";

export type ProjectMerge<
	S extends MergeStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ResolveTarget<DB, S["table"], S["alias"], "merge into"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? BindFrom<[S["source"]], DB, Outer, Ctes> extends infer L
				? L extends ScopeLevel
					? Item["alias"] extends L[number]["alias"]
						? SqlError<`name "${Item["alias"]}" specified more than once`, null>
						: CheckExpr<
									S["on"],
									DmlCtx<DB, [Item, ...L], Outer, Ctes>
								> extends infer On
							? On extends AnyErr
								? On
								: CheckWhens<
											S["whens"],
											Tbl,
											Item,
											L,
											S["table"]["name"],
											DB,
											Outer,
											Ctes,
											never
										> extends infer W
									? W extends AnyErr
										? W
										: ProjectReturning<
												S["returning"],
												S["retOpts"],
												[Item, ...ReturningSource<S["whens"], L>],
												TableCols<Tbl>,
												HasAction<S["whens"], "insert">,
												HasAction<S["whens"], "delete">,
												DB,
												Outer,
												Ctes
											>
									: never
							: never
					: InvalidRef<L, Item["alias"]>
				: never
			: Tg
		: never;

type ReturningSource<Ws extends readonly MergeWhen[], L extends ScopeLevel> = [
	Extract<
		Ws[number],
		{
			readonly match: "source";
			readonly action: { readonly t: "update" | "delete" };
		}
	>,
] extends [never]
	? L
	: NullableLevel<L>;
type NullableLevel<L extends ScopeLevel> = {
	readonly [I in keyof L]: {
		readonly alias: L[I]["alias"];
		readonly cols: NullableMap<L[I]["cols"]>;
		readonly skip: L[I]["skip"];
	};
};

type HasAction<Ws extends readonly MergeWhen[], A extends string> = [
	Extract<Ws[number]["action"], { readonly t: A }>,
] extends [never]
	? false
	: true;

type WhenLevel<
	M extends MergeWhen["match"],
	Item extends ScopeItem,
	L extends ScopeLevel,
> = M extends "matched" ? [Item, ...L] : M extends "source" ? [Item] : L;
type HiddenNames<
	M extends MergeWhen["match"],
	Item extends ScopeItem,
	L extends ScopeLevel,
> = M extends "matched"
	? never
	: M extends "source"
		? L[number]["alias"]
		: Item["alias"];

type InvalidRef<E, Hidden> =
	E extends SqlError<`missing FROM-clause entry for table "${infer A}"`, null>
		? A extends Hidden
			? SqlError<
					`invalid reference to FROM-clause entry for table "${A}"`,
					null
				>
			: E
		: E;

type CheckWhens<
	Ws extends readonly MergeWhen[],
	Tbl extends Table,
	Item extends ScopeItem,
	L extends ScopeLevel,
	Name extends string,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
	Done extends string,
> = Ws extends readonly [
	infer W extends MergeWhen,
	...infer R extends readonly MergeWhen[],
]
	? W["match"] extends Done
		? SqlError<
				"unreachable WHEN clause specified after unconditional WHEN clause",
				null
			>
		: CheckWhen<
					W,
					Tbl,
					Name,
					DmlCtx<DB, WhenLevel<W["match"], Item, L>, Outer, Ctes>
				> extends infer X
			? X extends AnyErr
				? InvalidRef<X, HiddenNames<W["match"], Item, L>>
				: CheckWhens<
						R,
						Tbl,
						Item,
						L,
						Name,
						DB,
						Outer,
						Ctes,
						W["cond"] extends null ? Done | W["match"] : Done
					>
			: never
	: true;

type CheckWhen<
	W extends MergeWhen,
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> =
	CheckOptExpr<W["cond"], C> extends infer X
		? X extends AnyErr
			? X
			: W["action"] extends {
						readonly t: "update";
						readonly set: infer Set extends readonly SetItem[];
					}
				? CheckSet<Set, Tbl, Name, C>
				: W["action"] extends {
							readonly t: "insert";
							readonly columns: infer Cols extends readonly string[] | null;
							readonly colInd: infer Ind extends readonly TargetInd[] | null;
							readonly values: infer Vals extends readonly Expr[] | null;
						}
					? CheckMergeInsert<Cols, Ind, Vals, Tbl, Name, C>
					: true
		: never;

type CheckMergeInsert<
	Cols extends readonly string[] | null,
	Ind extends readonly TargetInd[] | null,
	Vals extends readonly Expr[] | null,
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> = Vals extends readonly Expr[]
	? Cols extends readonly string[]
		? CheckAssignedCols<
				Cols,
				AssignTargets<Cols, Ind>,
				Tbl,
				Name,
				"insert"
			> extends infer E
			? E extends AnyErr
				? E
				: WidthCheck<Vals, Cols> extends infer Wd
					? Wd extends "more"
						? SqlError<"INSERT has more expressions than target columns", null>
						: Wd extends "fewer"
							? SqlError<
									"INSERT has more target columns than expressions",
									null
								>
							: CheckRows<
										[Vals],
										Cols,
										AssignTargets<Cols, Ind>,
										Tbl,
										Name,
										C
									> extends infer V
								? V extends AnyErr
									? V
									: CheckRequired<Tbl, Cols, Name>
								: never
					: never
			: never
		: WidthCheck<Vals, UnionToTuple<keyof Tbl>> extends "more"
			? SqlError<"INSERT has more expressions than target columns", null>
			: CheckValueItems<Vals, C>
	: CheckRequired<Tbl, [], Name>;

export type ParamsOfMerge<S extends MergeStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "merge into"> extends infer Tg
		? Tg extends Target_<infer Tbl, infer Item>
			? BindFrom<[S["source"]], DB, [], Ctes> extends infer L
				? L extends ScopeLevel
					? ParamsOfReturning<
							S["returning"],
							S["retOpts"],
							[Item, ...ReturningSource<S["whens"], L>],
							TableCols<Tbl>,
							HasAction<S["whens"], "insert">,
							HasAction<S["whens"], "delete">,
							DB,
							Ctes,
							ParamsOfWhens<
								S["whens"],
								Tbl,
								Item,
								L,
								DB,
								Ctes,
								ParamsOfOpt<
									S["on"],
									DmlCtx<DB, [Item, ...L], [], Ctes>,
									ParamsOfFromItems<
										[S["source"]],
										MkCtx<DB, [], Ctes, false>,
										M
									>,
									Info<"bool">
								>
							>
						>
					: M
				: never
			: M
		: never;

type ParamsOfWhens<
	Ws extends readonly MergeWhen[],
	Tbl extends Table,
	Item extends ScopeItem,
	L extends ScopeLevel,
	DB,
	Ctes extends CteMap,
	M,
> = Ws extends readonly [
	infer W extends MergeWhen,
	...infer R extends readonly MergeWhen[],
]
	? ParamsOfWhens<
			R,
			Tbl,
			Item,
			L,
			DB,
			Ctes,
			ParamsOfWhen<
				W,
				Tbl,
				DmlCtx<DB, WhenLevel<W["match"], Item, L>, [], Ctes>,
				M
			>
		>
	: M;

type ParamsOfWhen<W extends MergeWhen, Tbl extends Table, C extends Ctx, M> =
	ParamsOfOpt<W["cond"], C, M, Info<"bool">> extends infer M1
		? W["action"] extends {
				readonly t: "update";
				readonly set: infer Set extends readonly SetItem[];
			}
			? ParamsOfSet<Set, Tbl, C, M1>
			: W["action"] extends {
						readonly t: "insert";
						readonly columns: infer Cols;
						readonly colInd: infer Ind extends readonly TargetInd[] | null;
						readonly values: infer Vals extends readonly Expr[];
					}
				? ParamsOfMergeInsert<
						Vals,
						Cols extends readonly string[] ? Cols : [],
						Ind,
						Tbl,
						C,
						M1
					>
				: M1
		: never;

type ParamsOfMergeInsert<
	Vals extends readonly Expr[],
	Cs extends readonly string[],
	Ind extends readonly TargetInd[] | null,
	Tbl extends Table,
	C extends Ctx,
	M,
> = ParamsOfRowInfos<
	Vals,
	TargetInfos<Cs, Ind, Tbl, C>,
	C,
	ParamsOfInds<Cs, Ind, Tbl, C, M>
>;
