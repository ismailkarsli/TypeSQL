export type ExprTag =
	| "col"
	| "num"
	| "str"
	| "blob"
	| "bool"
	| "null"
	| "param"
	| "ctime"
	| "bin"
	| "un"
	| "cast"
	| "collate"
	| "call"
	| "case"
	| "is"
	| "isdistinct"
	| "between"
	| "in"
	| "insub"
	| "intable"
	| "like"
	| "sub"
	| "exists"
	| "row"
	| "raise"
	| "default";

export type Expr = { readonly t: ExprTag; readonly [field: string]: any };

export type ColRef = {
	readonly t: "col";
	readonly schema: string | null;
	readonly tbl: string | null;
	readonly name: string;
	readonly disp: string;
};

export type WindowSpec = {
	readonly name: string | null;
	readonly partition: readonly Expr[];
	readonly order: readonly Expr[];
};

export type Call = {
	readonly t: "call";
	readonly name: string;
	readonly disp: string;
	readonly args: readonly Expr[];
	readonly star: boolean;
	readonly distinct: boolean;
	readonly order: readonly Expr[];
	readonly filter: Expr | null;
	readonly over: WindowSpec | null;
};

export type Target =
	| {
			readonly t: "expr";
			readonly e: Expr;
			readonly alias: string | null;
			readonly span: string;
	  }
	| { readonly t: "star"; readonly tbl: string | null };

export type TableRef = {
	readonly schema: string | null;
	readonly name: string;
};

export type FromTable = {
	readonly t: "table";
	readonly ref: TableRef;
	readonly alias: string | null;
};
export type FromSub = {
	readonly t: "sub";
	readonly q: SelectStmt;
	readonly alias: string | null;
};
export type FromFunc = {
	readonly t: "func";
	readonly name: string;
	readonly args: readonly Expr[];
	readonly alias: string | null;
};
export type JoinKind = "inner" | "left" | "right" | "full" | "cross";
export type FromJoin = {
	readonly t: "join";
	readonly kind: JoinKind;
	readonly l: FromItem;
	readonly r: FromItem;
	readonly on: Expr | null;
	readonly using: readonly string[] | null;
	readonly natural: boolean;
};
export type FromItem = FromTable | FromSub | FromFunc | FromJoin;

export type Cte = {
	readonly name: string;
	readonly display: string;
	readonly cols: readonly { readonly v: string; readonly n: string }[] | null;
	readonly q: SelectStmt;
};
export type WithClause = {
	readonly recursive: boolean;
	readonly ctes: readonly Cte[];
};

export type NamedWindow = { readonly name: string; readonly spec: WindowSpec };

export type SimpleSelect = {
	readonly t: "simple";
	readonly distinct: boolean;
	readonly targets: readonly Target[];
	readonly from: FromItem | null;
	readonly where: Expr | null;
	readonly groupBy: readonly Expr[] | null;
	readonly having: Expr | null;
	readonly windows: readonly NamedWindow[];
};
export type ValuesBody = {
	readonly t: "values";
	readonly rows: readonly (readonly Expr[])[];
};
export type SetOp = {
	readonly t: "setop";
	readonly op: "union" | "intersect" | "except";
	readonly all: boolean;
	readonly l: SelectBody;
	readonly r: SelectBody;
};
export type SelectBody = SimpleSelect | ValuesBody | SetOp;

export type SelectStmt = {
	readonly t: "select";
	readonly with: WithClause | null;
	readonly body: SelectBody;
	readonly orderBy: readonly Expr[];
	readonly limit: Expr | null;
	readonly offset: Expr | null;
};

export type SetItem = {
	readonly cols: readonly string[];
	readonly e: Expr;
};

export type Upsert = {
	readonly target: readonly Expr[] | null;
	readonly where: Expr | null;
	readonly set: readonly SetItem[] | null;
	readonly setWhere: Expr | null;
};

export type InsertSource =
	| { readonly t: "values"; readonly rows: readonly (readonly Expr[])[] }
	| { readonly t: "select"; readonly q: SelectStmt }
	| { readonly t: "default" };

export type InsertStmt = {
	readonly t: "insert";
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly alias: string | null;
	readonly columns: readonly string[] | null;
	readonly source: InsertSource;
	readonly upsert: readonly Upsert[];
	readonly returning: readonly Target[] | null;
};
export type UpdateStmt = {
	readonly t: "update";
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly alias: string | null;
	readonly set: readonly SetItem[];
	readonly from: FromItem | null;
	readonly where: Expr | null;
	readonly returning: readonly Target[] | null;
};
export type DeleteStmt = {
	readonly t: "delete";
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly alias: string | null;
	readonly where: Expr | null;
	readonly returning: readonly Target[] | null;
};
export type DmlStmt = InsertStmt | UpdateStmt | DeleteStmt;

export type ColumnDef = {
	readonly name: string;
	readonly type: string;
	readonly notNull: boolean;
	readonly hasDefault: boolean;
	readonly generated: boolean;
	readonly primaryKey: boolean | "desc";
};

export type CreateTable = {
	readonly t: "create_table";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly columns: readonly ColumnDef[];
	readonly pk: readonly string[];
	readonly withoutRowid: boolean;
	readonly strict: boolean;
};
export type CreateTableAs = {
	readonly t: "create_table_as";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly q: SelectStmt;
};
export type AlterAction =
	| { readonly t: "rename_table"; readonly to: string }
	| { readonly t: "rename_column"; readonly from: string; readonly to: string }
	| { readonly t: "add_column"; readonly col: ColumnDef }
	| { readonly t: "drop_column"; readonly name: string };
export type AlterTable = {
	readonly t: "alter_table";
	readonly table: TableRef;
	readonly action: AlterAction;
};
export type DropStmt = {
	readonly t: "drop";
	readonly kind: "table" | "view" | "index" | "trigger";
	readonly ifExists: boolean;
	readonly name: TableRef;
};
export type CreateView = {
	readonly t: "create_view";
	readonly ifNotExists: boolean;
	readonly view: TableRef;
	readonly cols: readonly { readonly v: string; readonly n: string }[] | null;
	readonly q: SelectStmt;
};
export type CreateIndex = {
	readonly t: "create_index";
	readonly table: TableRef;
	readonly cols: readonly Expr[];
	readonly where: Expr | null;
};
export type CreateVirtual = {
	readonly t: "virtual";
	readonly module: string;
	readonly table: TableRef;
	readonly cols: readonly string[];
};
export type NoopStmt = { readonly t: "noop"; readonly what: string };

export type DdlStmt =
	| CreateTable
	| CreateTableAs
	| AlterTable
	| DropStmt
	| CreateView
	| CreateIndex
	| CreateVirtual
	| NoopStmt;

export type Stmt = SelectStmt | DmlStmt | DdlStmt;
