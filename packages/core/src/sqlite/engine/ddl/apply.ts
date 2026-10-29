import type {
	DelKey,
	Rebuild,
	RenameKey,
	SetKey,
} from "../../../engine/object.js";
import type { Nx } from "../../../engine/parse.js";
import type { Toks } from "../../../engine/tokens.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { Table, View } from "../../../schema.js";
import type {
	AlterTable,
	ColumnDef,
	CreateTable,
	CreateTableAs,
	CreateView,
	CreateVirtual,
	DmlStmt,
	DropStmt,
	SelectStmt,
	Stmt,
	TableRef,
} from "../ast.js";
import type { FindKey, LookupRelation, UniqueCells } from "../binder/scope.js";
import type { Lex } from "../lexer.js";
import type { ParseScript } from "../parser/stmt.js";
import type { ProjectDml } from "../project/dml.js";
import type { ProjectSelect } from "../project/select.js";
import type { Cell, NormalizeType } from "../types.js";

export type ApplyDdlAll<DB, Q extends string> =
	Lex<Q> extends infer T
		? T extends Toks
			? ParseScript<T> extends infer S
				? S extends readonly Stmt[]
					? ApplyLoop<DB, S, 0>
					: S
				: never
			: T
		: never;

type ApplyLoop<
	DB,
	S extends readonly Stmt[],
	I extends number,
> = S[I] extends infer St extends Stmt
	? ApplyOne<DB, St> extends infer DB2
		? DB2 extends AnyErr
			? DB2
			: ApplyLoop<DB2, S, Nx<I>>
		: never
	: DB;

export type ApplyOne<DB, S extends Stmt> = S extends {
	readonly t: "create_table";
}
	? CreateTableEffect<DB, Extract<S, CreateTable>>
	: S extends { readonly t: "create_table_as" }
		? CtasEffect<DB, Extract<S, CreateTableAs>>
		: S extends { readonly t: "create_view" }
			? CreateViewEffect<DB, Extract<S, CreateView>>
			: S extends { readonly t: "alter_table" }
				? AlterEffect<DB, Extract<S, AlterTable>>
				: S extends { readonly t: "drop" }
					? DropEffect<DB, Extract<S, DropStmt>>
					: S extends { readonly t: "virtual" }
						? VirtualEffect<DB, Extract<S, CreateVirtual>>
						: S extends { readonly t: "create_index" }
							? IndexEffect<DB, S>
							: S extends { readonly t: "select" }
								? ProjectSelect<
										Extract<S, SelectStmt>,
										DB,
										[],
										{}
									> extends infer X
									? X extends AnyErr
										? X
										: DB
									: never
								: S extends { readonly t: "insert" | "update" | "delete" }
									? ProjectDml<Extract<S, DmlStmt>, DB, {}> extends infer X
										? X extends AnyErr
											? X
											: DB
										: never
									: DB;

type Exists<DB, Ref extends TableRef> =
	LookupRelation<DB, Ref> extends [unknown, string] ? true : false;

type CreateTableEffect<DB, S extends CreateTable> =
	LookupRelation<DB, S["table"]> extends [infer Rel, infer K extends string]
		? S["ifNotExists"] extends true
			? DB
			: SqlError<
					`${Rel extends View<Table> ? "view" : "table"} ${K} already exists`,
					null
				>
		: TableFromDefs<S> extends infer Tbl
			? Tbl extends AnyErr
				? Tbl
				: SetKey<DB, DisplayName<S>, Tbl>
			: never;

type DisplayName<S extends { readonly table: TableRef }> = S extends {
	readonly display: infer D extends string;
}
	? D
	: S["table"]["name"];

type ColumnPks<
	Cols extends readonly ColumnDef[],
	Acc extends readonly string[] = [],
> = Cols extends readonly [
	infer H extends ColumnDef,
	...infer R extends readonly ColumnDef[],
]
	? ColumnPks<
			R,
			H["primaryKey"] extends false ? Acc : [...Acc, Lowercase<H["name"]>]
		>
	: Acc;

type DupName<
	Cols extends readonly ColumnDef[],
	Seen extends string = never,
> = Cols extends readonly [
	infer H extends ColumnDef,
	...infer R extends readonly ColumnDef[],
]
	? Lowercase<H["name"]> extends Seen
		? H["name"]
		: DupName<R, Seen | Lowercase<H["name"]>>
	: null;

type StrictTypes = "int" | "integer" | "real" | "text" | "blob" | "any";

type StrictCheck<
	S extends CreateTable,
	Cols extends readonly ColumnDef[],
> = S["strict"] extends true
	? Cols extends readonly [
			infer H extends ColumnDef,
			...infer R extends readonly ColumnDef[],
		]
		? H["type"] extends ""
			? SqlError<
					`missing datatype for ${S["table"]["name"]}.${H["name"]}`,
					null
				>
			: Lowercase<H["type"]> extends StrictTypes
				? StrictCheck<S, R>
				: SqlError<
						`unknown datatype for ${S["table"]["name"]}.${H["name"]}: "${H["type"]}"`,
						null
					>
		: true
	: true;

type TableFromDefs<S extends CreateTable> =
	DupName<S["columns"]> extends infer D extends string
		? SqlError<`duplicate column name: ${D}`, null>
		: StrictCheck<S, S["columns"]> extends infer E
			? E extends AnyErr
				? E
				: ColumnPks<S["columns"]> extends infer CP extends readonly string[]
					? CP["length"] extends 0 | 1
						? CP["length"] extends 1
							? S["pk"]["length"] extends 0
								? BuildTable<S, CP>
								: SqlError<
										`table "${S["table"]["name"]}" has more than one primary key`,
										null
									>
							: BuildTable<S, LowerAll<S["pk"]>>
						: SqlError<
								`table "${S["table"]["name"]}" has more than one primary key`,
								null
							>
					: never
			: never;
type LowerAll<L extends readonly string[]> = {
	[I in keyof L]: Lowercase<L[I]>;
};

type Indexed<L extends readonly unknown[]> = {
	[I in keyof L]: {
		readonly c: L[I];
		readonly i: I extends `${infer N extends number}` ? N : 0;
	};
};

type BuildTable<S extends CreateTable, Pk extends readonly string[]> = Rebuild<{
	[D in Indexed<S["columns"]>[number] as D["c"]["name"]]: ColDesc<
		D["c"],
		D["i"],
		Pk,
		S
	>;
}>;

type IsRowidAlias<
	C extends ColumnDef,
	Pk extends readonly string[],
	S extends CreateTable,
> = S["withoutRowid"] extends true
	? false
	: Pk extends readonly [Lowercase<C["name"]>]
		? Lowercase<C["type"]> extends "integer"
			? C["primaryKey"] extends "desc"
				? false
				: true
			: false
		: false;

type ColDesc<
	C extends ColumnDef,
	I extends number,
	Pk extends readonly string[],
	S extends CreateTable,
> =
	IsRowidAlias<C, Pk, S> extends true
		? {
				readonly type: "integer";
				readonly nullable: false;
				readonly hasDefault: true;
				readonly i: I;
				readonly rowid: true;
			}
		: {
				readonly type: NormalizeType<C["type"]>;
				readonly nullable: C["notNull"] extends true
					? false
					: Lowercase<C["name"]> extends Pk[number]
						? S["strict"] extends true
							? false
							: S["withoutRowid"] extends true
								? false
								: true
						: true;
				readonly hasDefault: C["hasDefault"];
				readonly i: I;
			} & GeneratedFlag<C>;

type GeneratedFlag<C extends ColumnDef> = C["generated"] extends true
	? { readonly generated: true }
	: {};

type CtasEffect<DB, S extends CreateTableAs> =
	Exists<DB, S["table"]> extends true
		? S["ifNotExists"] extends true
			? DB
			: SqlError<`table ${S["table"]["name"]} already exists`, null>
		: ProjectSelect<S["q"], DB, [], {}> extends infer C
			? C extends readonly Cell[]
				? SetKey<
						DB,
						S["table"]["name"],
						CellsTable<UniqueCells<C>, CtasTypes<S["q"], C>>
					>
				: C
			: never;

type CtasTypes<
	Q extends SelectStmt,
	C extends readonly Cell[],
> = Q["body"] extends {
	readonly t: "simple";
	readonly targets: infer Ts extends readonly unknown[];
}
	? CtasLoop<Ts, C, 0, []>
	: { [I in keyof C]: "any" };
type CtasLoop<
	Ts extends readonly unknown[],
	C extends readonly Cell[],
	I extends number,
	Acc extends readonly unknown[],
> = Ts[I] extends { readonly t: "expr"; readonly e: infer E }
	? CtasLoop<
			Ts,
			C,
			Nx<I>,
			[
				...Acc,
				E extends { readonly t: "col" }
					? CtasAffinity<C[I]["t"]["type"]>
					: "any",
			]
		>
	: Ts[I] extends { readonly t: "star" }
		? { [K in keyof C]: CtasAffinity<C[K]["t"]["type"]> }
		: Acc;
type CtasAffinity<T extends string> =
	import("../types.js").Affinity<T> extends infer A
		? A extends "integer"
			? "int"
			: A extends "numeric"
				? "num"
				: A extends "blob" | "null" | "unknown"
					? "any"
					: A
		: never;

type CellsTable<
	C extends readonly Cell[],
	Types extends readonly unknown[],
> = Rebuild<{
	[D in Indexed<C>[number] as D["c"]["n"]]: {
		readonly type: Types[D["i"]] extends string ? Types[D["i"]] : "any";
		readonly nullable: true;
		readonly hasDefault: false;
		readonly i: D["i"];
	};
}>;

type ViewCols<C extends readonly Cell[]> = Rebuild<{
	[D in Indexed<C>[number] as D["c"]["n"]]: {
		readonly type: D["c"]["t"]["type"];
		readonly nullable: D["c"]["t"]["nullable"];
		readonly hasDefault: false;
		readonly i: D["i"];
	};
}>;

type CreateViewEffect<DB, S extends CreateView> =
	LookupRelation<DB, S["view"]> extends [infer Rel, infer K extends string]
		? S["ifNotExists"] extends true
			? DB
			: SqlError<
					`${Rel extends View<Table> ? "view" : "table"} ${K} already exists`,
					null
				>
		: ProjectSelect<S["q"], DB, [], {}> extends infer C
			? C extends readonly Cell[]
				? (
						S["cols"] extends readonly { readonly n: string }[]
							? S["cols"]["length"] extends C["length"]
								? RenameCells<C, S["cols"]>
								: SqlError<
										`expected ${S["cols"]["length"]} columns for '${S["view"]["name"]}' but got ${C["length"]}`,
										null
									>
							: UniqueCells<C>
					) extends infer R
					? R extends readonly Cell[]
						? ViewCols<R> extends infer V extends Table
							? SetKey<DB, S["view"]["name"], View<V>>
							: never
						: R
					: never
				: C
			: never;

type RenameCells<
	C extends readonly Cell[],
	N extends readonly { readonly n: string }[],
> = {
	[I in keyof C]: {
		readonly n: N[I & keyof N] extends { readonly n: infer X extends string }
			? X
			: C[I]["n"];
		readonly t: C[I]["t"];
	};
};

type AlterEffect<DB, S extends AlterTable> =
	LookupRelation<DB, S["table"]> extends [infer Rel, infer K extends string]
		? Rel extends View<Table>
			? SqlError<`Cannot add a column to a view`, null>
			: Rel extends Table
				? S["action"] extends {
						readonly t: "rename_table";
						readonly to: infer To extends string;
					}
					? Exists<DB, { schema: null; name: Lowercase<To> }> extends true
						? SqlError<
								`there is already another table or index with this name: ${To}`,
								null
							>
						: RenameKey<DB, K, To>
					: AlterColumns<Rel, S["action"]> extends infer Tbl
						? Tbl extends AnyErr
							? Tbl
							: SetKey<DB, K, Tbl>
						: never
				: SqlError<`no such table: ${S["table"]["name"]}`, null>
		: SqlError<`no such table: ${S["table"]["name"]}`, null>;

type MaxIndex<Rel> = {
	[P in keyof Rel]: Rel[P] extends { readonly i: infer N extends number }
		? N
		: never;
}[keyof Rel];

type AlterColumns<Rel extends Table, A> = A extends {
	readonly t: "rename_column";
	readonly from: infer F extends string;
	readonly to: infer To extends string;
}
	? FindKey<Rel, F> extends infer Old extends string
		? [Old] extends [never]
			? SqlError<`no such column: "${F}"`, null>
			: [FindKey<Rel, Lowercase<To>>] extends [never]
				? RenameKey<Rel, Old, To>
				: SqlError<`duplicate column name: ${To}`, null>
		: never
	: A extends {
				readonly t: "add_column";
				readonly col: infer C extends ColumnDef;
			}
		? [FindKey<Rel, Lowercase<C["name"]>>] extends [never]
			? C["primaryKey"] extends false
				? SetKey<Rel, C["name"], AddedCol<C, Rel>>
				: SqlError<"Cannot add a PRIMARY KEY column", null>
			: SqlError<`duplicate column name: ${C["name"]}`, null>
		: A extends {
					readonly t: "drop_column";
					readonly name: infer N extends string;
				}
			? FindKey<Rel, N> extends infer Old extends string
				? [Old] extends [never]
					? SqlError<`no such column: "${N}"`, null>
					: Rel[Old] extends { readonly rowid: true }
						? SqlError<`cannot drop PRIMARY KEY column: "${Old}"`, null>
						: [Exclude<keyof Rel, Old>] extends [never]
							? SqlError<
									`cannot drop column "${Old}": no other columns exist`,
									null
								>
							: DelKey<Rel, Old>
				: never
			: Rel;

type AddedCol<C extends ColumnDef, Rel> = {
	readonly type: NormalizeType<C["type"]>;
	readonly nullable: C["notNull"] extends true ? false : true;
	readonly hasDefault: C["hasDefault"];
	readonly i: [MaxIndex<Rel>] extends [never] ? 0 : Nx<MaxOf<MaxIndex<Rel>>>;
} & GeneratedFlag<C>;
type MaxOf<U extends number, A extends unknown[] = []> = [U] extends [never]
	? 0
	: [Exclude<U, A["length"]>] extends [never]
		? A["length"]
		: MaxOf<Exclude<U, A["length"]>, [...A, 0]>;

type DropEffect<DB, S extends DropStmt> = S["kind"] extends "table" | "view"
	? LookupRelation<DB, S["name"]> extends [infer Rel, infer K extends string]
		? S["kind"] extends "table"
			? Rel extends View<Table>
				? SqlError<`use DROP VIEW to delete view ${K}`, null>
				: DelKey<DB, K>
			: Rel extends View<Table>
				? DelKey<DB, K>
				: SqlError<`use DROP TABLE to delete table ${K}`, null>
		: S["ifExists"] extends true
			? DB
			: SqlError<`no such ${S["kind"]}: ${S["name"]["name"]}`, null>
	: DB;

type IndexEffect<DB, S> = S extends {
	readonly table: infer Ref extends TableRef;
}
	? Exists<DB, Ref> extends true
		? DB
		: SqlError<`no such table: main.${Ref["name"]}`, null>
	: DB;

type VirtualEffect<DB, S extends CreateVirtual> =
	Exists<DB, S["table"]> extends true
		? SqlError<`table ${S["table"]["name"]} already exists`, null>
		: SetKey<
				DB,
				S["table"]["name"],
				Rebuild<
					{
						[D in Indexed<S["cols"]>[number] as D["c"] & string]: {
							readonly type: "any";
							readonly nullable: true;
							readonly hasDefault: false;
							readonly i: D["i"];
						};
					} & FtsHidden<S>
				>
			>;

type FtsHidden<S extends CreateVirtual> = S["module"] extends
	| "fts3"
	| "fts4"
	| "fts5"
	? {
			readonly [K in S["table"]["name"]]: HiddenCol<"any">;
		} & (S["module"] extends "fts5" ? { readonly rank: HiddenCol<"real"> } : {})
	: {};
type HiddenCol<T extends string> = {
	readonly type: T;
	readonly nullable: true;
	readonly hasDefault: true;
	readonly hidden: true;
};
