/**
 * AST node types produced by the parser and consumed by binder/typer/projector.
 *
 * Conventions:
 * - Every node has a `t` discriminant.
 * - Absence is `null`, never an optional property.
 * - Identifiers are already folded (lowercase unless quoted). Function names are lowercase.
 * - Type names are canonical (see schema/normalize.ts).
 * - Nothing here carries positions; errors carry the remaining-token count.
 */

// ───────────────────────────── Expressions ─────────────────────────────

export type ColRef = {
	readonly t: "col";
	readonly tbl: string | null;
	readonly name: string;
};
/** `*` or `t.*` (target lists, `count(*)`). */
export type Star = { readonly t: "star"; readonly tbl: string | null };
export type NumLit = { readonly t: "num"; readonly v: string };
export type StrLit = { readonly t: "str"; readonly v: string };
export type BoolLit = { readonly t: "bool"; readonly v: boolean };
export type NullLit = { readonly t: "null" };
/** `$n` */
export type Param = { readonly t: "param"; readonly n: number };
/** `DEFAULT` in INSERT/UPDATE value positions. */
export type DefaultExpr = { readonly t: "default" };
/**
 * Typed literal: `DATE '2020-01-01'`, `interval '1 day'`, `int4 '1'`. `type` is canonical. A
 * bit string (`B'101'`, `X'1F'`) is one of type `bit` with `bits: true` (digits as written): it
 * names no column.
 */
export type TypedLit = {
	readonly t: "typed";
	readonly type: string;
	readonly v: string;
	readonly bits?: true;
};
/** Binary operator, including `and`/`or` (op lowercased for word operators). */
export type BinOp = {
	readonly t: "bin";
	readonly op: string;
	readonly l: Expr;
	readonly r: Expr;
};
/** Unary prefix operator: `-`, `+`, `not`, `~`, `!`, `@`, `|/`. */
export type UnOp = { readonly t: "un"; readonly op: string; readonly e: Expr };
/** `e::T` or `CAST(e AS T)`. `to` is canonical. */
export type Cast = {
	readonly t: "cast";
	readonly e: Expr;
	readonly to: string;
};
/**
 * Function call, aggregate, or window call. `args` may end with `NamedArg`s and a `VariadicArg`.
 * Special syntax that Postgres turns into a function call is a `Call` too:
 * `COLLATION FOR (e)` → `pg_collation_for(e)`, `e AT LOCAL` → `timezone(e)`,
 * `(a, b) OVERLAPS (c, d)` → `overlaps(a, b, c, d)`, `e IS [form] NORMALIZED` → `is_normalized(e[, 'form'])`.
 */
export type Call = {
	readonly t: "call";
	readonly name: string;
	readonly args: readonly Expr[];
	readonly distinct: boolean;
	/** `FILTER (WHERE ...)` */
	readonly filter: Expr | null;
	/** `OVER (...)` or `OVER name` present. */
	readonly over: boolean;
	/** The window specification when `over` is true (`OVER name` → `{ name, partition: [], order: [] }`). */
	readonly win: WindowSpec | null;
	/** `WITHIN GROUP (ORDER BY e, ...)` — the ordered expression, or a `row` of them when there are several (the first types the result). */
	readonly withinGroup: Expr | null;
};
/** `[existing_window] [PARTITION BY ...] [ORDER BY ...] [frame]` — the frame clause is parsed and discarded. */
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
/** `e IS [NOT] NULL | TRUE | FALSE | UNKNOWN`, `e ISNULL`, `e NOTNULL`. */
export type IsTest = {
	readonly t: "is";
	readonly e: Expr;
	readonly what: "null" | "true" | "false" | "unknown";
	readonly not: boolean;
};
/** `l IS [NOT] DISTINCT FROM r` */
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
/** `l op ANY|SOME|ALL (subquery | array-expr)` */
export type Quantified = {
	readonly t: "quant";
	readonly l: Expr;
	readonly op: string;
	readonly q: "any" | "all";
	readonly r: SelectStmt | Expr;
};
/** Scalar subquery `(SELECT ...)` */
export type ScalarSub = { readonly t: "sub"; readonly q: SelectStmt };
export type Exists = { readonly t: "exists"; readonly q: SelectStmt };
/** `ARRAY[...]` */
export type ArrayCtor = {
	readonly t: "array";
	readonly items: readonly Expr[];
};
/** `ARRAY(SELECT ...)` */
export type ArraySub = { readonly t: "arraysub"; readonly q: SelectStmt };
/** `ROW(...)` or `(a, b)` */
export type RowCtor = { readonly t: "row"; readonly items: readonly Expr[] };
/** `e[i]` */
export type Subscript = {
	readonly t: "idx";
	readonly e: Expr;
	readonly i: Expr;
};
/** `e[lo:hi]` */
export type Slice = {
	readonly t: "slice";
	readonly e: Expr;
	readonly lo: Expr | null;
	readonly hi: Expr | null;
};
/** `EXTRACT(field FROM e)` */
export type Extract = {
	readonly t: "extract";
	readonly field: string;
	readonly e: Expr;
};
/** `POSITION(sub IN str)` */
export type Position = {
	readonly t: "position";
	readonly sub: Expr;
	readonly in: Expr;
};
/** `SUBSTRING(e [FROM a] [FOR b])`; `SUBSTRING(e SIMILAR p ESCAPE c)` is `from: p, for: c` (both are `substring(text, text, text)`). */
export type Substring = {
	readonly t: "substring";
	readonly e: Expr;
	readonly from: Expr | null;
	readonly for: Expr | null;
};
/** `TRIM([BOTH|LEADING|TRAILING] [chars FROM] e)`; `side` is "both" when omitted (Postgres names the column btrim / ltrim / rtrim). */
export type Trim = {
	readonly t: "trim";
	readonly e: Expr;
	readonly chars: Expr | null;
	readonly side: "both" | "leading" | "trailing";
};
/** `OVERLAY(e PLACING p FROM a [FOR b])` */
export type Overlay = { readonly t: "overlay"; readonly e: Expr };
/** `e AT TIME ZONE z` */
export type AtTimeZone = {
	readonly t: "attz";
	readonly e: Expr;
	readonly zone: Expr;
};
/** `e COLLATE c` */
export type Collate = {
	readonly t: "collate";
	readonly e: Expr;
	readonly collation: string;
};
/** `(e).field` — composite field access */
export type FieldAccess = {
	readonly t: "field";
	readonly e: Expr;
	readonly name: string;
};
/** `name => e` / `name := e`: a named argument (call arguments only; positional ones come first). */
export type NamedArg = {
	readonly t: "named";
	readonly name: string;
	readonly e: Expr;
};
/** `VARIADIC e`: an array passed as the variadic parameter (the last call argument only). */
export type VariadicArg = { readonly t: "variadic"; readonly e: Expr };
/** `GROUPING(...)`, `NULLIF`, `COALESCE`, `GREATEST`, `LEAST` are `Call`s with those names. */
/**
 * SQL/XML special forms (parser/xml.ts, typer/xml.ts): `XMLCONCAT(args)`,
 * `XMLELEMENT(NAME n [, XMLATTRIBUTES(named)] [, args])`, `XMLFOREST(named)`, `XMLPI(NAME n [, arg])`,
 * `XMLROOT(xml, VERSION v | NO VALUE [, STANDALONE ...])` (args: xml[, version]),
 * `XMLPARSE(DOCUMENT | CONTENT arg)`, `XMLSERIALIZE(DOCUMENT | CONTENT arg AS to)`,
 * `arg IS DOCUMENT` (`IS NOT DOCUMENT` is `NOT (arg IS DOCUMENT)`). Element, attribute and PI
 * names are not kept. `XMLEXISTS(x PASSING d)` is the call `xmlexists(x, d)`, as in Postgres.
 */
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
	/** XMLATTRIBUTES / XMLFOREST values (any type). */
	readonly named: readonly Expr[];
	/** XMLSERIALIZE's target type (canonical), else null. */
	readonly to: string | null;
};

// SQL/JSON (parser/json.ts, typer/sqljson.ts)

/** `e FORMAT JSON [ENCODING …]`: a text / bytea value embedded as JSON. */
export type JsonFormat = { readonly t: "jsonfmt"; readonly e: Expr };
/** `e IS [NOT] JSON [VALUE | SCALAR | ARRAY | OBJECT] [WITH | WITHOUT UNIQUE [KEYS]]` */
export type IsJson = {
	readonly t: "isjson";
	readonly e: Expr;
	readonly not: boolean;
};
/** `JSON(…)`, `JSON_SCALAR`, `JSON_SERIALIZE`, `JSON_OBJECT`, `JSON_ARRAY`, `JSON_EXISTS`, `JSON_VALUE`, `JSON_QUERY`. */
export type JsonFn = {
	readonly t: "jsonfn";
	/** The function, also Postgres's output column name. */
	readonly fn:
		| "json"
		| "json_scalar"
		| "json_serialize"
		| "json_object"
		| "json_array"
		| "json_exists"
		| "json_value"
		| "json_query";
	/** JSON_OBJECT: `[k1, v1, k2, v2, …]`; query functions: `[context item, path]`; others: the values. */
	readonly args: readonly Expr[];
	/** `PASSING` values (query functions). */
	readonly passing: readonly Expr[];
	/** `DEFAULT e ON EMPTY | ON ERROR` expressions (query functions). */
	readonly defaults: readonly Expr[];
	/** `JSON_ARRAY(query)` */
	readonly q: SelectStmt | null;
	/** `RETURNING` type (canonical), or null. */
	readonly ret: string | null;
	/** `ABSENT ON NULL` (JSON_OBJECT, JSON_ARRAY). */
	readonly absent: boolean;
	/** `UNKNOWN ON ERROR` (JSON_EXISTS). */
	readonly unknownOnError: boolean;
};
/** `JSON_OBJECTAGG` / `JSON_ARRAYAGG`: `e` is the `json[b]_[object_]agg[_strict]` call they mean. */
export type JsonAgg = {
	readonly t: "jsonagg";
	readonly fn: "json_objectagg" | "json_arrayagg";
	readonly e: Call;
	readonly ret: string | null;
};

/** The precise union of expression nodes (documentation and tooling; not used as a constraint). */
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

/** Discriminants of expression nodes. */
export type ExprTag = ExprNode["t"];

/**
 * Expression constraint type: a node with a known tag, children unchecked.
 *
 * Deliberately shallow. Every `infer E extends Expr` / `E extends Expr` / `readonly Expr[]`
 * check compares one level only, so a left-nested `a OR b OR …` chain of hundreds of terms
 * does not hit "Excessive stack depth comparing types" (it failed at ~50 terms when this was
 * the precise `ExprNode` union; generic-interface nodes did not help in TS 7). Field access on
 * a narrowed node (`E["l"]`) is `any` at declaration time, so it satisfies any constraint;
 * the parser is the only producer of nodes, so the lost precision is checked by tests.
 */
export type Expr = { readonly t: ExprTag; readonly [field: string]: any };

// ───────────────────────────── SELECT ─────────────────────────────

/** Target-list entry. `alias` is already folded. */
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
/** Set-returning function in FROM. `colDefs` is `AS (a int, b text)`. */
export type FromFunc = {
	readonly t: "func";
	readonly call: Expr;
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
	readonly colDefs: readonly ColDef[] | null;
	readonly lateral: boolean;
	readonly withOrdinality: boolean;
};
/** `XMLTABLE` column: `name type [PATH p] [DEFAULT d] [[NOT] NULL]`, or `name FOR ORDINALITY` (int4, not null). */
export type XmlTableCol = {
	readonly name: string;
	readonly type: string;
	readonly path: Expr | null;
	readonly def: Expr | null;
	readonly notNull: boolean;
	readonly ordinality: boolean;
};
/** `[LATERAL] XMLTABLE([XMLNAMESPACES(uri AS name, ...),] row PASSING doc COLUMNS ...) [alias [(cols)]]`, always lateral. */
export type FromXmlTable = {
	readonly t: "xmltable";
	/** XMLNAMESPACES URIs. */
	readonly ns: readonly Expr[];
	/** `XMLNAMESPACES(DEFAULT uri)` was given (parsed, then rejected like Postgres). */
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
/** A JSON_TABLE column: `{ n: name, t: { type, nullable } }` (an output column entry). */
export type JsonTableCol = {
	readonly n: string;
	readonly t: { readonly type: string; readonly nullable: boolean };
};
/** `JSON_TABLE(…) [alias [(cols)]]`, always lateral (parser/json.ts `ParseJsonTable`). */
export type FromJsonTable = {
	readonly t: "jsontable";
	readonly jt: {
		readonly ctx: Expr;
		readonly path: Expr;
		readonly passing: readonly Expr[];
		/** Output columns in Postgres's order (nested paths' columns after their parent's). */
		readonly cols: readonly JsonTableCol[];
		/** Path and column names, in declaration order (must be distinct). */
		readonly names: readonly string[];
		/** The columns' DEFAULT expressions. */
		readonly defs: readonly Expr[];
	};
	readonly alias: string | null;
	readonly colAliases: readonly string[] | null;
};
/** Column definition list entry of a function in FROM (`AS (a int, b text)`). */
export type ColDef = { readonly name: string; readonly type: string };
/** `table [AS alias] TABLESAMPLE method (args) [REPEATABLE (seed)]` */
export type FromSample = {
	readonly t: "sample";
	readonly table: FromTable;
	readonly method: string;
	readonly args: readonly Expr[];
	readonly repeatable: Expr | null;
};
/** `ROWS FROM (f(...) [AS (coldefs)], ...) [WITH ORDINALITY] [AS] alias [(cols) | (coldefs)]` */
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

/** `SEARCH {DEPTH | BREADTH} FIRST BY cols SET seq` */
export type CteSearch = {
	readonly breadth: boolean;
	readonly cols: readonly string[];
	readonly set: string;
};
/** `CYCLE cols SET mark [TO value DEFAULT default] USING path` (`to` / `default` are constants) */
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
	/** `false`, `true` (DISTINCT) or the `DISTINCT ON (...)` expressions. */
	readonly distinct: boolean | readonly Expr[];
	readonly targets: readonly Target[];
	readonly from: readonly FromItem[];
	readonly where: Expr | null;
	/** `null` when there is no GROUP BY at all (matters for aggregate nullability). */
	readonly groupBy: readonly Expr[] | null;
	/** GROUP BY uses ROLLUP / CUBE / GROUPING SETS (grouped columns become nullable). */
	readonly groupingSets: boolean;
	readonly having: Expr | null;
	/** `WINDOW name AS (...), ...` */
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
/** Parenthesized sub-select appearing as a set-op operand. */
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

// ───────────────────────────── DML ─────────────────────────────

export type InsertSource =
	| { readonly t: "values"; readonly rows: readonly (readonly Expr[])[] }
	| { readonly t: "select"; readonly q: SelectStmt }
	| { readonly t: "default" };

/**
 * Indirection on an assignment target (`a[1] = …`, `c.f = …`, `INSERT INTO t (a[1:2], c.f)`):
 * the target as an expression rooted at the bare column (`{ t: "col", tbl: null, name }`),
 * wrapped in `idx` / `slice` / `field` nodes, or `null` when the column is assigned whole.
 */
export type TargetInd = Expr | null;

export type SetItem =
	| { readonly t: "set"; readonly col: string; readonly e: Expr }
	/** `SET a[1] = e`, `SET c.f = e`: `target` is the indirection (see `TargetInd`). */
	| {
			readonly t: "setind";
			readonly col: string;
			readonly target: Expr;
			readonly e: Expr;
	  }
	/** `SET (a, b) = (1, 2)` or `= (SELECT ...)`; `ind` is null unless a target has indirection. */
	| {
			readonly t: "setmulti";
			readonly cols: readonly string[];
			readonly ind: readonly TargetInd[] | null;
			readonly e: Expr;
	  };

/** `RETURNING WITH (OLD AS o, NEW AS n)` options, in order (`[]` without the clause). */
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
	/** Indirection per column (`INSERT INTO t (a[1], c.f)`), `null` when no column has any. */
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
	/** `WHERE CURRENT OF cursor` is `null` (the cursor's row is not known at the type level). */
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
	/** `WHERE CURRENT OF cursor` is `null` (the cursor's row is not known at the type level). */
	readonly where: Expr | null;
	readonly returning: readonly Target[] | null;
	readonly retOpts: readonly ReturningOpt[];
};

/**
 * `WHEN [NOT] MATCHED [BY SOURCE | BY TARGET] [AND cond] THEN action` of MERGE.
 * `match`: `"matched"`, `"source"` (NOT MATCHED BY SOURCE) or `"target"` (NOT MATCHED [BY TARGET]).
 */
export type MergeWhen = {
	readonly match: "matched" | "source" | "target";
	readonly cond: Expr | null;
	readonly action: MergeAction;
};
export type MergeAction =
	| { readonly t: "update"; readonly set: readonly SetItem[] }
	| { readonly t: "delete" }
	/** `INSERT [(cols)] [OVERRIDING …] VALUES (…)`; `values` is `null` for `DEFAULT VALUES`. */
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
/** The DML statements (they share WITH, a target table and RETURNING). */
export type DmlStmt = InsertStmt | UpdateStmt | DeleteStmt | MergeStmt;

// ───────────────────────────── DDL ─────────────────────────────

export type ColumnDef = {
	readonly name: string;
	/** canonical type name (arrays as `T[]`) */
	readonly type: string;
	readonly notNull: boolean;
	/** DEFAULT, serial, identity, or generated column */
	readonly hasDefault: boolean;
	readonly primaryKey: boolean;
};
export type TableConstraint =
	| { readonly t: "pk"; readonly cols: readonly string[] }
	/** table-level `NOT NULL col` */
	| { readonly t: "not_null"; readonly col: string }
	| { readonly t: "other" };

/** `LIKE other_table [INCLUDING ...]`. `defaults` is true with INCLUDING DEFAULTS | IDENTITY | GENERATED | ALL. */
export type LikeClause = { readonly ref: TableRef; readonly defaults: boolean };

export type CreateTable = {
	readonly t: "create_table";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly columns: readonly ColumnDef[];
	readonly constraints: readonly TableConstraint[];
	/** `LIKE other_table` entries */
	readonly like: readonly LikeClause[];
	/** `INHERITS (parents)` or `PARTITION OF parent`: parent columns come first, with their defaults */
	readonly inherits: readonly TableRef[];
	/** `OF type`: a typed table, whose columns come from a composite type (not tracked: ApplyDdl rejects it) */
	readonly of: TableRef | null;
};
/** `CREATE TABLE name [(cols)] AS select`. Columns come from the query; all nullable, no defaults (as Postgres). */
export type CreateTableAs = {
	readonly t: "create_table_as";
	readonly ifNotExists: boolean;
	readonly table: TableRef;
	readonly cols: readonly string[] | null;
	/** the query, or `AS EXECUTE name(…)` (a prepared statement, whose columns are unknown) */
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
	/** `ADD GENERATED ... AS IDENTITY` (hasDefault; the column must already be NOT NULL) */
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
	/** `CREATE MATERIALIZED VIEW IF NOT EXISTS` */
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
/**
 * `CREATE SCHEMA name [AUTHORIZATION role] [element ...]`. `elements` holds the embedded CREATE TABLE
 * and CREATE VIEW statements (the other elements have no schema effect), tables first, then views:
 * the order Postgres runs them in. Their names are qualified with the new schema.
 */
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
/** `ALTER SCHEMA from RENAME TO to` */
export type RenameSchema = {
	readonly t: "rename_schema";
	readonly from: string;
	readonly to: string;
};
/** `CREATE FUNCTION name(…) RETURNS [SETOF] ret`: registered in `$functions` (arguments unchecked). */
export type CreateFunction = {
	readonly t: "create_function";
	readonly name: TableRef;
	readonly ret: string;
	readonly srf: boolean;
};
/** Statements with no schema effect: CREATE INDEX, TRUNCATE, GRANT, COMMENT, CREATE PROCEDURE, ... */
export type NoopStmt = { readonly t: "noop"; readonly what: string };

// ───────────────────────────── cursors ─────────────────────────────

/** `DECLARE name [options] CURSOR [WITH[OUT] HOLD] FOR query`: the query is checked; the statement returns no rows. */
export type DeclareCursor = {
	readonly t: "declare_cursor";
	readonly name: string;
	readonly q: SelectStmt;
};
/** `FETCH` / `MOVE [direction] [FROM | IN] cursor`. The cursor's query is another statement: no row type. */
export type FetchStmt = {
	readonly t: "fetch" | "move";
	readonly cursor: string;
};
/** `CLOSE name | ALL` (`cursor` is `null` for ALL). */
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
