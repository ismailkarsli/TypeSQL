import type {
	AppendIndex,
	ColumnPks,
	DupName,
	Indexed,
	LowerAll,
	PositionOrder,
	Without,
} from "../../../engine/family/ddl.js";
import type {
	NameAt,
	NamedAt,
	Unlocated,
} from "../../../engine/family/diagnostics.js";
import type { FindKey, RenameCells } from "../../../engine/family/scope.js";
import type { QueryContext } from "../../../engine/family/types.js";
import type { Next } from "../../../engine/next.js";
import type { Add } from "../../../engine/num.js";
import type {
	DelKey,
	Rebuild,
	RenameKey,
	SetKey,
	Simplify,
} from "../../../engine/object.js";
import type { Toks, TooLong, TooManyTokens } from "../../../engine/tokens.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Shaped, Table, TsShape, View } from "../../../schema.js";
import type {
	AlterAction,
	AlterTable,
	ColumnDef,
	ColumnPlace,
	CreateIndex,
	CreateTable,
	CreateTableAs,
	CreateTableLike,
	CreateView,
	DmlStmt,
	DropStmt,
	Expr,
	RenameTable,
	SelectStmt,
	Stmt,
	TableRef,
} from "../ast.js";
import type { DupCell, LookupRelation, NoTable } from "../binder/scope.js";
import type { Lex } from "../lexer.js";
import type { ParseScript } from "../parser/stmt.js";
import type { SyntaxWords } from "../parser/util.js";
import type { ProjectDml } from "../project/dml.js";
import type { ProjectSelect } from "../project/select.js";
import type { Cell } from "../types.js";

export type ApplyDdlAll<DB, Q extends string> = Unlocated<
	ApplyScript<DB, Q>,
	SyntaxWords
>;
type ApplyScript<DB, Q extends string> =
	Lex<Q> extends infer T extends Toks
		? TooManyTokens<T> extends true
			? TooLong<T>
			: ParseScript<T> extends infer S extends readonly Stmt[]
				? ApplyLoop<DB, S, 0>
				: ParseScript<T>
		: Lex<Q>;

type ApplyLoop<
	DB,
	S extends readonly Stmt[],
	I extends number,
> = S[I] extends infer St extends Stmt
	? ApplyOne<DB, St> extends AnyErr
		? ApplyOne<DB, St>
		: ApplyLoop<ApplyOne<DB, St>, S, Next<I>>
	: DB;

type TopEnv<DB> = QueryContext<DB, [], {}>;

export type ApplyOne<DB, S extends Stmt> = S extends {
	readonly t: "create_table";
}
	? CreateTableEffect<DB, Extract<S, CreateTable>>
	: S extends { readonly t: "create_table_like" }
		? CreateLikeEffect<DB, Extract<S, CreateTableLike>>
		: S extends { readonly t: "create_table_as" }
			? CtasEffect<DB, Extract<S, CreateTableAs>>
			: S extends { readonly t: "create_view" }
				? CreateViewEffect<DB, Extract<S, CreateView>>
				: S extends { readonly t: "alter_table" }
					? AlterEffect<DB, Extract<S, AlterTable>>
					: S extends { readonly t: "rename_table" }
						? RenameEffect<DB, Extract<S, RenameTable>["pairs"], 0>
						: S extends { readonly t: "drop" }
							? DropEffect<DB, Extract<S, DropStmt>, 0>
							: S extends { readonly t: "create_index" }
								? IndexEffect<DB, Extract<S, CreateIndex>>
								: S extends { readonly t: "drop_index" | "truncate" }
									? S extends { readonly table: infer Ref extends TableRef }
										? Exists<DB, Ref> extends true
											? DB
											: NoTable<Ref>
										: DB
									: S extends { readonly t: "select" }
										? ProjectSelect<
												Extract<S, SelectStmt>,
												TopEnv<DB>
											> extends infer X
											? X extends AnyErr
												? X
												: DB
											: never
										: S extends { readonly t: "insert" | "update" | "delete" }
											? ProjectDml<Extract<S, DmlStmt>, DB, {}> extends AnyErr
												? ProjectDml<Extract<S, DmlStmt>, DB, {}>
												: DB
											: DB;

type IndexEffect<DB, S extends CreateIndex> =
	LookupRelation<DB, S["table"]> extends [infer Rel, string]
		? MissingKey<Rel, S["cols"][number]> extends infer N extends string
			? [N] extends [never]
				? FunctionalIndex<DB, S>
				: SqlError<
						`Key column '${N}' doesn't exist in table`,
						NamedAt<N, "column">
					>
			: never
		: NoTable<S["table"]>;

/** A named key column the relation doesn't have (MySQL's names are case-insensitive). */
type MissingKey<Rel, N extends string> = N extends N
	? [FindKey<Rel, Lowercase<N>>] extends [never]
		? N
		: never
	: never;

/** The functional key parts, checked as `SELECT <expressions> FROM <table>`. */
type FunctionalIndex<DB, S extends CreateIndex> = S["exprs"] extends readonly []
	? DB
	: ProjectSelect<
				{
					readonly t: "select";
					readonly with: null;
					readonly body: {
						readonly t: "simple";
						readonly distinct: false;
						readonly targets: ExprTargets<S["exprs"]>;
						readonly from: {
							readonly t: "table";
							readonly ref: S["table"];
							readonly alias: null;
						};
						readonly where: null;
						readonly groupBy: null;
						readonly rollup: false;
						readonly having: null;
						readonly windows: [];
					};
					readonly orderBy: [];
					readonly limit: null;
					readonly offset: null;
				},
				TopEnv<DB>
			> extends infer C
		? C extends SqlError<`Unknown column '${infer N}'${string}`, infer At>
			? SqlError<`Unknown column '${N}' in 'functional index'`, At>
			: C extends AnyErr
				? C
				: DB
		: never;

type ExprTargets<Es extends readonly Expr[]> = {
	readonly [K in keyof Es]: {
		readonly t: "expr";
		readonly e: Es[K];
		readonly alias: null;
		readonly span: "";
		readonly tail: "";
	};
};

type Exists<DB, Ref extends TableRef> =
	LookupRelation<DB, Ref> extends [unknown, string] ? true : false;

type AlreadyExists<Ref extends TableRef> = SqlError<
	`Table '${Ref["name"]}' already exists`,
	NamedAt<Ref["name"]>
>;

type CreateTableEffect<DB, S extends CreateTable> =
	Exists<DB, S["table"]> extends true
		? S["ifNotExists"] extends true
			? DB
			: AlreadyExists<S["table"]>
		: TableFromDefs<S["columns"], LowerAll<S["pk"]>> extends AnyErr
			? TableFromDefs<S["columns"], LowerAll<S["pk"]>>
			: SetKey<
					DB,
					S["table"]["name"],
					TableFromDefs<S["columns"], LowerAll<S["pk"]>>
				>;

type TableFromDefs<
	Cols extends readonly ColumnDef[],
	Pk extends readonly string[],
> = Cols extends readonly []
	? SqlError<"A table must have at least 1 column", null>
	: DupName<Cols> extends infer D extends string
		? SqlError<`Duplicate column name '${D}'`, NameAt<Lowercase<D>>>
		: ColumnPks<Cols> extends infer CP extends readonly string[]
			? CP["length"] extends 0
				? BuildTable<Cols, Pk>
				: [CP["length"], Pk["length"]] extends [1, 0]
					? BuildTable<Cols, CP>
					: SqlError<"Multiple primary key defined", null>
			: never;

type BuildTable<
	Cols extends readonly ColumnDef[],
	Pk extends readonly string[],
> = Rebuild<{
	[D in Indexed<Cols>[number] as D["c"]["name"]]: ColDesc<D["c"], D["i"], Pk>;
}>;

type ColType<C extends ColumnDef> = C["enumValues"] extends string
	? C["type"] extends "enum"
		? Shaped<"enum", TsShape<C["enumValues"]>>
		: C["type"]
	: C["type"];

type ColDesc<
	C extends ColumnDef,
	I extends number,
	Pk extends readonly string[],
> = MkCol<
	ColType<C>,
	C["notNull"] extends true
		? false
		: Lowercase<C["name"]> extends Pk[number]
			? false
			: C["primaryKey"] extends true
				? false
				: C["notNull"] extends false
					? true
					: C["autoInc"] extends true
						? false
						: true,
	C["hasDefault"],
	I,
	C["generated"],
	C["autoInc"],
	C["invisible"]
>;

// A column is built from plain values only, so equal columns of different
// tables are one type, and a schema holds no statement's syntax tree. Each
// later statement copies every table of the schema, which then stays cheap.
// The shape is that of schema/index.ts's Col: a set flag is a property, an
// unset one is absent.
type MkCol<
	Ty,
	N extends boolean,
	H extends boolean,
	I extends number,
	G extends boolean,
	AI extends boolean,
	Hid extends boolean,
> = [G, AI, Hid] extends [false, false, false]
	? {
			readonly type: Ty;
			readonly nullable: N;
			readonly hasDefault: H;
			readonly i: I;
		}
	: Simplify<
			{
				readonly type: Ty;
				readonly nullable: N;
				readonly hasDefault: H;
				readonly i: I;
			} & (G extends true ? { readonly generated: true } : {}) &
				(AI extends true ? { readonly autoIncrement: true } : {}) &
				(Hid extends true ? { readonly hidden: true } : {})
		>;

/** `Col` rebuilt from its own values, with `Over`'s in place of them. */
type Remake<
	Col,
	Over extends {
		readonly nullable?: boolean;
		readonly hasDefault?: boolean;
		readonly i?: number;
		readonly hidden?: boolean;
	} = {},
> = MkCol<
	Col extends { readonly type: infer T } ? T : "unknown",
	Over extends { readonly nullable: infer N extends boolean }
		? N
		: Col extends { readonly nullable: infer N extends boolean }
			? N
			: true,
	Over extends { readonly hasDefault: infer H extends boolean }
		? H
		: Col extends { readonly hasDefault: infer H extends boolean }
			? H
			: false,
	Over extends { readonly i: infer I extends number }
		? I
		: Col extends { readonly i: infer I extends number }
			? I
			: 0,
	Col extends { readonly generated: true } ? true : false,
	Col extends { readonly autoIncrement: true } ? true : false,
	Over extends { readonly hidden: infer V extends boolean }
		? V
		: Col extends { readonly hidden: true }
			? true
			: false
>;

type CreateLikeEffect<DB, S extends CreateTableLike> =
	Exists<DB, S["table"]> extends true
		? S["ifNotExists"] extends true
			? DB
			: AlreadyExists<S["table"]>
		: LookupRelation<DB, S["like"]> extends [infer Rel, string]
			? Rel extends View<Table>
				? SqlError<`'${S["like"]["name"]}' is not BASE TABLE`, null>
				: SetKey<DB, S["table"]["name"], Rel>
			: NoTable<S["like"]>;

type CtasEffect<DB, S extends CreateTableAs> =
	Exists<DB, S["table"]> extends true
		? S["ifNotExists"] extends true
			? DB
			: AlreadyExists<S["table"]>
		: ProjectSelect<S["q"], TopEnv<DB>> extends infer C extends readonly Cell[]
			? DupCell<C> extends infer D extends AnyErr
				? D
				: SetKey<DB, S["table"]["name"], CtasTable<S["columns"], C>>
			: ProjectSelect<S["q"], TopEnv<DB>>;

/** Defined columns first, then the query's columns that aren't defined. */
type CtasTable<
	Defs extends readonly ColumnDef[],
	C extends readonly Cell[],
> = Rebuild<
	{
		[D in Indexed<Defs>[number] as D["c"]["name"]]: ColDesc<D["c"], D["i"], []>;
	} & {
		[D in Indexed<C>[number] as Lowercase<D["c"]["n"]> extends Lowercase<
			Defs[number]["name"]
		>
			? never
			: D["c"]["n"]]: MkCol<
			D["c"]["t"]["type"] extends "null" | "unknown"
				? "binary"
				: D["c"]["t"]["type"],
			D["c"]["t"]["nullable"],
			true,
			Add<Defs["length"], D["i"]>,
			false,
			false,
			false
		>;
	}
>;

type ViewCols<C extends readonly Cell[]> = Rebuild<{
	[D in Indexed<C>[number] as D["c"]["n"]]: MkCol<
		D["c"]["t"]["type"],
		D["c"]["t"]["nullable"],
		false,
		D["i"],
		false,
		false,
		false
	>;
}>;

type CreateViewEffect<DB, S extends CreateView> =
	LookupRelation<DB, S["view"]> extends [infer Rel, infer K extends string]
		? S["ifNotExists"] extends true
			? DB
			: S["orReplace"] extends true
				? Rel extends View<Table>
					? BuildView<DelKey<DB, K>, S>
					: SqlError<`'${K}' is not VIEW`, null>
				: AlreadyExists<S["view"]>
		: BuildView<DB, S>;

type BuildView<DB, S extends CreateView> =
	ProjectSelect<S["q"], TopEnv<DB>> extends infer C extends readonly Cell[]
		? (
				S["cols"] extends readonly { readonly n: string }[]
					? S["cols"]["length"] extends C["length"]
						? RenameCells<C, S["cols"]>
						: SqlError<
								"In definition of view, derived table or common table expression, SELECT list and column names list have different column counts",
								null
							>
					: C
			) extends infer R
			? R extends readonly Cell[]
				? DupCell<R> extends infer D extends AnyErr
					? D
					: ViewCols<R> extends infer V extends Table
						? SetKey<DB, S["view"]["name"], View<V>>
						: never
				: R
			: never
		: ProjectSelect<S["q"], TopEnv<DB>>;

type AlterEffect<DB, S extends AlterTable> =
	LookupRelation<DB, S["table"]> extends [infer Rel, infer K extends string]
		? Rel extends View<Table>
			? SqlError<`'${K}' is not BASE TABLE`, null>
			: Rel extends Table
				? AlterLoop<DB, K, Rel, S["actions"], 0>
				: NoTable<S["table"]>
		: NoTable<S["table"]>;

type AlterLoop<
	DB,
	K extends string,
	Rel,
	A extends readonly AlterAction[],
	I extends number,
> = A[I] extends infer Act extends AlterAction
	? Act extends {
			readonly t: "rename_table";
			readonly to: infer To extends TableRef;
		}
		? Exists<DB, To> extends true
			? AlreadyExists<To>
			: AlterLoop<RenameKey<DB, K, To["name"]>, To["name"], Rel, A, Next<I>>
		: AlterColumns<Rel, Act, K> extends AnyErr
			? AlterColumns<Rel, Act, K>
			: AlterLoop<DB, K, AlterColumns<Rel, Act, K>, A, Next<I>>
	: SetKey<DB, K, Rel>;

type InsertAt<
	O extends readonly string[],
	Name extends string,
	P extends ColumnPlace,
> = P extends { readonly t: "first" }
	? [Name, ...O]
	: P extends { readonly t: "after"; readonly col: infer A extends string }
		? AfterLoop<O, Name, A>
		: [...O, Name];
type AfterLoop<
	O extends readonly string[],
	Name extends string,
	A extends string,
	Acc extends readonly string[] = [],
> = O extends readonly [
	infer H extends string,
	...infer R extends readonly string[],
]
	? Lowercase<H> extends A
		? [...Acc, H, Name, ...R]
		: AfterLoop<R, Name, A, [...Acc, H]>
	: null;
type Positions<O extends readonly string[]> = {
	[D in Indexed<O>[number] as D["c"] & string]: D["i"];
};
type Reindex<Rel, O extends readonly string[]> =
	Positions<O> extends infer P
		? Rebuild<{
				[K in keyof Rel]: Remake<
					Rel[K],
					{ readonly i: K extends keyof P ? P[K] & number : never }
				>;
			}>
		: never;

/**
 * `Name` with `Desc` at `P`: appended at the end, or placed FIRST / AFTER with
 * every column renumbered. A table written without positions has no order to
 * place it in, and stays without one.
 */
type Placed<
	Rel,
	Name extends string,
	Desc,
	P extends ColumnPlace,
> = P extends null
	? SetKey<Rel, Name, Remake<Desc, { readonly i: AppendIndex<Rel> }>>
	: PositionOrder<Rel, keyof Rel & string> extends infer O extends
				readonly string[]
		? InsertAt<Without<O, Name>, Name, P> extends infer O2 extends
				readonly string[]
			? Reindex<SetKey<Rel, Name, Desc>, O2>
			: UnknownAfter<P, Name>
		: P extends { readonly col: infer A extends string }
			? [Exclude<FindKey<Rel, A>, Name>] extends [never]
				? UnknownAfter<P, Name>
				: SetKey<Rel, Name, Desc>
			: SetKey<Rel, Name, Desc>;
type UnknownAfter<P, Name extends string> = P extends {
	readonly col: infer A extends string;
}
	? SqlError<`Unknown column '${A}' in '${Name}'`, NamedAt<A, "column">>
	: never;

type AddedCol<C extends ColumnDef> = ColDesc<C, 0, []>;

type AlterColumns<Rel, A, K extends string> = A extends {
	readonly t: "rename_column";
	readonly from: infer F extends string;
	readonly to: infer To extends string;
}
	? FindKey<Rel, F> extends infer Old extends string
		? [Old] extends [never]
			? SqlError<`Unknown column '${F}' in '${K}'`, NamedAt<F, "column">>
			: [Exclude<FindKey<Rel, Lowercase<To>>, Old>] extends [never]
				? RenameKey<Rel, Old, To>
				: SqlError<`Duplicate column name '${To}'`, NameAt<Lowercase<To>>>
		: never
	: A extends {
				readonly t: "add_column";
				readonly col: infer C extends ColumnDef;
				readonly place: infer P extends ColumnPlace;
				readonly ifNotExists: infer Ine;
			}
		? [FindKey<Rel, Lowercase<C["name"]>>] extends [never]
			? C["primaryKey"] extends true
				? HasPk<Rel> extends true
					? SqlError<"Multiple primary key defined", null>
					: Placed<Rel, C["name"], AddedCol<C>, P>
				: Placed<Rel, C["name"], AddedCol<C>, P>
			: Ine extends true
				? Rel
				: SqlError<
						`Duplicate column name '${C["name"]}'`,
						NameAt<Lowercase<C["name"]>>
					>
		: A extends {
					readonly t: "change_column";
					readonly from: infer F extends string;
					readonly col: infer C extends ColumnDef;
					readonly place: infer P extends ColumnPlace;
				}
			? FindKey<Rel, F> extends infer Old extends string & keyof Rel
				? [Old] extends [never]
					? SqlError<`Unknown column '${F}' in '${K}'`, NamedAt<F, "column">>
					: [Exclude<FindKey<Rel, Lowercase<C["name"]>>, Old>] extends [never]
						? P extends null
							? SetKey<
									RenameKey<Rel, Old, C["name"]>,
									C["name"],
									Remake<AddedCol<C>, { readonly i: PositionOf<Rel, Old> }>
								>
							: Placed<
									RenameKey<Rel, Old, C["name"]>,
									C["name"],
									AddedCol<C>,
									P
								>
						: SqlError<
								`Duplicate column name '${C["name"]}'`,
								NameAt<Lowercase<C["name"]>>
							>
				: never
			: A extends {
						readonly t: "drop_column";
						readonly name: infer N extends string;
						readonly ifExists: infer Ie;
					}
				? FindKey<Rel, N> extends infer Old extends string
					? [Old] extends [never]
						? Ie extends true
							? Rel
							: SqlError<
									`Can't DROP COLUMN \`${N}\`; check that it exists`,
									null
								>
						: [Exclude<keyof Rel, Old>] extends [never]
							? SqlError<
									"You can't delete all columns with ALTER TABLE; use DROP TABLE instead",
									null
								>
							: DelKey<Rel, Old>
					: never
				: A extends {
							readonly t: "column_default";
							readonly name: infer N extends string;
							readonly has: infer H extends boolean;
						}
					? FindKey<Rel, N> extends infer Old extends string & keyof Rel
						? [Old] extends [never]
							? SqlError<
									`Unknown column '${N}' in '${K}'`,
									NamedAt<N, "column">
								>
							: SetKey<Rel, Old, Remake<Rel[Old], { readonly hasDefault: H }>>
						: never
					: A extends {
								readonly t: "column_visibility";
								readonly name: infer N extends string;
								readonly invisible: infer V extends boolean;
							}
						? FindKey<Rel, N> extends infer Old extends string & keyof Rel
							? [Old] extends [never]
								? SqlError<
										`Unknown column '${N}' in '${K}'`,
										NamedAt<N, "column">
									>
								: SetKey<Rel, Old, Remake<Rel[Old], { readonly hidden: V }>>
							: never
						: A extends {
									readonly t: "add_pk";
									readonly cols: infer Cs extends readonly string[];
								}
							? HasPk<Rel> extends true
								? SqlError<"Multiple primary key defined", null>
								: NotNullCols<Rel, Cs[number]>
							: Rel;

/** A column's position, or the next free one for a schema written without positions. */
type PositionOf<Rel, K extends keyof Rel> = Rel[K] extends {
	readonly i: infer I extends number;
}
	? I
	: AppendIndex<Rel>;

/** Not tracked: a primary key added by ALTER can't be detected twice. */
type HasPk<_Rel> = false;

type NotNullCols<Rel, Cs> = Rebuild<{
	[K in keyof Rel]: Lowercase<K & string> extends Cs
		? Remake<Rel[K], { readonly nullable: false }>
		: Rel[K];
}>;

type RenameEffect<
	DB,
	P extends readonly { readonly from: TableRef; readonly to: TableRef }[],
	I extends number,
> = P[I] extends {
	readonly from: infer F extends TableRef;
	readonly to: infer T extends TableRef;
}
	? LookupRelation<DB, F> extends [unknown, infer K extends string]
		? Exists<DB, T> extends true
			? AlreadyExists<T>
			: RenameEffect<RenameKey<DB, K, T["name"]>, P, Next<I>>
		: NoTable<F>
	: DB;

type DropEffect<
	DB,
	S extends DropStmt,
	I extends number,
> = S["names"][I] extends infer Ref extends TableRef
	? LookupRelation<DB, Ref> extends [infer Rel, infer K extends string]
		? S["kind"] extends "table"
			? Rel extends View<Table>
				? SqlError<`Unknown table '${K}'`, NamedAt<K>>
				: DropEffect<DelKey<DB, K>, S, Next<I>>
			: Rel extends View<Table>
				? DropEffect<DelKey<DB, K>, S, Next<I>>
				: SqlError<`'${K}' is not VIEW`, null>
		: S["ifExists"] extends true
			? DropEffect<DB, S, Next<I>>
			: SqlError<`Unknown table '${Ref["name"]}'`, NamedAt<Ref["name"]>>
	: DB;
