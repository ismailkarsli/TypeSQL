import { JsonParam } from "./json.js";
import type { PositionalStatement } from "./sqlite-params.js";

/**
 * Strings (with backslash escapes), quoted identifiers and comments, which
 * can't hold parameters, and `$n`.
 */
const PARAMS =
	/'(?:[^'\\]|\\[\s\S]|'')*'?|"(?:[^"\\]|\\[\s\S]|"")*"?|`(?:[^`]|``)*`?|--(?=[\s]|$)[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|(?<![\w$])\$(\d+)(?![\w$])/g;

/** A value as MySQL drivers bind it: `sql.json(value)` becomes JSON text. */
export function mysqlValue<V>(value: V): V | string {
	if (value instanceof JsonParam) return JSON.stringify(value.value);
	return value;
}

/**
 * Rewrites TypeSQL's `$1`, `$2`, … to MySQL's positional `?`, repeating a
 * value for each use of its parameter. `map` converts each value for the
 * driver; mysqlValue by default.
 */
export function mysqlPositional<V, R>(
	text: string,
	values: readonly V[],
	map?: (value: V | undefined) => R,
): PositionalStatement {
	if (!text.includes("$")) return { text, values: [] };
	const out: unknown[] = [];
	const rewritten = text.replace(PARAMS, (m: string, n?: string) => {
		if (n === undefined) return m;
		const value = values[Number(n) - 1];
		out.push(map ? map(value) : mysqlValue(value));
		return "?";
	});
	return { text: rewritten, values: out };
}
