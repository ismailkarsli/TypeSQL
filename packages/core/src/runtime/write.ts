import type { Dialect } from "../dialect.js";
import { bind, type CompiledSql, ident } from "./compile.js";

/** The column values of an object; a DEFAULT marker becomes `undefined`. */
function entries<V>(value: V, what: string): [string, unknown][] {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error(`typesql: ${what} must be an object of column values`);
	const list = Object.entries(value);
	const taken = bind(
		[],
		list.map(([, v]) => v),
		true,
	);
	return list.map(([key], i) => [key, taken[i]]);
}

export function buildSet<V>(value: V, quote: string): CompiledSql {
	const columns = entries(value, "sql.set()").filter(
		([, v]) => v !== undefined,
	);
	if (columns.length === 0)
		throw new Error("typesql: sql.set() got no values; skip the UPDATE");
	return {
		text: columns
			.map(([key], i) => `${ident(quote, [key])} = $${i + 1}`)
			.join(", "),
		values: columns.map(([, v]) => v),
	};
}

export function buildValues(
	rows: readonly unknown[],
	dialect: Dialect,
	quote: string,
): CompiledSql {
	const emptyRow = { text: dialect.emptyRow ?? "DEFAULT VALUES", values: [] };
	if (rows.length === 0)
		throw new Error("typesql: sql.values() got no rows; skip the INSERT");
	if (rows.length === 1 && !(0 in rows)) return emptyRow;
	const taken = rows.map((row) => new Map(entries(row, "a sql.values() row")));
	const columns: string[] = [];
	for (const row of taken)
		for (const [key, v] of row)
			if (v !== undefined && !columns.includes(key)) columns.push(key);
	if (columns.length === 0) {
		if (rows.length === 1) return emptyRow;
		throw new Error("typesql: sql.values() rows have no values");
	}
	const values: unknown[] = [];
	const tuples = taken.map(
		(row) =>
			`(${columns
				.map((column) => {
					const v = row.get(column);
					if (v !== undefined) {
						values.push(v);
						return `$${values.length}`;
					}
					if (dialect.valuesDefault === false)
						throw new Error(
							`typesql: no DEFAULT in VALUES here; give every row "${column}"`,
						);
					return "DEFAULT";
				})
				.join(", ")})`,
	);
	return {
		text: `(${columns.map((c) => ident(quote, [c])).join(", ")}) VALUES ${tuples.join(", ")}`,
		values,
	};
}
