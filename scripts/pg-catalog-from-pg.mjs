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
// The analysis lives in packages/pg/src/introspect/nullability.ts (also used by `typesql
// introspect`). Columns of set-returning functions (pg_stat_get_activity(), pg_lock_status(),
// ...) are nullable unless listed in FUNCTION_COLUMNS_NOT_NULL, checked against the C source.
//
// The output targets the Postgres major version it was generated from (17); the conformance
// test packages/core/test/conformance/pg-catalog.test.ts regenerates it and compares.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// Shared with `typesql introspect` (@typesql/pg); loaded through Node's type stripping.
import { ViewNullability } from "../packages/pg/src/introspect/nullability.ts";

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

/** Column types of a relation (domains replaced by their base type), in column order. */
async function columnsOf(client, relid) {
  const { rows } = await client.query(
    `SELECT a.attname AS name, a.attnotnull AS notnull,
            CASE WHEN t.typtype = 'd' THEN bt.typname ELSE t.typname END AS typname,
            CASE WHEN t.typtype = 'd' THEN bte.typname ELSE te.typname END AS elem
       FROM pg_attribute a
       JOIN pg_type t ON t.oid = a.atttypid
       LEFT JOIN pg_type bt ON bt.oid = t.typbasetype
       -- true arrays only: int2vector and oidvector have a typelem too, but are not its typarray
       LEFT JOIN pg_type te ON te.oid = t.typelem AND te.typarray = t.oid
       LEFT JOIN pg_type bte ON bte.oid = bt.typelem AND bte.typarray = bt.oid
      WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    [relid],
  );
  return rows.map((r) => ({ name: r.name, type: r.elem ? `${r.elem}[]` : r.typname, notnull: r.notnull }));
}

// ───────────────────────────── emit ─────────────────────────────

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name) => (IDENT.test(name) ? name : JSON.stringify(name));

/** Source of packages/core/src/schema/pg-catalog.ts for the connected server. */
export async function generatePgCatalog(client) {
  const views = new ViewNullability((text, values) => client.query(text, values), {
    notNull: (view, column) => FUNCTION_COLUMNS_NOT_NULL.has(`${view}.${column}`),
  });
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
    const cols = await columnsOf(client, oid);
    const notnull = relkind === "v" ? await views.notNull(oid) : cols.map((c) => c.notnull);
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
