import type { IntrospectedColumn, IntrospectedDatabase, IntrospectedRelation } from "./introspect.js";

export interface GenerateOptions {
  /** Name of the exported schema interface. Default `"DB"`. */
  readonly typeName?: string;
  /** Module the column helpers are imported from. Default `"@typesql/core"`. */
  readonly importFrom?: string;
  /** Extra lines after the helper import, e.g. `import type { HistoryItem } from "./json.js";`. */
  readonly imports?: readonly string[];
  /**
   * TypeScript types for individual columns (meant for `json`/`jsonb` columns): a map keyed
   * `"table.column"` (public) or `"schema.table.column"`, or a function returning the TS type
   * source for a column (or `undefined`). Such a column is declared with its key as the type
   * name (`Col<"portfolio.history">`) and the TS type goes into the exported `columnTypesName`
   * interface, to be merged into the type map: `createSql<DB, PgTypeMap & ColumnTypes>()`.
   */
  readonly columnTypes?:
    | Readonly<Record<string, string>>
    | ((column: IntrospectedColumn, relation: IntrospectedRelation) => string | undefined);
  /** Name of the interface that holds `columnTypes`. Default `"ColumnTypes"`. */
  readonly columnTypesName?: string;
  /**
   * Full control over one column: return the TypeScript source of its descriptor
   * (`Col<"jsonb">`, a helper of your own, ...) or `undefined` to keep the default.
   */
  readonly column?: (column: IntrospectedColumn, relation: IntrospectedRelation) => string | undefined;
  /** Emit table and column comments and notes as JSDoc. Default `true`. */
  readonly comments?: boolean;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string): string => (IDENT.test(name) ? name : JSON.stringify(name));
const str = (s: string): string => JSON.stringify(s);

function doc(lines: readonly string[], indent: string): string {
  const text = lines.flatMap((l) => l.split("\n")).map((l) => l.replace(/\*\//g, "*\\/").trimEnd());
  if (text.length === 0) return "";
  if (text.length === 1) return `${indent}/** ${text[0]} */\n`;
  return `${indent}/**\n${text.map((l) => `${indent} *${l ? ` ${l}` : ""}`).join("\n")}\n${indent} */\n`;
}

type Helper = "Col" | "Nullable" | "Generated" | "NullableGenerated";
const helperFor = (nullable: boolean, hasDefault: boolean): Helper =>
  nullable ? (hasDefault ? "NullableGenerated" : "Nullable") : hasDefault ? "Generated" : "Col";

function columnNotes(c: IntrospectedColumn): string[] {
  const notes: string[] = [];
  if (c.comment) notes.push(c.comment);
  if (c.domain) notes.push(`Domain \`${c.domain}\`.`);
  else if (c.declaredType === "citext") notes.push("`citext`: typed as `text`.");
  if (c.generated !== null) notes.push(`\`GENERATED ALWAYS AS (${c.generated}) STORED\`: cannot be written.`);
  if (c.identity === "always") notes.push("`GENERATED ALWAYS AS IDENTITY`: written only with `OVERRIDING SYSTEM VALUE`.");
  return notes;
}

/**
 * TypeScript source declaring the typesql schema of an introspected database: `public`
 * relations at the top level, other schemas nested (`DB["auth"]["sessions"]`), views and
 * materialized views as `View<…>`, enums under `$types`.
 */
export function generateSource(db: IntrospectedDatabase, options: GenerateOptions = {}): string {
  const typeName = options.typeName ?? "DB";
  const columnTypesName = options.columnTypesName ?? "ColumnTypes";
  const comments = options.comments ?? true;
  const columnTypes = options.columnTypes ?? {};
  const used = new Set<string>();
  const usedColumnTypes = new Map<string, string>();

  /** `[type-map key, TS type]` of a column with a custom TS type. */
  const customType = (rel: IntrospectedRelation, col: IntrospectedColumn): [string, string] | undefined => {
    const qualified = `${rel.schema}.${rel.name}.${col.name}`;
    const short = `${rel.name}.${col.name}`;
    if (typeof columnTypes === "function") {
      const ts = columnTypes(col, rel);
      return ts === undefined ? undefined : [rel.schema === "public" ? short : qualified, ts];
    }
    if (qualified in columnTypes) return [qualified, columnTypes[qualified]!];
    return rel.schema === "public" && short in columnTypes ? [short, columnTypes[short]!] : undefined;
  };

  const relation = (rel: IntrospectedRelation, indent: string): string => {
    const isView = rel.kind === "view" || rel.kind === "materialized view";
    const cols = rel.columns.map((c) => {
      let descriptor = options.column?.(c, rel);
      if (descriptor === undefined) {
        const custom = customType(rel, c);
        if (custom !== undefined) usedColumnTypes.set(custom[0], custom[1]);
        const helper = helperFor(c.nullable, c.hasDefault);
        used.add(helper);
        descriptor = `${helper}<${str(custom?.[0] ?? c.type)}>`;
      }
      return `${comments ? doc(columnNotes(c), `${indent}  `) : ""}${indent}  ${key(c.name)}: ${descriptor};`;
    });
    const body = `{\n${cols.join("\n")}\n${indent}}`;
    if (!isView) return body;
    used.add("View");
    return `View<${body}>`;
  };

  const relDoc = (rel: IntrospectedRelation, indent: string): string => {
    if (!comments) return "";
    const kind = rel.kind === "table" ? [] : [`${rel.kind[0]!.toUpperCase()}${rel.kind.slice(1)}.`];
    return doc([...(rel.comment ? [rel.comment] : []), ...kind], indent);
  };

  const topLevel = new Set(db.relations.filter((r) => r.schema === "public").map((r) => r.name));
  const lines: string[] = [];
  const namespaces = new Map<string, IntrospectedRelation[]>();
  for (const rel of db.relations) {
    if (rel.schema === "public") lines.push(`${relDoc(rel, "  ")}  ${key(rel.name)}: ${relation(rel, "  ")};`);
    else namespaces.set(rel.schema, [...(namespaces.get(rel.schema) ?? []), rel]);
  }
  for (const [schema, rels] of namespaces) {
    if (topLevel.has(schema)) {
      throw new Error(`schema "${schema}" has the same name as the table "public.${schema}": typesql keeps public relations and schemas in one object`);
    }
    const body = rels.map((r) => `${relDoc(r, "    ")}    ${key(r.name)}: ${relation(r, "    ")};`);
    lines.push(`  ${key(schema)}: {\n${body.join("\n")}\n  };`);
  }

  if (db.enums.length > 0) {
    // typesql's enum registry is flat (`Col<"mood">`, schema qualifiers are dropped), so enums
    // of the same name in different schemas share an entry.
    const byName = new Map<string, { values: Set<string>; schemas: string[] }>();
    for (const e of db.enums) {
      const entry = byName.get(e.name) ?? { values: new Set<string>(), schemas: [] };
      for (const v of e.values) entry.values.add(v);
      entry.schemas.push(e.schema);
      byName.set(e.name, entry);
    }
    const entries = [...byName].map(([name, { values, schemas }]) => {
      const notes = comments && schemas.length > 1 ? doc([`Enums of the same name in ${schemas.map((s) => `\`${s}\``).join(", ")}.`], "    ") : "";
      return `${notes}    ${key(name)}: ${[...values].map(str).join(" | ") || "never"};`;
    });
    lines.push(`  $types: {\n${entries.join("\n")}\n  };`);
  }

  const helpers = ["Col", "Generated", "Nullable", "NullableGenerated", "View"].filter((h) => used.has(h));
  const out = [
    `// Generated by \`typesql introspect\` (@typesql/pg) from PostgreSQL ${db.version.split(/[.\s]/)[0]}. Do not edit.`,
    ...(helpers.length > 0 ? [`import type { ${helpers.join(", ")} } from ${str(options.importFrom ?? "@typesql/core")};`] : []),
    ...(options.imports ?? []),
    "",
    `export interface ${key(typeName)} {`,
    ...lines,
    "}",
    "",
  ];
  if (usedColumnTypes.size > 0) {
    out.push(
      `/** TypeScript types of columns declared with a custom type name. Merge into the type map: \`createSql<${typeName}, PgTypeMap & ${columnTypesName}>()\`. */`,
      `export interface ${columnTypesName} {`,
      ...[...usedColumnTypes].map(([k, ts]) => `  ${str(k)}: ${ts};`),
      "}",
      "",
    );
  }
  const unknownKeys = typeof columnTypes === "function" ? [] : Object.keys(columnTypes).filter((k) => !usedColumnTypes.has(k));
  if (unknownKeys.length > 0 && options.column === undefined) {
    throw new Error(`columnTypes: no column ${unknownKeys.map((k) => JSON.stringify(k)).join(", ")} (keys are "table.column" for public tables, else "schema.table.column")`);
  }
  return out.join("\n");
}
