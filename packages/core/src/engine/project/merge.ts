import type { Table } from "../../schema/column.js";
import type { Expr, MergeStmt, MergeWhen, SetItem, TargetInd } from "../ast.js";
import type { BindFrom } from "../binder/from.js";
import type { TableCols } from "../binder/resolve.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { ParamsOfFromItems, ParamsOfOpt } from "../typer/params.js";
import type {
	CteMap,
	Ctx,
	Info,
	MkCtx,
	NullableMap,
	Scope,
	ScopeItem,
	ScopeLevel,
} from "../types.js";
import type {
	CheckColsExist,
	CheckExpr,
	CheckInds,
	CheckNullLiterals,
	CheckOptExpr,
	CheckRequired,
	CheckSet,
	CheckValueItems,
	DmlCtx,
	NullCheckCols,
	ParamsOfInds,
	ParamsOfReturning,
	ParamsOfRowCols,
	ParamsOfRowInfos,
	ParamsOfSet,
	ProjectReturning,
	ResolveTarget,
	Target_,
	TargetInfos,
	UnionToTuple,
	WidthCheck,
} from "./dml.js";

/**
 * MERGE projection and validation (`ProjectDml` dispatches here).
 *
 * `ProjectMerge<S, DB, Outer, Ctes>` → `Cols` (RETURNING), `null` (no RETURNING) or `SqlError`.
 *
 * Scopes, as in Postgres's transformMergeStmt:
 *   - the source (`USING …`) sees neither the target nor itself (a reference to the target
 *     from inside it is `invalid reference to FROM-clause entry for table "t"`);
 *   - the join condition and `WHEN MATCHED` (condition, UPDATE SET) see target and source;
 *   - `WHEN NOT MATCHED BY SOURCE` sees only the target, `WHEN NOT MATCHED [BY TARGET]` (condition,
 *     INSERT values) only the source; the other side is `invalid reference to FROM-clause entry`;
 *   - RETURNING sees both, plus `old` / `new` and `merge_action()`.
 *
 * Checks: the target is a table (`cannot merge into view "v"`), the target and source names
 * differ (`name "t" specified more than once`), SET and INSERT columns exist, INSERT width and
 * required columns (as for INSERT), and no WHEN clause of a kind follows an unconditional one of
 * the same kind (`unreachable WHEN clause specified after unconditional WHEN clause`).
 *
 * RETURNING nullability: the source's columns are NULL for rows from a `NOT MATCHED BY SOURCE`
 * action, `old.*` for rows inserted, `new.*` for rows deleted. The target's columns are never
 * NULL-extended (the row inserted, updated or deleted).
 */
export type ProjectMerge<
	S extends MergeStmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	ResolveTarget<DB, S["table"], S["alias"], "merge into"> extends infer Tg
		? Tg extends Target_<infer Tbl extends Table, infer Item>
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

/** The source as RETURNING sees it: NULL-extended when a NOT MATCHED BY SOURCE action returns rows. */
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
	readonly [I in keyof L]: L[I] extends ScopeItem
		? {
				readonly alias: L[I]["alias"];
				readonly cols: NullableMap<L[I]["cols"]>;
				readonly skip: L[I]["skip"];
			}
		: L[I]; // type-mutate: equivalent never-false – every member of a ScopeLevel is a ScopeItem
};

/** Some WHEN clause has this action. */
type HasAction<Ws extends readonly MergeWhen[], A extends string> = [
	Extract<Ws[number]["action"], { readonly t: A }>,
] extends [never]
	? false
	: true;

/** The level a WHEN clause sees (see above) and the names it must not reference. */
type WhenLevel<
	M extends MergeWhen["match"],
	Item extends ScopeItem,
	L extends ScopeLevel,
> = M extends "matched" ? [Item, ...L] : M extends "source" ? [Item] : L;
type HiddenNames<
	M extends MergeWhen["match"],
	Item extends ScopeItem,
	L extends ScopeLevel,
> = M extends "matched" // type-mutate: equivalent cond-false – a matched clause sees both names, so no error names a hidden one
	? never
	: M extends "source"
		? L[number]["alias"]
		: Item["alias"];

/** `missing FROM-clause entry for table "x"` for a name that is there but not visible here: Postgres's wording. */
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
	: true; // type-mutate: equivalent bool-flip – ProjectMerge only looks for an error

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
					: true // type-mutate: equivalent bool-flip – CheckWhens only looks for an error
		: never;

/** `INSERT [(cols)] VALUES (…)` / `INSERT DEFAULT VALUES` (`Vals` null): the checks of INSERT. */
type CheckMergeInsert<
	Cols extends readonly string[] | null,
	Ind extends readonly TargetInd[] | null,
	Vals extends readonly Expr[] | null,
	Tbl extends Table,
	Name extends string,
	C extends Ctx,
> = Vals extends readonly Expr[]
	? Cols extends readonly string[]
		? CheckColsExist<Cols, Tbl, Name> extends infer E
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
							: CheckInds<Cols, Ind, Tbl, C> extends infer Ci
								? Ci extends AnyErr
									? Ci
									: CheckValueItems<Vals, C> extends infer V
										? V extends AnyErr
											? V
											: CheckNullLiterals<
														Vals,
														NullCheckCols<Cols, Ind>,
														Tbl,
														Name
													> extends infer N
												? N extends AnyErr
													? N
													: CheckRequired<Tbl, Cols, Name>
												: never
										: never
								: never
					: never
			: never
		: WidthCheck<Vals, UnionToTuple<keyof Tbl>> extends "more"
			? SqlError<"INSERT has more expressions than target columns", null>
			: CheckValueItems<Vals, C>
	: CheckRequired<Tbl, [], Name>;

// ───────────────────────────── parameters ─────────────────────────────

/**
 * Parameters of a MERGE: the source, the join condition and WHEN conditions (bool), UPDATE SET
 * and INSERT values like UPDATE and INSERT (a bare `$n` takes its target column's type), and
 * RETURNING. Only reached for statements that passed `ProjectMerge`.
 */
export type ParamsOfMerge<S extends MergeStmt, DB, Ctes extends CteMap, M> =
	ResolveTarget<DB, S["table"], S["alias"], "merge into"> extends infer Tg
		? Tg extends Target_<infer Tbl extends Table, infer Item>
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
										MkCtx<DB, [], Ctes, false>, // type-mutate: equivalent bool-flip – no aggregate can be directly in a FROM item
										M
									>,
									Info<"bool">
								>
							>
						>
					: M // type-mutate: equivalent never-false – only reached for statements ProjectMerge accepted, whose source binds
				: never
			: M // type-mutate: equivalent never-false – only reached for statements ProjectMerge accepted, whose target resolves
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
				? Ind extends null
					? ParamsOfRowCols<
							Vals,
							Cols extends readonly string[] ? Cols : [],
							Tbl,
							C,
							M1
						>
					: ParamsOfRowInfos<
							Vals,
							TargetInfos<
								Cols extends readonly string[] ? Cols : [], // type-mutate: equivalent never-false – an indirection comes with a column list
								Ind,
								Tbl,
								C
							>,
							C,
							ParamsOfInds<
								Cols extends readonly string[] ? Cols : [], // type-mutate: equivalent never-false – an indirection comes with a column list
								Ind,
								Tbl,
								C,
								M1
							>
						>
				: M1
		: never;
