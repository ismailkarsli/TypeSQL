/**
 * Nullability of view columns, derived from the view's query tree.
 *
 * Postgres records no NOT NULL information for view (or materialized view) columns. Its rewrite
 * rule (`pg_rewrite.ev_action`, the `_RETURN` rule) holds the parsed query, though, and from
 * PostgreSQL 16 every column reference in it carries `varnullingrels`, the outer joins that can
 * null it. A view column is NOT NULL here only when its expression provably cannot be NULL: a
 * NOT NULL table column that no outer join nulls, a non-NULL constant, a cast or a strict
 * operator over such values, a CASE whose every branch is NOT NULL, `count(*)`, ... Anything
 * else (function calls outside a short list, scalar subqueries, set-returning function columns)
 * is nullable. On PostgreSQL 15 and older every column reference counts as nullable.
 *
 * This module has no imports so that scripts/pg-catalog-from-pg.ts can load it with Node's
 * type stripping.
 */

/** Runs a query: node-postgres' `client.query(text, values)` fits. */
export type QueryFn = (text: string, values?: unknown[]) => Promise<{ readonly rows: readonly any[] }>;

export interface NullabilityOptions {
  /**
   * Columns known never to be NULL that the analysis cannot prove (typically columns of a
   * set-returning function). Called with the view's name and the column's name.
   */
  readonly notNull?: (view: string, column: string) => boolean;
}

/** A node of a parsed `pg_node_tree`: `{ _: "VAR", varno: "1", … }`. */
export interface Node {
  readonly _: string;
  readonly [field: string]: NodeValue;
}
export type NodeValue = Node | readonly NodeValue[] | string | null;

// ───────────────────────────── pg_node_tree reader ─────────────────────────────

type Token = string | { readonly str: string };

/** Tokens of the text form of a node tree (`outfuncs.c`). `[ … ]` datum bytes are skipped. */
function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\n" || c === "\t") { i++; continue; }
    if (c === "(" || c === ")" || c === "{" || c === "}") { out.push(c); i++; continue; }
    if (c === "[") { i = s.indexOf("]", i) + 1; continue; }
    if (c === '"') {
      let v = "";
      i++;
      while (i < s.length && s[i] !== '"') { if (s[i] === "\\") i++; v += s[i++]; }
      i++;
      out.push({ str: v });
      continue;
    }
    let v = "";
    while (i < s.length && !" \n\t(){}".includes(s[i]!)) { if (s[i] === "\\") i++; v += s[i++]; }
    out.push(v);
  }
  return out;
}

/** Parse a node tree into plain values: nodes as objects, lists as arrays, `<>` as null. */
export function parseNodeTree(text: string): NodeValue {
  const toks = tokenize(text);
  let p = 0;
  const isLabel = (t: Token | undefined): boolean => typeof t === "string" && t.startsWith(":");
  const value = (): NodeValue => {
    const t = toks[p++];
    if (t === "{") {
      const node: Record<string, NodeValue> = { _: toks[p++] as string };
      while (p < toks.length && toks[p] !== "}") {
        const label = toks[p++];
        if (!isLabel(label)) continue; // a datum's length before its skipped bytes
        if (toks[p] === "}" || isLabel(toks[p])) { node[(label as string).slice(1)] = null; continue; }
        node[(label as string).slice(1)] = value();
      }
      p++;
      return node as Node;
    }
    if (t === "(") {
      const list: NodeValue[] = [];
      while (p < toks.length && toks[p] !== ")") list.push(value());
      p++;
      return list;
    }
    if (t === undefined || t === "<>") return null;
    return typeof t === "object" ? t.str : t;
  };
  return value();
}

const list = (x: NodeValue | undefined): readonly NodeValue[] => (Array.isArray(x) ? x : []);
const node = (x: NodeValue | undefined): Node | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Node) : null);
const str = (x: NodeValue | undefined): string | null => (typeof x === "string" ? x : null);

// ───────────────────────────── function knowledge ─────────────────────────────

/** `pg_catalog` functions that return a non-NULL value for non-NULL arguments. */
const NON_NULL_FUNCTIONS = new Set([
  "current_database", "current_user", "session_user", "current_schema", "pg_get_userbyid", "pg_my_temp_schema",
  "nameconcatoid", "pg_has_role", "has_table_privilege", "has_column_privilege", "has_any_column_privilege",
  "has_function_privilege", "has_schema_privilege", "has_sequence_privilege", "has_type_privilege",
  "pg_relation_is_updatable", "pg_column_is_updatable", "pg_is_other_temp_schema",
  "now", "statement_timestamp", "transaction_timestamp", "clock_timestamp",
  "lower", "upper", "length", "char_length", "octet_length", "concat", "concat_ws", "md5", "btrim", "ltrim", "rtrim",
  "abs", "round", "trunc", "floor", "ceil", "ceiling", "date_trunc", "age",
]);

/** `pg_stat_get_*` accessors returning a number report 0 when no statistics exist, except these. */
const NULLABLE_STAT_FUNCTIONS = new Set([
  "pg_stat_get_db_checksum_failures", "pg_stat_get_backend_pid", "pg_stat_get_backend_dbid", "pg_stat_get_backend_userid",
]);
const isNonNullStatFunction = (name: string, ret: string): boolean =>
  name.startsWith("pg_stat_get_") && (ret === "int8" || ret === "int4" || ret === "float8") && !NULLABLE_STAT_FUNCTIONS.has(name);

/** Aggregates that never return NULL. */
const NON_NULL_AGGREGATES = new Set(["count"]);
/** Window functions that never return NULL. */
const NON_NULL_WINDOW_FUNCTIONS = new Set(["count", "row_number", "rank", "dense_rank", "percent_rank", "cume_dist"]);

/**
 * Set-returning functions in FROM and their output columns (1-based) that are never NULL. A
 * strict set-returning function returns no rows for NULL arguments, so the arguments do not
 * matter. `jsonb_each` values are `jsonb` (a JSON null is `'null'::jsonb`, not SQL NULL);
 * the `_text` variants turn a JSON null into SQL NULL.
 */
const NON_NULL_SRF_COLUMNS: Readonly<Record<string, readonly number[]>> = {
  generate_series: [1], generate_subscripts: [1],
  jsonb_each: [1, 2], json_each: [1, 2], jsonb_each_text: [1], json_each_text: [1],
  jsonb_object_keys: [1], json_object_keys: [1], jsonb_array_elements: [1], json_array_elements: [1],
  regexp_matches: [1], regexp_split_to_table: [1],
};

/**
 * `pg_catalog` operators that can return NULL for non-NULL operands: JSON field and path access
 * (a missing key) and jsonpath matches (an unknown result). Other built-in operators are strict
 * and return a value for non-NULL operands; operators outside `pg_catalog` count as nullable.
 */
const NULLABLE_OPERATORS = new Set(["->", "->>", "#>", "#>>", "@@", "@?"]);

interface Proc { readonly name: string; readonly ret: string; readonly system: boolean }
interface Att { readonly attnum: number; readonly notnull: boolean; readonly relkind: string }

// ───────────────────────────── analysis ─────────────────────────────

/** Per-column NOT NULL of views and materialized views; caches what it reads. */
export class ViewNullability {
  private readonly query: QueryFn;
  private readonly options: NullabilityOptions;
  private readonly views = new Map<string, Promise<boolean[]>>();
  private readonly analyzing = new Set<string>();
  private readonly atts = new Map<string, Promise<Att[]>>();
  private procs: Promise<Map<string, Proc>> | null = null;
  private operators: Promise<Map<string, Proc>> | null = null;

  constructor(query: QueryFn, options: NullabilityOptions = {}) {
    this.query = query;
    this.options = options;
  }

  /** NOT NULL flags of the view's columns, in column order. `relid` is the view's `pg_class.oid`. */
  notNull(relid: string | number): Promise<boolean[]> {
    const key = String(relid);
    // CREATE OR REPLACE VIEW allows a view that reads itself through others: waiting for its own
    // analysis would never end
    if (this.analyzing.has(key)) return Promise.resolve([]);
    let cached = this.views.get(key);
    if (!cached) {
      this.analyzing.add(key);
      cached = this.analyze(key).finally(() => this.analyzing.delete(key));
      this.views.set(key, cached);
    }
    return cached;
  }

  private async analyze(relid: string): Promise<boolean[]> {
    const { rows } = await this.query(
      `SELECT r.ev_action, c.relname FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
        WHERE r.ev_class = $1 AND r.rulename = '_RETURN'`,
      [relid],
    );
    const row = rows[0] as { ev_action: string; relname: string } | undefined;
    if (!row) return [];
    const query = node(list(parseNodeTree(row.ev_action))[0]);
    if (!query) return [];
    const out: boolean[] = [];
    for (const te of list(query["targetList"])) {
      const entry = node(te);
      if (!entry || entry["resjunk"] === "true") continue;
      const name = str(entry["resname"]) ?? "";
      out.push((await this.expr(entry["expr"], query)) || (this.options.notNull?.(row.relname, name) ?? false));
    }
    return out;
  }

  private loadProcs(): Promise<Map<string, Proc>> {
    this.procs ??= this.query(
      `SELECT p.oid::int8::text AS oid, p.proname AS name, t.typname AS ret, p.pronamespace = 'pg_catalog'::regnamespace AS system
         FROM pg_proc p JOIN pg_type t ON t.oid = p.prorettype`,
    ).then(({ rows }) => new Map((rows as (Proc & { oid: string })[]).map((r) => [r.oid, r])));
    return this.procs;
  }

  private loadOperators(): Promise<Map<string, Proc>> {
    this.operators ??= this.query(
      `SELECT o.oid::int8::text AS oid, o.oprname AS name, '' AS ret, o.oprnamespace = 'pg_catalog'::regnamespace AS system
         FROM pg_operator o`,
    ).then(({ rows }) => new Map((rows as (Proc & { oid: string })[]).map((r) => [r.oid, r])));
    return this.operators;
  }

  /** A built-in operator that returns a value for non-NULL operands. */
  private async strictOperator(e: Node): Promise<boolean> {
    const op = (await this.loadOperators()).get(str(e["opno"]) ?? "");
    return op?.system === true && !NULLABLE_OPERATORS.has(op.name);
  }

  private columns(relid: string): Promise<Att[]> {
    let cached = this.atts.get(relid);
    if (!cached) {
      cached = this.query(
        // NOT NULL: the column's constraint, or a NOT NULL domain anywhere in its domain chain.
        `SELECT a.attnum, c.relkind,
                a.attnotnull OR coalesce((
                  WITH RECURSIVE chain(oid, nn) AS (
                    SELECT t.oid, t.typnotnull FROM pg_type t WHERE t.oid = a.atttypid AND t.typtype = 'd'
                    UNION ALL
                    SELECT b.oid, b.typnotnull FROM chain JOIN pg_type d ON d.oid = chain.oid
                      JOIN pg_type b ON b.oid = d.typbasetype AND b.typtype = 'd')
                  SELECT bool_or(nn) FROM chain), false) AS notnull
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped`,
        [relid],
      ).then(({ rows }) => rows as Att[]);
      this.atts.set(relid, cached);
    }
    return cached;
  }

  /** Is output column `attno` (1-based) of a (sub)query NOT NULL? */
  private async queryColumn(query: Node, attno: number): Promise<boolean> {
    if (query["setOperations"]) {
      // UNION / INTERSECT / EXCEPT: every arm (a subquery in the range table) must be NOT NULL.
      for (const r of list(query["rtable"])) {
        const rte = node(r);
        const sub = node(rte?.["subquery"]);
        if (rte?.["rtekind"] === "1" && sub && !(await this.queryColumn(sub, attno))) return false;
      }
      return true;
    }
    const entries = list(query["targetList"]).map(node).filter((t): t is Node => t !== null && t["resjunk"] !== "true");
    const te = entries[attno - 1];
    return te ? this.expr(te["expr"], query) : false;
  }

  private async variable(v: Node, query: Node): Promise<boolean> {
    // No varnullingrels (PostgreSQL ≤ 15): outer joins are not visible, so nothing is proven.
    if (!("varnullingrels" in v) || v["varlevelsup"] !== "0") return false;
    if (list(v["varnullingrels"]).length > 1) return false; // `(b 3)`: an outer join can null it
    // ROLLUP / CUBE / GROUPING SETS null the grouped columns (PostgreSQL ≤ 17 does not mark them).
    if (list(query["groupingSets"]).length > 0) return false;
    const rte = node(list(query["rtable"])[Number(v["varno"]) - 1]);
    const attno = Number(v["varattno"]);
    if (!rte || !(attno > 0)) return false;
    switch (rte["rtekind"]) {
      case "0": { // relation
        const relid = str(rte["relid"])!;
        const att = (await this.columns(relid)).find((a) => a.attnum === attno);
        if (!att) return false;
        if (att.relkind === "v" || att.relkind === "m") return (await this.notNull(relid))[attno - 1] ?? false;
        return att.notnull;
      }
      case "1": { // subquery
        const sub = node(rte["subquery"]);
        return sub ? this.queryColumn(sub, attno) : false;
      }
      case "2": // join alias variable
        return this.expr(list(rte["joinaliasvars"])[attno - 1] ?? null, query);
      case "3": // function in FROM
        return this.functionColumn(rte, attno);
      case "9": // PostgreSQL 18 GROUP BY expressions
        return this.expr(list(rte["groupexprs"])[attno - 1] ?? null, query);
      default:
        return false;
    }
  }

  /** Column `attno` of a single set-returning function in FROM (`WITH ORDINALITY` adds a NOT NULL counter). */
  private async functionColumn(rte: Node, attno: number): Promise<boolean> {
    const functions = list(rte["functions"]);
    const only = node(functions[0]);
    if (functions.length !== 1 || !only) return false;
    const count = Number(str(only["funccolcount"]));
    if (rte["funcordinality"] === "true" && attno === count + 1) return true;
    const call = node(only["funcexpr"]);
    if (call?._ !== "FUNCEXPR") return false;
    const proc = (await this.loadProcs()).get(str(call["funcid"]) ?? "");
    return proc?.system === true && (NON_NULL_SRF_COLUMNS[proc.name]?.includes(attno) ?? false);
  }

  private async all(args: NodeValue | undefined, query: Node): Promise<boolean> {
    for (const a of list(args)) if (!(await this.expr(a, query))) return false;
    return true;
  }

  private async expr(value: NodeValue | undefined, query: Node): Promise<boolean> {
    const e = node(value);
    if (!e) return false;
    switch (e._) {
      case "VAR":
        return this.variable(e, query);
      case "CONST":
        return e["constisnull"] === "false";
      case "RELABELTYPE": case "COERCEVIAIO": case "COERCETODOMAIN": case "ARRAYCOERCEEXPR": case "COLLATEEXPR":
        return this.expr(e["arg"], query);
      case "FUNCEXPR": {
        if (e["funcretset"] !== "false") return false;
        const proc = (await this.loadProcs()).get(str(e["funcid"]) ?? "");
        // format_type(type, typmod) is not strict: a NULL typmod still gives a name.
        if (proc?.system && proc.name === "format_type") return this.expr(list(e["args"])[0] ?? null, query);
        // Explicit and implicit casts (funcformat 1, 2) keep a non-NULL input non-NULL.
        const castLike = e["funcformat"] === "1" || e["funcformat"] === "2";
        const known = proc?.system === true && (NON_NULL_FUNCTIONS.has(proc.name) || isNonNullStatFunction(proc.name, proc.ret));
        return (castLike || known) && this.all(e["args"], query);
      }
      case "BOOLEXPR":
        return this.all(e["args"], query);
      case "OPEXPR":
        return (await this.strictOperator(e)) && this.all(e["args"], query);
      case "SCALARARRAYOPEXPR": {
        // `x = ANY (arr)` is NULL when there is no match and `arr` holds a NULL: only an
        // `ARRAY[…]` of NOT NULL elements is safe.
        const [left, right] = list(e["args"]);
        const array = node(right);
        return (await this.strictOperator(e)) && array?._ === "ARRAYEXPR"
          && (await this.expr(left ?? null, query)) && this.all(array["elements"], query);
      }
      case "DISTINCTEXPR": case "NULLTEST": case "BOOLEANTEST": case "ARRAYEXPR": case "ROW":
        return true;
      case "COALESCEEXPR": case "MINMAXEXPR":
        for (const a of list(e["args"])) if (await this.expr(a, query)) return true;
        return false;
      case "CASEEXPR":
        for (const w of list(e["args"])) if (!(await this.expr(node(w)?.["result"], query))) return false;
        return this.expr(e["defresult"], query);
      case "SUBLINK": // EXISTS (0) and ARRAY (6) sublinks are never NULL
        return e["subLinkType"] === "0" || e["subLinkType"] === "6";
      case "AGGREF": {
        const proc = (await this.loadProcs()).get(str(e["aggfnoid"]) ?? "");
        return proc?.system === true && NON_NULL_AGGREGATES.has(proc.name);
      }
      case "WINDOWFUNC": {
        const proc = (await this.loadProcs()).get(str(e["winfnoid"]) ?? "");
        return proc?.system === true && NON_NULL_WINDOW_FUNCTIONS.has(proc.name);
      }
      default:
        return false;
    }
  }
}
