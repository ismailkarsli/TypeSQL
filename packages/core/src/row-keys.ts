import { memo } from "./runtime/splice.js";

export type RowKeys = "preserve" | "camelCase";

export interface SqlOptions {
	readonly rowKeys?: RowKeys;
}

export type CamelCase<S extends string> = S extends `${string}_${string}`
	? S extends `${infer H}${infer R}`
		? `${H}${CamelRest<R, H extends "_" ? true : false>}`
		: S
	: S;
type CamelRest<
	S extends string,
	Up extends boolean,
> = S extends `${infer A}_${infer B}`
	? `${Up extends true ? Capitalize<A> : A}${CamelRest<B, true>}`
	: Up extends true
		? Capitalize<S>
		: S;

export type CamelCaseKeys<Row> = Row extends object
	? { [K in keyof Row as K extends string ? CamelCase<K> : K]: Row[K] }
	: Row;

export type KeyedRow<Row, K extends RowKeys> = K extends "camelCase"
	? CamelCaseKeys<Row>
	: Row;

const camelCased = memo((key: string) => {
	let mapped = key[0]!;
	for (let i = 1; i < key.length; i++) {
		const c = key[i]!;
		if (c !== "_") mapped += key[i - 1] === "_" ? c.toUpperCase() : c;
	}
	return mapped;
});

export function camelCase(key: string): string {
	return key.includes("_") ? camelCased(key) : key;
}

function camelCaseRow(row: unknown): unknown {
	if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(row))
		out[camelCase(key)] = (row as Record<string, unknown>)[key];
	return out;
}

export function applyRowKeys(
	rows: readonly unknown[],
	rowKeys: RowKeys | undefined,
): unknown[] {
	return rowKeys === "camelCase" ? rows.map(camelCaseRow) : Array.from(rows);
}
