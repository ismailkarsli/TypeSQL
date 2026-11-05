import { mysqlValue } from "@typesql/core/adapter";

/**
 * Strings (with backslash escapes), quoted identifiers and comments, which
 * can't hold parameters, and `$n`: the scanner of `mysqlPositional`.
 */
const PARAMS =
	/'(?:[^'\\]|\\[\s\S]|'')*'?|"(?:[^"\\]|\\[\s\S]|"")*"?|`(?:[^`]|``)*`?|--(?=[\s]|$)[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|(?<![\w$])\$(\d+)(?![\w$])/g;

const ESCAPES: ReadonlyMap<string, string> = new Map([
	["\0", "\\0"],
	["\b", "\\b"],
	["\t", "\\t"],
	["\n", "\\n"],
	["\r", "\\r"],
	["\x1a", "\\Z"],
	["\\", "\\\\"],
	["'", "\\'"],
	['"', '\\"'],
]);

function quote(s: string): string {
	let out = "'";
	for (const c of s) out += ESCAPES.get(c) ?? c;
	return `${out}'`;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** A value as a MySQL literal. Dates are written in UTC, the serverless platforms' time zone. */
function literal<V>(value: V): string {
	const v = mysqlValue(value);
	if (v === null || v === undefined) return "NULL";
	switch (typeof v) {
		case "string":
			return quote(v);
		case "boolean":
			return v ? "TRUE" : "FALSE";
		case "bigint":
			return v < 0n ? `(${v})` : String(v);
		case "number":
			if (!Number.isFinite(v))
				throw new TypeError(`typesql: MySQL has no ${v} value`);
			// `5-$1` must not become the comment-free but odd `5--1`.
			return v < 0 ? `(${v})` : String(v);
	}
	if (v instanceof Date) {
		if (Number.isNaN(v.getTime()))
			throw new TypeError("typesql: cannot bind an invalid Date");
		return `'${pad(v.getUTCFullYear(), 4)}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}.${pad(v.getUTCMilliseconds(), 3)}'`;
	}
	if (v instanceof Uint8Array) {
		let hex = "";
		for (const b of v) hex += b.toString(16).padStart(2, "0");
		return `X'${hex}'`;
	}
	throw new TypeError(
		`typesql: cannot bind ${Object.prototype.toString.call(v)} as a MySQL value; use sql.json() for JSON`,
	);
}

/**
 * The HTTP drivers bind nothing on the server, so `$1`, `$2`, … become
 * escaped literals in the statement text.
 */
export function inline(text: string, values: readonly unknown[]): string {
	if (!text.includes("$")) return text;
	return text.replace(PARAMS, (m: string, n?: string) =>
		n === undefined ? m : literal(values[Number(n) - 1]),
	);
}
