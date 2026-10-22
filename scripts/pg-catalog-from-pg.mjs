// Generator for the opt-in system catalog slice (packages/core/src/schema/pg-catalog.ts).
//
// Connects to Postgres (TYPESQL_PG_URL) and writes the `PgCatalog` declaration for the relations
// listed in RELATIONS below:
//
//   TYPESQL_PG_URL=postgres://… node scripts/pg-catalog-from-pg.mjs           # rewrite the file
//   TYPESQL_PG_URL=postgres://… node scripts/pg-catalog-from-pg.mjs --check   # exit 1 if it differs
//
// Column types come from pg_attribute (domains such as information_schema.sql_identifier are
// replaced by their base type, which is also the type OID Postgres reports to drivers). Table
// columns are NOT NULL when attnotnull is set. Postgres records no nullability for view
// columns, so the generator derives it from the view's query tree (pg_rewrite.ev_action): a
// column is NOT NULL only when its expression provably cannot be NULL (a NOT NULL table column
// that no outer join nulls, a non-null constant, a CASE whose every branch is NOT NULL, ...).
// Columns of set-returning functions (pg_stat_get_activity(), pg_lock_status(), ...) are
// nullable unless listed in FUNCTION_COLUMNS_NOT_NULL, which was checked against the C source.
//
// The output targets the Postgres major version it was generated from (17); the conformance
// test packages/core/test/conformance/pg-catalog.test.ts regenerates it and compares.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** Relations in the slice: [schema, name, one-line description]. */
export const RELATIONS = [
  // catalog tables
  ["pg_catalog", "pg_am", "Access methods."],
  ["pg_catalog", "pg_attrdef", "Column default expressions."],
  ["pg_catalog", "pg_attribute", "Table columns."],
  ["pg_catalog", "pg_class", "Tables, indexes, sequences, views and other relations."],
  ["pg_catalog", "pg_constraint", "Check, primary key, unique, foreign key and exclusion constraints."],
  ["pg_catalog", "pg_database", "Databases of the cluster."],
  ["pg_catalog", "pg_depend", "Dependencies between database objects."],
  ["pg_catalog", "pg_description", "Comments on database objects."],
  ["pg_catalog", "pg_enum", "Enum labels."],
  ["pg_catalog", "pg_extension", "Installed extensions."],
  ["pg_catalog", "pg_index", "Index details (the rest is in pg_class)."],
  ["pg_catalog", "pg_inherits", "Table inheritance and partitions."],
  ["pg_catalog", "pg_namespace", "Schemas."],
  ["pg_catalog", "pg_proc", "Functions and procedures."],
  ["pg_catalog", "pg_sequence", "Sequence parameters."],
  ["pg_catalog", "pg_trigger", "Triggers."],
  ["pg_catalog", "pg_type", "Data types."],
  // system views
  ["pg_catalog", "pg_available_extensions", "Extensions available for installation."],
  ["pg_catalog", "pg_indexes", "Indexes, with their definitions."],
  ["pg_catalog", "pg_locks", "Locks held and awaited by active processes."],
  ["pg_catalog", "pg_matviews", "Materialized views."],
  ["pg_catalog", "pg_replication_slots", "Replication slots."],
  ["pg_catalog", "pg_roles", "Database roles (pg_authid without passwords)."],
  ["pg_catalog", "pg_sequences", "Sequences, with their current state."],
  ["pg_catalog", "pg_settings", "Run-time configuration parameters."],
  ["pg_catalog", "pg_stat_activity", "One row per server process: current activity."],
  ["pg_catalog", "pg_stat_all_indexes", "Per-index access statistics."],
  ["pg_catalog", "pg_stat_all_tables", "Per-table access statistics."],
  ["pg_catalog", "pg_stat_database", "Per-database statistics (plus a row with datid 0 for shared objects)."],
  ["pg_catalog", "pg_stat_replication", "One row per WAL sender process."],
  ["pg_catalog", "pg_stat_user_indexes", "pg_stat_all_indexes for user indexes."],
  ["pg_catalog", "pg_stat_user_tables", "pg_stat_all_tables for user tables."],
  ["pg_catalog", "pg_statio_user_tables", "Per-table I/O statistics for user tables."],
  ["pg_catalog", "pg_tables", "Ordinary and partitioned tables."],
  ["pg_catalog", "pg_views", "Views, with their definitions."],
  // information_schema
  ["information_schema", "check_constraints", "Check constraints."],
  ["information_schema", "columns", "Columns of tables and views."],
  ["information_schema", "constraint_column_usage", "Columns used by constraints."],
  ["information_schema", "domains", "Domains."],
  ["information_schema", "key_column_usage", "Columns of unique, primary key and foreign key constraints."],
  ["information_schema", "parameters", "Function parameters."],
  ["information_schema", "referential_constraints", "Foreign key constraints."],
  ["information_schema", "routines", "Functions and procedures."],
  ["information_schema", "schemata", "Schemas the current user owns or can use."],
  ["information_schema", "sequences", "Sequences."],
  ["information_schema", "table_constraints", "Table constraints."],
  ["information_schema", "tables", "Tables and views."],
  ["information_schema", "triggers", "Triggers."],
  ["information_schema", "views", "Views."],
];

/**
 * Columns produced by set-returning functions that are never NULL (checked against
 * src/backend/utils/adt/pgstatfuncs.c, lockfuncs.c, guc_funcs.c, slotfuncs.c, extension.c).
 */
export const FUNCTION_COLUMNS_NOT_NULL = new Set([
  "pg_stat_activity.pid",
  "pg_stat_replication.pid",
  "pg_locks.locktype",
  "pg_locks.virtualtransaction",
  "pg_locks.mode",
  "pg_locks.granted",
  "pg_locks.fastpath",
  "pg_settings.name",
  "pg_settings.setting",
  "pg_settings.category",
  "pg_settings.short_desc",
  "pg_settings.context",
  "pg_settings.vartype",
  "pg_settings.source",
  "pg_settings.pending_restart",
  "pg_replication_slots.slot_name",
  "pg_replication_slots.slot_type",
  "pg_replication_slots.temporary",
  "pg_replication_slots.active",
  "pg_available_extensions.name",
]);

/** Functions that return a non-NULL value for non-NULL arguments. */
const NON_NULL_FUNCTIONS = new Set([
  "current_database", "current_user", "session_user", "pg_get_userbyid", "pg_my_temp_schema", "nameconcatoid",
  "pg_has_role", "has_table_privilege", "has_column_privilege", "has_any_column_privilege", "has_function_privilege",
  "has_schema_privilege", "has_sequence_privilege", "has_type_privilege", "pg_relation_is_updatable",
  "pg_column_is_updatable", "pg_is_other_temp_schema", "pg_stat_get_db_numbackends",
]);

/**
 * `pg_stat_get_*` statistics accessors returning a number: counters and times report 0 when no
 * statistics exist yet. The exceptions return NULL (checksums disabled, ...).
 */
const isNonNullStatFunction = (name, retType) =>
  /^pg_stat_get_/.test(name) && ["int8", "int4", "float8"].includes(retType) && !NULLABLE_STAT_FUNCTIONS.has(name);
const NULLABLE_STAT_FUNCTIONS = new Set(["pg_stat_get_db_checksum_failures", "pg_stat_get_backend_pid", "pg_stat_get_backend_dbid", "pg_stat_get_backend_userid"]);

// ───────────────────────────── pg_node_tree reader ─────────────────────────────

/** Tokens of the text form of a node tree (`outfuncs.c`). `[ … ]` datum bytes are skipped. */
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\n" || c === "\t") { i++; continue; }
    if (c === "(" || c === ")" || c === "{" || c === "}") { out.push(c); i++; continue; }
    if (c === "[") { i = s.indexOf("]", i) + 1; continue; }
    if (c === '"') {
      let v = "";
      i++;
      while (s[i] !== '"') { if (s[i] === "\\") i++; v += s[i++]; }
      i++;
      out.push({ str: v });
      continue;
    }
    let v = "";
    while (i < s.length && !" \n\t(){}".includes(s[i])) { if (s[i] === "\\") i++; v += s[i++]; }
    out.push(v);
  }
  return out;
}

/** Parse a node tree into plain values: `{ _: "VAR", varno: "1", … }`, arrays for lists, null for `<>`. */
export function parseNodeTree(text) {
  const toks = tokenize(text);
  let p = 0;
  const value = () => {
    const t = toks[p++];
    if (t === "{") {
      const node = { _: toks[p++] };
      while (toks[p] !== "}") {
        const label = toks[p++];
        if (typeof label !== "string" || !label.startsWith(":")) continue; // trailing datum length etc.
        if (toks[p] === "}" || (typeof toks[p] === "string" && toks[p].startsWith(":"))) { node[label.slice(1)] = null; continue; }
        node[label.slice(1)] = value();
      }
      p++;
      return node;
    }
    if (t === "(") {
      const list = [];
      while (toks[p] !== ")") list.push(value());
      p++;
      return list;
    }
    if (t === "<>") return null;
    return typeof t === "object" ? t.str : t;
  };
  return value();
}

const asList = (x) => (Array.isArray(x) ? x : []);
/** A Var's `varnullingrels`: `(b)` is empty, `(b 3)` names an outer join that can null it. */
const isNulledByOuterJoin = (bitmap) => Array.isArray(bitmap) && bitmap.length > 1;

// ───────────────────────────── analysis ─────────────────────────────

class Catalog {
  constructor(client) {
    this.client = client;
    this.viewCache = new Map();
    this.attCache = new Map();
    this.procs = new Map();
  }

  async load() {
    const { rows } = await this.client.query(
      `SELECT p.oid::int8::text AS oid, p.proname AS name, t.typname AS ret
         FROM pg_proc p JOIN pg_type t ON t.oid = p.prorettype`,
    );
    for (const r of rows) this.procs.set(r.oid, r);
  }

  /** Columns of a relation: name, canonical type, attnotnull, relkind. */
  async columns(relid) {
    const key = String(relid);
    if (this.attCache.has(key)) return this.attCache.get(key);
    const { rows } = await this.client.query(
      `SELECT a.attnum, a.attname AS name, a.attnotnull AS notnull, c.relkind,
              CASE WHEN t.typtype = 'd' THEN bt.typname ELSE t.typname END AS typname,
              CASE WHEN t.typtype = 'd' THEN bte.typname ELSE te.typname END AS elem
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_type t ON t.oid = a.atttypid
         LEFT JOIN pg_type bt ON bt.oid = t.typbasetype
         -- true arrays only: int2vector and oidvector have a typelem too, but are not its typarray
         LEFT JOIN pg_type te ON te.oid = t.typelem AND te.typarray = t.oid
         LEFT JOIN pg_type bte ON bte.oid = bt.typelem AND bte.typarray = bt.oid
        WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [relid],
    );
    const cols = rows.map((r) => ({
      attnum: r.attnum,
      name: r.name,
      type: r.elem ? `${r.elem}[]` : r.typname,
      notnull: r.notnull,
      relkind: r.relkind,
    }));
    this.attCache.set(key, cols);
    return cols;
  }

  /** Per-column NOT NULL of a view, from its `_RETURN` rule's query tree. */
  async viewNotNull(relid) {
    const key = String(relid);
    if (this.viewCache.has(key)) return this.viewCache.get(key);
    const { rows } = await this.client.query(
      `SELECT r.ev_action, c.relname FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
        WHERE r.ev_class = $1 AND r.rulename = '_RETURN'`,
      [relid],
    );
    const relname = rows[0].relname;
    const query = asList(parseNodeTree(rows[0].ev_action))[0];
    const result = [];
    for (const te of asList(query.targetList)) {
      if (te.resjunk === "true") continue;
      const notnull = (await this.exprNotNull(te.expr, query)) || FUNCTION_COLUMNS_NOT_NULL.has(`${relname}.${te.resname}`);
      result.push(notnull);
    }
    this.viewCache.set(key, result);
    return result;
  }

  /** Is output column `attno` (1-based) of `query` provably NOT NULL? */
  async queryColNotNull(query, attno) {
    if (query.setOperations) {
      for (const rte of asList(query.rtable)) {
        if (rte.rtekind === "1" && !(await this.queryColNotNull(rte.subquery, attno))) return false;
      }
      return true;
    }
    const te = asList(query.targetList).filter((t) => t.resjunk !== "true")[attno - 1];
    return te ? this.exprNotNull(te.expr, query) : false;
  }

  async varNotNull(v, query) {
    if (v.varlevelsup !== "0" || isNulledByOuterJoin(v.varnullingrels)) return false;
    const rte = asList(query.rtable)[Number(v.varno) - 1];
    const attno = Number(v.varattno);
    if (!rte || attno <= 0) return false;
    switch (rte.rtekind) {
      case "0": { // relation
        const cols = await this.columns(rte.relid);
        const col = cols.find((c) => c.attnum === attno);
        if (!col) return false;
        if (col.relkind === "v" || col.relkind === "m") {
          if (col.relkind === "m") return col.notnull;
          return (await this.viewNotNull(rte.relid))[attno - 1] ?? false;
        }
        return col.notnull;
      }
      case "1": // subquery
        return this.queryColNotNull(rte.subquery, attno);
      case "2": { // join alias
        const alias = asList(rte.joinaliasvars)[attno - 1];
        return alias ? this.exprNotNull(alias, query) : false;
      }
      default:
        return false;
    }
  }

  async allNotNull(args, query) {
    for (const a of asList(args)) if (!(await this.exprNotNull(a, query))) return false;
    return true;
  }

  async exprNotNull(e, query) {
    if (e === null || typeof e !== "object") return false;
    switch (e._) {
      case "VAR": return this.varNotNull(e, query);
      case "CONST": return e.constisnull === "false";
      case "RELABELTYPE": case "COERCEVIAIO": case "COERCETODOMAIN": case "ARRAYCOERCEEXPR": case "COLLATEEXPR":
        return this.exprNotNull(e.arg, query);
      case "FUNCEXPR": {
        const proc = this.procs.get(e.funcid);
        // format_type(type, typmod) is not strict: a NULL typmod still gives a name.
        if (proc?.name === "format_type") return this.exprNotNull(asList(e.args)[0], query);
        // Explicit/implicit casts (funcformat 1, 2) keep a non-NULL input non-NULL.
        const nonNull = e.funcformat === "1" || e.funcformat === "2"
          || (proc && (NON_NULL_FUNCTIONS.has(proc.name) || isNonNullStatFunction(proc.name, proc.ret)));
        return Boolean(nonNull) && e.funcretset === "false" && this.allNotNull(e.args, query);
      }
      case "OPEXPR": case "SCALARARRAYOPEXPR": case "BOOLEXPR":
        return this.allNotNull(e.args, query);
      case "DISTINCTEXPR": case "NULLTEST": case "BOOLEANTEST": case "ARRAYEXPR": case "ROW":
        return true;
      case "COALESCEEXPR": case "MINMAXEXPR": {
        for (const a of asList(e.args)) if (await this.exprNotNull(a, query)) return true;
        return false;
      }
      case "CASEEXPR": {
        for (const w of asList(e.args)) if (!(await this.exprNotNull(w.result, query))) return false;
        return this.exprNotNull(e.defresult, query);
      }
      case "SUBLINK": return e.subLinkType === "0" || e.subLinkType === "6"; // EXISTS, ARRAY
      case "AGGREF": {
        const proc = this.procs.get(e.aggfnoid);
        return proc?.name === "count";
      }
      default:
        return false;
    }
  }
}

// ───────────────────────────── emit ─────────────────────────────

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name) => (IDENT.test(name) ? name : JSON.stringify(name));

/** Source of packages/core/src/schema/pg-catalog.ts for the connected server. */
export async function generatePgCatalog(client) {
  const catalog = new Catalog(client);
  await catalog.load();
  const { rows: [{ version }] } = await client.query(`SELECT current_setting('server_version') AS version`);
  const major = version.split(/[.\s]/)[0];
  const namespaces = new Map();
  for (const [schema, name, description] of RELATIONS) {
    const { rows } = await client.query(
      `SELECT c.oid::int8::text AS oid, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2`,
      [schema, name],
    );
    if (rows.length === 0) throw new Error(`relation ${schema}.${name} does not exist on Postgres ${version}`);
    const { oid, relkind } = rows[0];
    const cols = await catalog.columns(oid);
    const notnull = relkind === "v" ? await catalog.viewNotNull(oid) : cols.map((c) => c.notnull);
    const body = cols.map((c, i) => `    ${key(c.name)}: ${notnull[i] ? "Col" : "Nullable"}<${JSON.stringify(c.type)}>;`);
    const kind = relkind === "v" ? "View" : "Table";
    const lines = [`  /** ${kind} \`${schema}.${name}\`: ${description} */`, `  ${key(name)}: View<{`, ...body, "  }>;"];
    namespaces.set(schema, [...(namespaces.get(schema) ?? []), ...lines]);
  }
  return [
    `// Generated by scripts/pg-catalog-from-pg.mjs from PostgreSQL ${major}. Do not edit.`,
    `import type { Col, Nullable, View } from "./column.js";`,
    "",
    "/**",
    " * Relations of `pg_catalog` in the {@link PgCatalog} slice. Catalog tables are declared as",
    " * views too: typesql treats the whole slice as read-only.",
    " */",
    "export interface PgCatalogNamespace {",
    ...namespaces.get("pg_catalog"),
    "}",
    "",
    "/** Views of `information_schema` in the {@link PgCatalog} slice. */",
    "export interface InformationSchemaNamespace {",
    ...namespaces.get("information_schema"),
    "}",
    "",
    "/**",
    ` * An opt-in slice of the PostgreSQL ${major} system catalogs: common \`pg_catalog\` tables, the`,
    " * statistics and catalog views (`pg_stat_activity`, `pg_stat_database`, `pg_tables`, ...) and",
    " * `information_schema` (`tables`, `columns`, ...). Add it to a schema with an intersection:",
    " *",
    " * ```ts",
    " * const sql = createSql<DB & PgCatalog>();",
    " * sql(\"SELECT datname, state FROM pg_stat_activity\");",
    " * ```",
    " *",
    " * `pg_catalog` relations resolve unqualified (as in Postgres, where `pg_catalog` is always on",
    " * the search path) after the schema's own relations; `information_schema` relations need the",
    " * schema prefix. Column types are the types Postgres reports (domains replaced by their base",
    " * type: `sql_identifier` is `name`, `cardinal_number` is `int4`, `yes_or_no` is `varchar`).",
    " */",
    "export interface PgCatalog {",
    "  pg_catalog: PgCatalogNamespace;",
    "  information_schema: InformationSchemaNamespace;",
    "}",
    "",
  ].join("\n");
}

export const OUTPUT = new URL("../packages/core/src/schema/pg-catalog.ts", import.meta.url);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const require = createRequire(new URL("../packages/core/package.json", import.meta.url));
  const { Client } = require("pg");
  const url = process.env.TYPESQL_PG_URL;
  if (!url) {
    console.error("set TYPESQL_PG_URL (e.g. docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=x postgres:17)");
    process.exit(2);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const source = await generatePgCatalog(client);
    if (process.argv.includes("--check")) {
      const current = readFileSync(OUTPUT, "utf8");
      if (current !== source) {
        console.error(`${fileURLToPath(OUTPUT)} is out of date; run without --check to regenerate`);
        process.exitCode = 1;
      }
    } else {
      writeFileSync(OUTPUT, source);
      console.log(`wrote ${fileURLToPath(OUTPUT)}`);
    }
  } finally {
    await client.end();
  }
}
