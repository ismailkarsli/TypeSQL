export type ColRef = {
	readonly t: "col";
	readonly schema: string | null;
	readonly tbl: string | null;
	readonly name: string;
	readonly n: string;
	readonly disp: string;
};

export type NumLit = { readonly t: "num"; readonly v: string };
/** A string literal; `f` is its text as written when it differs (MySQL names a bare literal target by it). */
export type StrLit = {
	readonly t: "str";
	readonly v: string;
	readonly f?: string;
};
export type BlobLit = { readonly t: "blob"; readonly v: string };
export type BoolLit = { readonly t: "bool"; readonly v: boolean };
export type NullLit = { readonly t: "null" };
export type Param = { readonly t: "param"; readonly n: number };
/** A user variable `@name`. */
export type UserVar = { readonly t: "var"; readonly name: string };
/** `@name := expr`. */
export type Assign = {
	readonly t: "assign";
	readonly name: string;
	readonly e: Expr;
};
export type CurrentTime = {
	readonly t: "ctime";
	readonly fn:
		| "current_date"
		| "current_time"
		| "current_timestamp"
		| "localtime"
		| "localtimestamp"
		| "utc_date"
		| "utc_time"
		| "utc_timestamp"
		| "current_user";
};
export type BinOp = {
	readonly t: "bin";
	readonly op: string;
	readonly l: Expr;
	readonly r: Expr;
};
export type UnOp = { readonly t: "un"; readonly op: string; readonly e: Expr };
/** `CAST(e AS to)`, `CONVERT(e, to)` and a `DATE '…'` style literal (`lit`). */
export type Cast = {
	readonly t: "cast";
	readonly e: Expr;
	readonly to: string;
	readonly lit?: true;
};
/** `CONVERT(e USING charset)`. */
export type Convert = {
	readonly t: "convert";
	readonly e: Expr;
	readonly binary: boolean;
};
export type Collate = { readonly t: "collate"; readonly e: Expr };
export type CaseWhen = { readonly when: Expr; readonly then: Expr };
export type CaseExpr = {
	readonly t: "case";
	readonly operand: Expr | null;
	readonly whens: readonly CaseWhen[];
	readonly else: Expr | null;
};
export type IsTest = {
	readonly t: "is";
	readonly e: Expr;
	readonly what: "null" | "true" | "false";
	readonly not: boolean;
};
export type Between = {
	readonly t: "between";
	readonly e: Expr;
	readonly lo: Expr;
	readonly hi: Expr;
	readonly not: boolean;
};
export type InList = {
	readonly t: "in";
	readonly e: Expr;
	readonly list: readonly Expr[];
	readonly not: boolean;
};
export type InSub = {
	readonly t: "insub";
	readonly e: Expr;
	readonly q: SelectStmt;
	readonly not: boolean;
};
/** `l op ANY (SELECT …)` / `l op ALL (SELECT …)`; `SOME` is `ANY`. */
export type Quantified = {
	readonly t: "quant";
	readonly l: Expr;
	readonly op: string;
	readonly q: "any" | "all";
	readonly r: SelectStmt;
};
export type Like = {
	readonly t: "like";
	readonly e: Expr;
	readonly pat: Expr;
	readonly esc: Expr | null;
	readonly kind: "like" | "regexp" | "rlike";
	readonly not: boolean;
};
/** `e MEMBER OF (doc)`. */
export type MemberOf = {
	readonly t: "member";
	readonly e: Expr;
	readonly doc: Expr;
};
/** `MATCH (cols) AGAINST (against …)`. */
export type MatchAgainst = {
	readonly t: "match";
	readonly cols: readonly Expr[];
	readonly against: Expr;
};
/** `INTERVAL e unit`. */
export type Interval = {
	readonly t: "interval";
	readonly e: Expr;
	readonly unit: string;
};
export type ScalarSub = { readonly t: "sub"; readonly q: SelectStmt };
export type Exists = { readonly t: "exists"; readonly q: SelectStmt };
export type RowCtor = { readonly t: "row"; readonly items: readonly Expr[] };
export type DefaultExpr = { readonly t: "default" };

export type Expr =
	| ColRef
	| NumLit
	| StrLit
	| BlobLit
	| BoolLit
	| NullLit
	| Param
	| UserVar
	| Assign
	| CurrentTime
	| BinOp
	| UnOp
	| Cast
	| Convert
	| Collate
	| Call
	| CaseExpr
	| IsTest
	| Between
	| InList
	| InSub
	| Quantified
	| Like
	| MemberOf
	| MatchAgainst
	| Interval
	| ScalarSub
	| Exists
	| RowCtor
	| DefaultExpr;

export type ExprTag = Expr["t"];

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
	readonly over: WindowSpec | null;
};

export type Target =
	| {
			readonly t: "expr";
			readonly e: Expr;
			readonly alias: string | null;
			readonly span: string;
			/** Whitespace after a final word, which MySQL (not MariaDB) keeps in the name. */
			readonly tail: string;
	  }
	| {
			readonly t: "star";
			readonly schema: string | null;
			readonly tbl: string | null;
	  };

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
	readonly cols: readonly { readonly v: string; readonly n: string }[] | null;
	readonly lateral: boolean;
};
export type JsonTableCol =
	| {
			readonly t: "ordinality";
			readonly name: string;
	  }
	| {
			readonly t: "path";
			readonly name: string;
			readonly type: string;
			readonly exists: boolean;
	  }
	| {
			readonly t: "nested";
			readonly cols: readonly JsonTableCol[];
	  };
export type FromJsonTable = {
	readonly t: "jsontable";
	readonly doc: Expr;
	readonly cols: readonly JsonTableCol[];
	readonly alias: string | null;
};
export type JoinKind = "inner" | "left" | "right" | "cross";
export type FromJoin = {
	readonly t: "join";
	readonly kind: JoinKind;
	readonly l: FromItem;
	readonly r: FromItem;
	readonly on: Expr | null;
	readonly using: readonly string[] | null;
	readonly natural: boolean;
};
export type FromItem = FromTable | FromSub | FromJsonTable | FromJoin;

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
	readonly rollup: boolean;
	readonly having: Expr | null;
	readonly windows: readonly NamedWindow[];
};
export type ValuesBody = {
	readonly t: "values";
	readonly rows: readonly (readonly Expr[])[];
	/** MySQL's `VALUES ROW(…)` names columns `column_0`, …; MariaDB's `VALUES (…)` after the first row. */
	readonly row: boolean;
	readonly spans: readonly string[];
};
export type SetOp = {
	readonly t: "setop";
	readonly op: "union" | "intersect" | "except";
	readonly all: boolean;
	readonly l: SelectBody;
	readonly r: SelectBody;
};
/** A parenthesized query expression with its own ORDER BY or LIMIT. */
export type NestedBody = { readonly t: "nested"; readonly q: SelectStmt };
export type SelectBody = SimpleSelect | ValuesBody | SetOp | NestedBody;

export type SelectStmt = {
	readonly t: "select";
	readonly with: WithClause | null;
	readonly body: SelectBody;
	readonly orderBy: readonly Expr[];
	readonly limit: Expr | null;
	readonly offset: Expr | null;
};

export type SetItem = {
	readonly tbl: string | null;
	readonly col: string;
	readonly e: Expr;
};

export type InsertSource =
	| { readonly t: "values"; readonly rows: readonly (readonly Expr[])[] }
	| { readonly t: "select"; readonly q: SelectStmt }
	| { readonly t: "set"; readonly set: readonly SetItem[] };

export type InsertStmt = {
	readonly t: "insert";
	readonly replace: boolean;
	readonly ignore: boolean;
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly columns: readonly string[] | null;
	readonly source: InsertSource;
	/** `AS new [(cols)]` after VALUES: the row alias ON DUPLICATE KEY UPDATE can read. */
	readonly rowAlias: {
		readonly name: string;
		readonly cols: readonly string[] | null;
	} | null;
	readonly odku: readonly SetItem[] | null;
	readonly returning: readonly Target[] | null;
};
export type UpdateStmt = {
	readonly t: "update";
	readonly with: WithClause | null;
	readonly from: FromItem;
	readonly set: readonly SetItem[];
	readonly where: Expr | null;
	readonly orderBy: readonly Expr[];
	readonly limit: Expr | null;
};
export type DeleteStmt = {
	readonly t: "delete";
	readonly with: WithClause | null;
	/** Tables rows are deleted from: one for the single-table form. */
	readonly targets: readonly TableRef[];
	readonly from: FromItem;
	readonly multi: boolean;
	readonly where: Expr | null;
	readonly orderBy: readonly Expr[];
	readonly limit: Expr | null;
	readonly returning: readonly Target[] | null;
};
export type DmlStmt = InsertStmt | UpdateStmt | DeleteStmt;

export type ColumnDef = {
	readonly name: string;
	readonly type: string;
	readonly notNull: boolean | null;
	readonly hasDefault: boolean;
	readonly autoInc: boolean;
	readonly generated: boolean;
	readonly primaryKey: boolean;
	readonly invisible: boolean;
	readonly enumValues: string | null;
};

export type ColumnPlace =
	| { readonly t: "first" }
	| { readonly t: "after"; readonly col: string }
	| null;

export type CreateTable = {
	readonly t: "create_table";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly columns: readonly ColumnDef[];
	readonly pk: readonly string[];
};
export type CreateTableLike = {
	readonly t: "create_table_like";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly like: TableRef;
};
export type CreateTableAs = {
	readonly t: "create_table_as";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly columns: readonly ColumnDef[];
	readonly q: SelectStmt;
};
export type AlterAction =
	| { readonly t: "rename_table"; readonly to: TableRef }
	| { readonly t: "rename_column"; readonly from: string; readonly to: string }
	| {
			readonly t: "add_column";
			readonly col: ColumnDef;
			readonly place: ColumnPlace;
			readonly ifNotExists: boolean;
	  }
	| {
			readonly t: "change_column";
			readonly from: string;
			readonly col: ColumnDef;
			readonly place: ColumnPlace;
	  }
	| {
			readonly t: "drop_column";
			readonly name: string;
			readonly ifExists: boolean;
	  }
	| {
			readonly t: "column_default";
			readonly name: string;
			readonly has: boolean;
	  }
	| {
			readonly t: "column_visibility";
			readonly name: string;
			readonly invisible: boolean;
	  }
	| { readonly t: "add_pk"; readonly cols: readonly string[] }
	| { readonly t: "noop" };
export type AlterTable = {
	readonly t: "alter_table";
	readonly table: TableRef;
	readonly actions: readonly AlterAction[];
};
export type RenameTable = {
	readonly t: "rename_table";
	readonly pairs: readonly {
		readonly from: TableRef;
		readonly to: TableRef;
	}[];
};
export type DropStmt = {
	readonly t: "drop";
	readonly kind: "table" | "view";
	readonly ifExists: boolean;
	readonly names: readonly TableRef[];
};
export type CreateView = {
	readonly t: "create_view";
	readonly orReplace: boolean;
	readonly ifNotExists: boolean;
	readonly view: TableRef;
	readonly cols: readonly { readonly v: string; readonly n: string }[] | null;
	readonly q: SelectStmt;
};
export type CreateIndex = {
	readonly t: "create_index";
	readonly table: TableRef;
	/** The key parts that name a column. */
	readonly cols: readonly string[];
	/** The functional key parts' expressions. */
	readonly exprs: readonly Expr[];
};
export type DropIndex = {
	readonly t: "drop_index";
	readonly table: TableRef;
};
export type TruncateStmt = {
	readonly t: "truncate";
	readonly table: TableRef;
};
export type NoopStmt = { readonly t: "noop"; readonly what: string };

export type DdlStmt =
	| CreateTable
	| CreateTableLike
	| CreateTableAs
	| AlterTable
	| RenameTable
	| DropStmt
	| CreateView
	| CreateIndex
	| DropIndex
	| TruncateStmt
	| NoopStmt;

export type Stmt = SelectStmt | DmlStmt | DdlStmt;
