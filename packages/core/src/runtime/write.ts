import { takeValue } from "./inline.js";
import { quoteIdent } from "./splice.js";

const own = (o: object, k: string) => Object.hasOwn(o, k);

export function buildSet(values: Readonly<Record<string, unknown>>): {
	text: string;
	values: unknown[];
} {
	if (values === null || typeof values !== "object" || Array.isArray(values))
		throw new Error("typesql: sql.set() takes an object of column values");
	const parts: string[] = [];
	const out: unknown[] = [];
	for (const key of Object.keys(values)) {
		const v = takeValue(values[key]);
		if (v === undefined) continue;
		out.push(v);
		parts.push(`${quoteIdent(key)} = $${out.length}`);
	}
	if (parts.length === 0)
		throw new Error(
			"typesql: sql.set() got no defined values, so there is nothing to update; skip the UPDATE when the input is empty",
		);
	return { text: parts.join(", "), values: out };
}

export function buildValues(
	rows: readonly Readonly<Record<string, unknown>>[],
	valuesDefault = true,
): { text: string; values: unknown[] } {
	if (!Array.isArray(rows))
		throw new Error("typesql: sql.values() takes an array of rows");
	if (rows.length === 0)
		throw new Error(
			"typesql: sql.values() needs at least one row; skip the INSERT when there is nothing to insert",
		);
	const columns: string[] = [];
	const seen = new Set<string>();
	const taken = rows.map((row) => {
		if (row === null || typeof row !== "object" || Array.isArray(row))
			throw new Error(
				"typesql: sql.values() rows must be objects of column values",
			);
		const out = Object.create(null) as Record<string, unknown>;
		for (const key of Object.keys(row)) {
			const v = takeValue(row[key]);
			out[key] = v;
			if (!seen.has(key) && v !== undefined) {
				seen.add(key);
				columns.push(key);
			}
		}
		return out;
	});
	if (columns.length === 0) {
		if (rows.length === 1) return { text: "DEFAULT VALUES", values: [] };
		throw new Error(
			"typesql: sql.values() rows have no values; Postgres cannot insert several all-default rows with VALUES",
		);
	}
	const out: unknown[] = [];
	const tuples = taken.map((row) => {
		const items = columns.map((c) => {
			const v = own(row, c) ? row[c] : undefined;
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
		text: `(${columns.map((c) => quoteIdent(c)).join(", ")}) VALUES ${tuples.join(", ")}`,
		values: out,
	};
}
