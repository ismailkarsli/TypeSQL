import { quoteIdent } from "./splice.js";

/**
 * Runtime side of `sql.set` and `sql.values`. Keys are quoted as identifiers; values become
 * `$n` parameters (never text). The table name is only used by the types.
 */

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** `"a" = $1, "b" = $2` for the defined values (`undefined` is skipped). Throws when none are. */
export function buildSet(values: Readonly<Record<string, unknown>>): { text: string; values: unknown[] } {
  if (values === null || typeof values !== "object" || Array.isArray(values)) throw new Error("typesql: sql.set() takes an object of column values");
  const parts: string[] = [];
  const out: unknown[] = [];
  for (const key of Object.keys(values)) {
    const v = values[key];
    if (v === undefined) continue;
    out.push(v);
    parts.push(`${quoteIdent(key)} = $${out.length}`);
  }
  if (parts.length === 0) throw new Error("typesql: sql.set() got no defined values, so there is nothing to update; skip the UPDATE when the input is empty");
  return { text: parts.join(", "), values: out };
}

/**
 * `("a", "b") VALUES ($1, $2), ($3, DEFAULT)`: the columns are the keys with a defined value in
 * any row, in order of first appearance; a missing or `undefined` value is `DEFAULT`. One row
 * without any value is `DEFAULT VALUES`. Throws on an empty array.
 */
export function buildValues(rows: readonly Readonly<Record<string, unknown>>[]): { text: string; values: unknown[] } {
  if (!Array.isArray(rows)) throw new Error("typesql: sql.values() takes an array of rows");
  if (rows.length === 0) throw new Error("typesql: sql.values() needs at least one row; skip the INSERT when there is nothing to insert");
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) throw new Error("typesql: sql.values() rows must be objects of column values");
    for (const key of Object.keys(row)) {
      if (!seen.has(key) && row[key] !== undefined) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  if (columns.length === 0) {
    if (rows.length === 1) return { text: "DEFAULT VALUES", values: [] };
    throw new Error("typesql: sql.values() rows have no values; Postgres cannot insert several all-default rows with VALUES");
  }
  const out: unknown[] = [];
  const tuples = rows.map((row) => {
    const items = columns.map((c) => {
      const v = own(row, c) ? row[c] : undefined;
      if (v === undefined) return "DEFAULT";
      out.push(v);
      return `$${out.length}`;
    });
    return `(${items.join(", ")})`;
  });
  return { text: `(${columns.map((c) => quoteIdent(c)).join(", ")}) VALUES ${tuples.join(", ")}`, values: out };
}
