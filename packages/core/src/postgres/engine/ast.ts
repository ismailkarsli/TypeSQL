export type ColRef = {
	readonly t: "col";
	readonly tbl: string | null;
	readonly name: string;
};
export type Star = { readonly t: "star"; readonly tbl: string | null };
export type NumLit = { readonly t: "num"; readonly v: string };
export type StrLit = { readonly t: "str"; readonly v: string };
export type BoolLit = { readonly t: "bool"; readonly v: boolean };
export type NullLit = { readonly t: "null" };
export type Param = { readonly t: "param"; readonly n: number };
export type DefaultExpr = { readonly t: "default" };
export type TypedLit = {
	readonly t: "typed";
	readonly type: string;
	readonly v: string;
	readonly bits?: true;
};
export type BinOp = {
	readonly t: "bin";
	readonly op: string;
	readonly l: Expr;
	readonly r: Expr;
};
export type UnOp = { readonly t: "un"; readonly op: string; readonly e: Expr };
export type Cast = {
	readonly t: "cast";
	readonly e: Expr;
	readonly to: string;
};
export type Call = {
	readonly t: "call";
	readonly name: string;
	readonly args: readonly Expr[];
	readonly distinct: boolean;
	readonly filter: Expr | null;
	readonly over: boolean;
	readonly win: WindowSpec | null;
	readonly withinGroup: Expr | null;
};
export type WindowSpec = {
	readonly name: string | null;
	readonly partition: readonly Expr[];
	readonly order: readonly Expr[];
};
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
	readonly what: "null" | "true" | "false" | "unknown";
	readonly not: boolean;
};
export type IsDistinct = {
	readonly t: "isdistinct";
	readonly l: Expr;
	readonly r: Expr;
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
export type Like = {
	readonly t: "like";
	readonly e: Expr;
	readonly pat: Expr;
	readonly kind: "like" | "ilike" | "similar";
	readonly not: boolean;
};
export type Quantified = {
	readonly t: "quant";
	readonly l: Expr;
	readonly op: string;
	readonly q: "any" | "all";
	readonly r: SelectStmt | Expr;
};
export type ScalarSub = { readonly t: "sub"; readonly q: SelectStmt };
export type Exists = { readonly t: "exists"; readonly q: SelectStmt };
export type ArrayCtor = {
	readonly t: "array";
	readonly items: readonly Expr[];
};
export type ArraySub = { readonly t: "arraysub"; readonly q: SelectStmt };
export type RowCtor = { readonly t: "row"; readonly items: readonly Expr[] };
export type Subscript = {
	readonly t: "idx";
	readonly e: Expr;
	readonly i: Expr;
};
export type Slice = {
	readonly t: "slice";
	readonly e: Expr;
	readonly lo: Expr | null;
	readonly hi: Expr | null;
};
export type Extract = {
	readonly t: "extract";
	readonly field: string;
	readonly e: Expr;
};
export type Position = {
	readonly t: "position";
	readonly sub: Expr;
	readonly in: Expr;
};
export type Substring = {
	readonly t: "substring";
	readonly e: Expr;
	readonly from: Expr | null;
	readonly for: Expr | null;
};
export type Trim = {
	readonly t: "trim";
	readonly e: Expr;
	readonly chars: Expr | null;
	readonly side: "both" | "leading" | "trailing";
};
export type Overlay = {
	readonly t: "overlay";
	readonly e: Expr;
	readonly placing: Expr;
	readonly from: Expr;
	readonly for: Expr | null;
};
export type AtTimeZone = {
	readonly t: "attz";
	readonly e: Expr;
	readonly zone: Expr;
};
export type Collate = {
	readonly t: "collate";
	readonly e: Expr;
	readonly collation: string;
};
export type FieldAccess = {
	readonly t: "field";
	readonly e: Expr;
	readonly name: string;
};
export type NamedArg = {
	readonly t: "named";
	readonly name: string;
	readonly e: Expr;
};
export type VariadicArg = { readonly t: "variadic"; readonly e: Expr };
export type XmlExpr = {
	readonly t: "xml";
	readonly op:
		| "concat"
		| "element"
		| "forest"
		| "pi"
		| "root"
		| "parse"
		| "serialize"
		| "document";
	readonly args: readonly Expr[];
	readonly named: readonly Expr[];
	readonly to: string | null;
};

export type JsonFormat = { readonly t: "jsonfmt"; readonly e: Expr };
export type IsJson = {
	readonly t: "isjson";
	readonly e: Expr;
	readonly not: boolean;
};
export type JsonFn = {
	readonly t: "jsonfn";
	readonly fn:
		| "json"
		| "json_scalar"
		| "json_serialize"
		| "json_object"
		| "json_array"
		| "json_exists"
		| "json_value"
		| "json_query";
	readonly args: readonly Expr[];
	readonly passing: readonly Expr[];
	readonly defaults: readonly Expr[];
	readonly q: SelectStmt | null;
	readonly ret: string | null;
	readonly absent: boolean;
	readonly unknownOnError: boolean;
};
export type JsonAgg = {
	readonly t: "jsonagg";
	readonly fn: "json_objectagg" | "json_arrayagg";
	readonly e: Call;
	readonly ret: string | null;
};

export type ExprNode =
	| ColRef
	| Star
	| NumLit
	| StrLit
	| BoolLit
	| NullLit
	| Param
	| DefaultExpr
	| TypedLit
	| BinOp
	| UnOp
	| Cast
	| Call
	| CaseExpr
	| IsTest
	| IsDistinct
	| Between
	| InList
	| InSub
	| Like
	| Quantified
	| ScalarSub
	| Exists
	| ArrayCtor
	| ArraySub
	| RowCtor
	| Subscript
	| Slice
	| Extract
	| Position
	| Substring
	| Trim
	| Overlay
	| AtTimeZone
	| Collate
	| FieldAccess
	| XmlExpr
	| JsonFormat
	| IsJson
	| JsonFn
	| JsonAgg
	| NamedArg
	| VariadicArg;

export type ExprTag = ExprNode["t"];

export type Expr = { readonly t: ExprTag; readonly [field: string]: any };

export type Target = { readonly e: Expr; readonly alias: string | null };

export type TableRef = {
	readonly schema: string | null;
	readonly name: string;
};

export type FromTable = {
	readonly t: "table";
	readonly ref: TableRef;
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
};
export type FromSub = {
	readonly t: "sub";
	readonly q: SelectStmt;
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
	readonly lateral: boolean;
};
export type FromFunc = {
	readonly t: "func";
	readonly call: Expr;
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
	readonly colDefs: readonly ColDef[] | null;
	readonly lateral: boolean;
	readonly withOrdinality: boolean;
};
export type XmlTableCol = {
	readonly name: string;
	readonly type: string;
	readonly path: Expr | null;
	readonly def: Expr | null;
	readonly notNull: boolean;
	readonly ordinality: boolean;
};
export type FromXmlTable = {
	readonly t: "xmltable";
	readonly ns: readonly Expr[];
	readonly defaultNs: boolean;
	readonly row: Expr;
	readonly doc: Expr;
	readonly cols: readonly XmlTableCol[];
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
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
export type JsonTableCol = {
	readonly n: string;
	readonly t: { readonly type: string; readonly nullable: boolean };
};
export type FromJsonTable = {
	readonly t: "jsontable";
	readonly jt: {
		readonly ctx: Expr;
		readonly path: Expr;
		readonly passing: readonly Expr[];
		readonly cols: readonly JsonTableCol[];
		readonly names: readonly string[];
		readonly defs: readonly Expr[];
	};
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
};
export type ColDef = { readonly name: string; readonly type: string };
export type FromSample = {
	readonly t: "sample";
	readonly table: FromTable;
	readonly method: string;
	readonly args: readonly Expr[];
	readonly repeatable: Expr | null;
};
export type FromRowsFrom = {
	readonly t: "rowsfrom";
	readonly funcs: readonly {
		readonly call: Expr;
		readonly colDefs: readonly ColDef[] | null;
	}[];
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
	readonly colDefs: readonly ColDef[] | null;
	readonly lateral: boolean;
	readonly withOrdinality: boolean;
};
export type FromItem =
	| FromTable
	| FromSub
	| FromFunc
	| FromJoin
	| FromXmlTable
	| FromJsonTable
	| FromSample
	| FromRowsFrom;

export type CteSearch = {
	readonly breadth: boolean;
	readonly cols: readonly string[];
	readonly set: string;
};
export type CteCycle = {
	readonly cols: readonly string[];
	readonly set: string;
	readonly to: Expr | null;
	readonly default: Expr | null;
	readonly using: string;
};

export type Cte = {
	readonly name: string;
	readonly cols: readonly string[] | null;
	readonly q: Stmt;
	readonly search: CteSearch | null;
	readonly cycle: CteCycle | null;
};
export type WithClause = {
	readonly recursive: boolean;
	readonly ctes: readonly Cte[];
};

export type SimpleSelect = {
	readonly t: "simple";
	readonly distinct: boolean | readonly Expr[];
	readonly targets: readonly Target[];
	readonly from: readonly FromItem[];
	readonly where: Expr | null;
	readonly groupBy: readonly Expr[] | null;
	readonly groupingSets: boolean | readonly Expr[];
	readonly having: Expr | null;
	readonly windows: readonly NamedWindow[];
};
export type NamedWindow = { readonly name: string; readonly spec: WindowSpec };
export type SetOp = {
	readonly t: "setop";
	readonly op: "union" | "intersect" | "except";
	readonly all: boolean;
	readonly l: SelectBody;
	readonly r: SelectBody;
};
export type ValuesBody = {
	readonly t: "values";
	readonly rows: readonly (readonly Expr[])[];
};
export type ParenSelect = { readonly t: "paren"; readonly q: SelectStmt };
export type SelectBody = SimpleSelect | SetOp | ValuesBody | ParenSelect;

export type SelectStmt = {
	readonly t: "select";
	readonly with: WithClause | null;
	readonly body: SelectBody;
	readonly orderBy: readonly Expr[];
	readonly limit: Expr | null;
	readonly offset: Expr | null;
};

export type InsertSource =
	| { readonly t: "values"; readonly rows: readonly (readonly Expr[])[] }
	| { readonly t: "select"; readonly q: SelectStmt }
	| { readonly t: "default" };

export type TargetInd = Expr | null;

export type SetItem =
	| { readonly t: "set"; readonly col: string; readonly e: Expr }
	| {
			readonly t: "setind";
			readonly col: string;
			readonly target: Expr;
			readonly e: Expr;
	  }
	| {
			readonly t: "setmulti";
			readonly cols: readonly string[];
			readonly ind: readonly TargetInd[] | null;
			readonly e: Expr;
	  };

export type ReturningOpt = {
	readonly kind: "old" | "new";
	readonly alias: string;
};

export type OnConflict =
	| { readonly t: "nothing" }
	| {
			readonly t: "update";
			readonly set: readonly SetItem[];
			readonly where: Expr | null;
	  };

export type InsertStmt = {
	readonly t: "insert";
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly alias: string | null;
	readonly columns: readonly string[] | null;
	readonly colInd: readonly TargetInd[] | null;
	readonly source: InsertSource;
	readonly onConflict: OnConflict | null;
	readonly returning: readonly Target[] | null;
	readonly retOpts: readonly ReturningOpt[];
};
export type UpdateStmt = {
	readonly t: "update";
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly alias: string | null;
	readonly set: readonly SetItem[];
	readonly from: readonly FromItem[];
	readonly where: Expr | null;
	readonly returning: readonly Target[] | null;
	readonly retOpts: readonly ReturningOpt[];
};
export type DeleteStmt = {
	readonly t: "delete";
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly alias: string | null;
	readonly using: readonly FromItem[];
	readonly where: Expr | null;
	readonly returning: readonly Target[] | null;
	readonly retOpts: readonly ReturningOpt[];
};

export type MergeWhen = {
	readonly match: "matched" | "source" | "target";
	readonly cond: Expr | null;
	readonly action: MergeAction;
};
export type MergeAction =
	| { readonly t: "update"; readonly set: readonly SetItem[] }
	| { readonly t: "delete" }
	| {
			readonly t: "insert";
			readonly columns: readonly string[] | null;
			readonly colInd: readonly TargetInd[] | null;
			readonly values: readonly Expr[] | null;
	  }
	| { readonly t: "nothing" };
export type MergeStmt = {
	readonly t: "merge";
	readonly with: WithClause | null;
	readonly table: TableRef;
	readonly alias: string | null;
	readonly source: FromItem;
	readonly on: Expr;
	readonly whens: readonly MergeWhen[];
	readonly returning: readonly Target[] | null;
	readonly retOpts: readonly ReturningOpt[];
};
export type DmlStmt = InsertStmt | UpdateStmt | DeleteStmt | MergeStmt;

export type ColumnDef = {
	readonly name: string;
	readonly type: string;
	readonly notNull: boolean;
	readonly hasDefault: boolean;
	readonly primaryKey: boolean;
};
export type TableConstraint =
	| { readonly t: "pk"; readonly cols: readonly string[] }
	| { readonly t: "not_null"; readonly col: string }
	| { readonly t: "other" };

export type LikeClause = {
	readonly ref: TableRef;
	readonly defaults: boolean;
	readonly options?: "defaults" | "identity" | "generated";
};

export type CreateTable = {
	readonly t: "create_table";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly columns: readonly ColumnDef[];
	readonly constraints: readonly TableConstraint[];
	readonly like: readonly LikeClause[];
	readonly inherits: readonly TableRef[];
	readonly of: TableRef | null;
};
export type CreateTableAs = {
	readonly t: "create_table_as";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly cols: readonly string[] | null;
	readonly q: SelectStmt | ExecuteSource;
};
export type ExecuteSource = { readonly t: "execute"; readonly name: string };
export type AlterAction =
	| {
			readonly t: "add_column";
			readonly ifNotExists: boolean;
			readonly col: ColumnDef;
	  }
	| {
			readonly t: "drop_column";
			readonly ifExists: boolean;
			readonly name: string;
	  }
	| { readonly t: "rename_column"; readonly from: string; readonly to: string }
	| { readonly t: "rename_table"; readonly to: string }
	| { readonly t: "set_schema"; readonly schema: string }
	| { readonly t: "alter_type"; readonly name: string; readonly type: string }
	| { readonly t: "set_not_null"; readonly name: string }
	| { readonly t: "drop_not_null"; readonly name: string }
	| { readonly t: "set_default"; readonly name: string }
	| { readonly t: "drop_default"; readonly name: string }
	| { readonly t: "add_identity"; readonly name: string }
	| { readonly t: "add_pk"; readonly cols: readonly string[] }
	| { readonly t: "noop" };
export type AlterTable = {
	readonly t: "alter_table";
	readonly ifExists: boolean;
	readonly table: TableRef;
	readonly actions: readonly AlterAction[];
};
export type DropTable = {
	readonly t: "drop_table";
	readonly ifExists: boolean;
	readonly tables: readonly TableRef[];
};
export type CreateView = {
	readonly t: "create_view";
	readonly orReplace: boolean;
	readonly materialized: boolean;
	readonly ifNotExists: boolean;
	readonly view: TableRef;
	readonly cols: readonly string[] | null;
	readonly q: SelectStmt;
};
export type DropView = {
	readonly t: "drop_view";
	readonly ifExists: boolean;
	readonly materialized: boolean;
	readonly views: readonly TableRef[];
};
export type CreateEnum = {
	readonly t: "create_enum";
	readonly name: TableRef;
	readonly values: readonly string[];
};
export type AlterEnum = {
	readonly t: "alter_enum";
	readonly name: TableRef;
	readonly action:
		| {
				readonly t: "add_value";
				readonly value: string;
				readonly ifNotExists: boolean;
		  }
		| { readonly t: "rename_value"; readonly from: string; readonly to: string }
		| { readonly t: "rename"; readonly to: string }
		| { readonly t: "noop" };
};
export type DropType = {
	readonly t: "drop_type";
	readonly ifExists: boolean;
	readonly names: readonly TableRef[];
	readonly cascade: boolean;
};
export type CreateSchema = {
	readonly t: "create_schema";
	readonly ifNotExists: boolean;
	readonly name: string;
	readonly elements: readonly (CreateTable | CreateView)[];
};
export type DropSchema = {
	readonly t: "drop_schema";
	readonly ifExists: boolean;
	readonly names: readonly string[];
	readonly cascade: boolean;
};
export type RenameSchema = {
	readonly t: "rename_schema";
	readonly from: string;
	readonly to: string;
};
export type CreateFunction = {
	readonly t: "create_function";
	readonly name: TableRef;
	readonly ret: string;
	readonly srf: boolean;
};
export type NoopStmt = { readonly t: "noop"; readonly what: string };

export type DeclareCursor = {
	readonly t: "declare_cursor";
	readonly name: string;
	readonly q: SelectStmt;
};
export type FetchStmt = {
	readonly t: "fetch" | "move";
	readonly cursor: string;
};
export type CloseCursor = {
	readonly t: "close_cursor";
	readonly cursor: string | null;
};

export type DdlStmt =
	| CreateTable
	| CreateTableAs
	| AlterTable
	| DropTable
	| CreateView
	| DropView
	| CreateEnum
	| AlterEnum
	| DropType
	| CreateSchema
	| DropSchema
	| RenameSchema
	| CreateFunction
	| NoopStmt
	| DeclareCursor
	| FetchStmt
	| CloseCursor;

export type Stmt =
	| SelectStmt
	| InsertStmt
	| UpdateStmt
	| DeleteStmt
	| MergeStmt
	| DdlStmt;
