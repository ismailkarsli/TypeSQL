import { takeColumnValues } from "./inline.js";
import { type CompiledSql, quoteIdentWith } from "./splice.js";

/** A column name with the value given for it. */
export type ColumnEntry = readonly [column: string, value: unknown];

/** The entries of an object of column values; anything else is rejected with `message`. */
export function columnEntries<V>(value: V, message: string): ColumnEntry[] {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error(message);
	return Object.entries(value);
}

export function buildSet(
	entries: readonly ColumnEntry[],
	quote: '"' | "`" = '"',
): CompiledSql {
	const taken = takeColumnValues(entries.map(([, value]) => value));
	const parts: string[] = [];
	const out: unknown[] = [];
	entries.forEach(([key], i) => {
		const v = taken[i];
		if (v === undefined) return;
		out.push(v);
		parts.push(`${quoteIdentWith(quote, [key])} = $${out.length}`);
	});
	if (parts.length === 0)
		throw new Error(
			"typesql: sql.set() got no defined values, so there is nothing to update; skip the UPDATE when the input is empty",
		);
	return { text: parts.join(", "), values: out };
}

export function buildValues(
	rows: readonly unknown[],
	valuesDefault = true,
	quote: '"' | "`" = '"',
	emptyRow = "DEFAULT VALUES",
): CompiledSql {
	if (rows.length === 0)
		throw new Error(
			"typesql: sql.values() needs at least one row; skip the INSERT when there is nothing to insert",
		);
	if (rows.length === 1 && !(0 in rows)) return { text: emptyRow, values: [] };
	const columns: string[] = [];
	const seen = new Set<string>();
	const taken = rows.map((row) => {
		const entries = columnEntries(
			row,
			"typesql: sql.values() rows must be objects of column values",
		);
		const values = takeColumnValues(entries.map(([, value]) => value));
		const out = new Map<string, unknown>();
		entries.forEach(([key], i) => {
			const v = values[i];
			out.set(key, v);
			if (!seen.has(key) && v !== undefined) {
				seen.add(key);
				columns.push(key);
			}
		});
		return out;
	});
	if (columns.length === 0) {
		if (rows.length === 1) return { text: emptyRow, values: [] };
		throw new Error(
			"typesql: sql.values() rows have no values; Postgres cannot insert several all-default rows with VALUES",
		);
	}
	const out: unknown[] = [];
	const tuples = taken.map((row) => {
		const items = columns.map((c) => {
			const v = row.get(c);
			if (v === undefined) {
				if (valuesDefault) return "DEFAULT";
				throw new Error(
					`typesql: this dialect has no DEFAULT in VALUES: give every row a value for "${c}", or insert those rows separately`,
				);
			}
			out.push(v);
			return `$${out.length}`;
		});
		return `(${items.join(", ")})`;
	});
	return {
		text: `(${columns.map((c) => quoteIdentWith(quote, [c])).join(", ")}) VALUES ${tuples.join(", ")}`,
		values: out,
	};
}
