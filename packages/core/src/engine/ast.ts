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

export type ColRef = { readonly t: "col"; readonly tbl: string | null; readonly name: string };
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
/** Typed literal: `DATE '2020-01-01'`, `interval '1 day'`, `int4 '1'`. `type` is canonical. */
export type TypedLit = { readonly t: "typed"; readonly type: string; readonly v: string };
/** Binary operator, including `and`/`or` (op lowercased for word operators). */
export type BinOp = { readonly t: "bin"; readonly op: string; readonly l: Expr; readonly r: Expr };
/** Unary prefix operator: `-`, `+`, `not`, `~`, `!`, `@`, `|/`. */
export type UnOp = { readonly t: "un"; readonly op: string; readonly e: Expr };
/** `e::T` or `CAST(e AS T)`. `to` is canonical. */
export type Cast = { readonly t: "cast"; readonly e: Expr; readonly to: string };
/** Function call, aggregate, or window call. */
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
  /** `WITHIN GROUP (ORDER BY e)` — the ordered expression, if any. */
  readonly withinGroup: Expr | null;
};
/** `[existing_window] [PARTITION BY ...] [ORDER BY ...] [frame]` — the frame clause is parsed and discarded. */
export type WindowSpec = { readonly name: string | null; readonly partition: readonly Expr[]; readonly order: readonly Expr[] };
export type CaseWhen = { readonly when: Expr; readonly then: Expr };
export type CaseExpr = {
  readonly t: "case";
  readonly operand: Expr | null;
  readonly whens: readonly CaseWhen[];
  readonly else: Expr | null;
};
/** `e IS [NOT] NULL | TRUE | FALSE | UNKNOWN`, `e ISNULL`, `e NOTNULL`. */
export type IsTest = { readonly t: "is"; readonly e: Expr; readonly what: "null" | "true" | "false" | "unknown"; readonly not: boolean };
/** `l IS [NOT] DISTINCT FROM r` */
export type IsDistinct = { readonly t: "isdistinct"; readonly l: Expr; readonly r: Expr; readonly not: boolean };
export type Between = { readonly t: "between"; readonly e: Expr; readonly lo: Expr; readonly hi: Expr; readonly not: boolean };
export type InList = { readonly t: "in"; readonly e: Expr; readonly list: readonly Expr[]; readonly not: boolean };
export type InSub = { readonly t: "insub"; readonly e: Expr; readonly q: SelectStmt; readonly not: boolean };
export type Like = { readonly t: "like"; readonly e: Expr; readonly pat: Expr; readonly kind: "like" | "ilike" | "similar"; readonly not: boolean };
/** `l op ANY|SOME|ALL (subquery | array-expr)` */
export type Quantified = { readonly t: "quant"; readonly l: Expr; readonly op: string; readonly q: "any" | "all"; readonly r: SelectStmt | Expr };
/** Scalar subquery `(SELECT ...)` */
export type ScalarSub = { readonly t: "sub"; readonly q: SelectStmt };
export type Exists = { readonly t: "exists"; readonly q: SelectStmt };
/** `ARRAY[...]` */
export type ArrayCtor = { readonly t: "array"; readonly items: readonly Expr[] };
/** `ARRAY(SELECT ...)` */
export type ArraySub = { readonly t: "arraysub"; readonly q: SelectStmt };
/** `ROW(...)` or `(a, b)` */
export type RowCtor = { readonly t: "row"; readonly items: readonly Expr[] };
/** `e[i]` */
export type Subscript = { readonly t: "idx"; readonly e: Expr; readonly i: Expr };
/** `e[lo:hi]` */
export type Slice = { readonly t: "slice"; readonly e: Expr; readonly lo: Expr | null; readonly hi: Expr | null };
/** `EXTRACT(field FROM e)` */
export type Extract = { readonly t: "extract"; readonly field: string; readonly e: Expr };
/** `POSITION(sub IN str)` */
export type Position = { readonly t: "position"; readonly sub: Expr; readonly in: Expr };
/** `SUBSTRING(e [FROM a] [FOR b])` and `SUBSTRING(e SIMILAR p ESCAPE c)` */
export type Substring = { readonly t: "substring"; readonly e: Expr; readonly from: Expr | null; readonly for: Expr | null };
/** `TRIM([BOTH|LEADING|TRAILING] [chars FROM] e)`; `side` is "both" when omitted (Postgres names the column btrim / ltrim / rtrim). */
export type Trim = { readonly t: "trim"; readonly e: Expr; readonly chars: Expr | null; readonly side: "both" | "leading" | "trailing" };
/** `OVERLAY(e PLACING p FROM a [FOR b])` */
export type Overlay = { readonly t: "overlay"; readonly e: Expr };
/** `e AT TIME ZONE z` */
export type AtTimeZone = { readonly t: "attz"; readonly e: Expr; readonly zone: Expr };
/** `e COLLATE c` */
export type Collate = { readonly t: "collate"; readonly e: Expr; readonly collation: string };
/** `(e).field` — composite field access */
export type FieldAccess = { readonly t: "field"; readonly e: Expr; readonly name: string };
/** `GROUPING(...)`, `NULLIF`, `COALESCE`, `GREATEST`, `LEAST` are `Call`s with those names. */

/** The precise union of expression nodes (documentation and tooling; not used as a constraint). */
export type ExprNode =
  | ColRef | Star | NumLit | StrLit | BoolLit | NullLit | Param | DefaultExpr | TypedLit
  | BinOp | UnOp | Cast | Call | CaseExpr | IsTest | IsDistinct | Between | InList | InSub | Like
  | Quantified | ScalarSub | Exists | ArrayCtor | ArraySub | RowCtor | Subscript | Slice
  | Extract | Position | Substring | Trim | Overlay | AtTimeZone | Collate | FieldAccess;

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

export type TableRef = { readonly schema: string | null; readonly name: string };

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
  readonly colDefs: readonly { readonly name: string; readonly type: string }[] | null;
  readonly lateral: boolean;
  readonly withOrdinality: boolean;
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
  readonly cols: readonly string[] | null;
  readonly q: Stmt;
};
export type WithClause = { readonly recursive: boolean; readonly ctes: readonly Cte[] };

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
export type ValuesBody = { readonly t: "values"; readonly rows: readonly (readonly Expr[])[] };
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

export type SetItem =
  | { readonly t: "set"; readonly col: string; readonly e: Expr }
  /** `SET (a, b) = (1, 2)` or `= (SELECT ...)` */
  | { readonly t: "setmulti"; readonly cols: readonly string[]; readonly e: Expr };

export type OnConflict =
  | { readonly t: "nothing" }
  | { readonly t: "update"; readonly set: readonly SetItem[]; readonly where: Expr | null };

export type InsertStmt = {
  readonly t: "insert";
  readonly with: WithClause | null;
  readonly table: TableRef;
  readonly alias: string | null;
  readonly columns: readonly string[] | null;
  readonly source: InsertSource;
  readonly onConflict: OnConflict | null;
  readonly returning: readonly Target[] | null;
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
};
export type DeleteStmt = {
  readonly t: "delete";
  readonly with: WithClause | null;
  readonly table: TableRef;
  readonly alias: string | null;
  readonly using: readonly FromItem[];
  readonly where: Expr | null;
  readonly returning: readonly Target[] | null;
};

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
};
/** `CREATE TABLE name [(cols)] AS select`. Columns come from the query; all nullable, no defaults (as Postgres). */
export type CreateTableAs = {
  readonly t: "create_table_as";
  readonly ifNotExists: boolean;
  readonly table: TableRef;
  readonly cols: readonly string[] | null;
  readonly q: SelectStmt;
};
export type AlterAction =
  | { readonly t: "add_column"; readonly ifNotExists: boolean; readonly col: ColumnDef }
  | { readonly t: "drop_column"; readonly ifExists: boolean; readonly name: string }
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
export type DropTable = { readonly t: "drop_table"; readonly ifExists: boolean; readonly tables: readonly TableRef[] };
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
export type DropView = { readonly t: "drop_view"; readonly ifExists: boolean; readonly materialized: boolean; readonly views: readonly TableRef[] };
export type CreateEnum = { readonly t: "create_enum"; readonly name: TableRef; readonly values: readonly string[] };
export type AlterEnum = {
  readonly t: "alter_enum";
  readonly name: TableRef;
  readonly action: { readonly t: "add_value"; readonly value: string; readonly ifNotExists: boolean } | { readonly t: "rename_value"; readonly from: string; readonly to: string } | { readonly t: "rename"; readonly to: string } | { readonly t: "noop" };
};
export type DropType = { readonly t: "drop_type"; readonly ifExists: boolean; readonly names: readonly TableRef[]; readonly cascade: boolean };
export type CreateSchema = { readonly t: "create_schema"; readonly ifNotExists: boolean; readonly name: string };
export type DropSchema = { readonly t: "drop_schema"; readonly ifExists: boolean; readonly names: readonly string[]; readonly cascade: boolean };
/** `ALTER SCHEMA from RENAME TO to` */
export type RenameSchema = { readonly t: "rename_schema"; readonly from: string; readonly to: string };
/** `CREATE FUNCTION name(…) RETURNS [SETOF] ret`: registered in `$functions` (arguments unchecked). */
export type CreateFunction = { readonly t: "create_function"; readonly name: TableRef; readonly ret: string; readonly srf: boolean };
/** Statements with no schema effect: CREATE INDEX, TRUNCATE, GRANT, COMMENT, CREATE PROCEDURE, ... */
export type NoopStmt = { readonly t: "noop"; readonly what: string };

export type DdlStmt =
  | CreateTable | CreateTableAs | AlterTable | DropTable | CreateView | DropView
  | CreateEnum | AlterEnum | DropType | CreateSchema | DropSchema | RenameSchema | CreateFunction | NoopStmt;

export type Stmt = SelectStmt | InsertStmt | UpdateStmt | DeleteStmt | DdlStmt;
