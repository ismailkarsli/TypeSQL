import { JsonParam } from "./json.js";

const PARAMS =
	/'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|\$(\d+)/g;

export function paramNumbers(text: string): number[] {
	const seen = new Set<number>();
	for (const m of text.matchAll(PARAMS))
		if (m[1] !== undefined) seen.add(Number(m[1]));
	return [...seen];
}

export function sqliteValue<V>(value: V): V | string | 0 | 1 {
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

/** `map` converts each value for the driver; sqliteValue by default. */
export function splitParams<V, R>(
	text: string,
	values: readonly V[],
	map?: (value: V | undefined) => R,
): SplitStatement {
	const parts: string[] = [];
	const out: unknown[] = [];
	let last = 0;
	for (const m of text.matchAll(PARAMS)) {
		if (m[1] === undefined) continue;
		parts.push(text.slice(last, m.index));
		const value = values[Number(m[1]) - 1];
		out.push(map ? map(value) : sqliteValue(value));
		last = m.index + m[0].length;
	}
	parts.push(text.slice(last));
	return { parts, values: out };
}

/** SQL text with `?` placeholders, and the value for each. */
export interface PositionalStatement {
	readonly text: string;
	readonly values: unknown[];
}

export function positional<V, R>(
	text: string,
	values: readonly V[],
	map?: (value: V | undefined) => R,
): PositionalStatement {
	const split = splitParams(text, values, map);
	return { text: split.parts.join("?"), values: [...split.values] };
}
