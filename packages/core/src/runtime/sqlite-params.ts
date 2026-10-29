import { JsonParam } from "./json.js";

const PARAMS =
	/'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|\$(\d+)/g;

export function paramNumbers(text: string): number[] {
	const seen = new Set<number>();
	for (const m of text.matchAll(PARAMS))
		if (m[1] !== undefined) seen.add(Number(m[1]));
	return [...seen];
}

export function sqliteValue(value: unknown): unknown {
	if (value instanceof JsonParam) return JSON.stringify(value.value);
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof Date)
		throw new TypeError(
			"typesql: SQLite has no date type; pass an ISO string (date.toISOString()) or a number",
		);
	return value;
}

export interface SplitStatement {
	readonly parts: readonly string[];
	readonly values: readonly unknown[];
}

export function splitParams(
	text: string,
	values: readonly unknown[],
	map: (value: unknown) => unknown = sqliteValue,
): SplitStatement {
	const parts: string[] = [];
	const out: unknown[] = [];
	let last = 0;
	for (const m of text.matchAll(PARAMS)) {
		if (m[1] === undefined) continue;
		parts.push(text.slice(last, m.index));
		out.push(map(values[Number(m[1]) - 1]));
		last = m.index + m[0].length;
	}
	parts.push(text.slice(last));
	return { parts, values: out };
}

export function positional(
	text: string,
	values: readonly unknown[],
	map: (value: unknown) => unknown = sqliteValue,
): { readonly text: string; readonly values: unknown[] } {
	const split = splitParams(text, values, map);
	return { text: split.parts.join("?"), values: [...split.values] };
}
