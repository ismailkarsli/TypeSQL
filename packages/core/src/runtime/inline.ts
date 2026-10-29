import type { InlineMarker } from "../sql/inline.js";
import { QUOTED } from "./splice.js";

const PREFIX = randomHex(8);
const MARK = `\u0000typesql${PREFIX}`;
const pending = new Map<string, unknown>();
let counter = 0;

export function param<const T>(value: T): InlineMarker<T> {
	const id = (counter++).toString(36);
	const token = `${MARK}${id}\u0000`;
	pending.set(id, value);
	return token as InlineMarker<T>;
}

const EXACT = new RegExp(`^${MARK}[0-9a-z]+\u0000$`);
const INLINE = new RegExp(`${QUOTED.source}|${MARK}([0-9a-z]+)\u0000`, "g");

export function takeValue(value: unknown): unknown {
	if (typeof value !== "string" || !EXACT.test(value)) return value;
	const id = value.slice(MARK.length, -1);
	if (!pending.has(id))
		throw new Error(
			"typesql: this sql.json() / sql.param() value was already used by another statement; call it once per statement",
		);
	const v = pending.get(id);
	pending.delete(id);
	return v;
}

export function pendingParams(): number {
	return pending.size;
}

export function hasInline(text: string): boolean {
	return text.includes("\u0000");
}

export function resolveInline(
	text: string,
	start: number,
): { text: string; values: unknown[] } {
	const values: unknown[] = [];
	const used = new Set<string>();
	let k = start;
	const out = text.replace(INLINE, (m: string, id?: string) => {
		if (id === undefined) {
			if (!m.includes(MARK)) return m;
			const where =
				m[0] === "'"
					? "a quoted string"
					: m[0] === '"'
						? "a quoted identifier"
						: "a comment";
			throw new Error(
				`typesql: sql.param() cannot be used inside ${where}; remove the surrounding quotes or comment`,
			);
		}
		if (!pending.has(id))
			throw new Error(
				"typesql: this sql.param() value was already used by another statement; call sql.param() once per statement",
			);
		const value = pending.get(id);
		used.add(id);
		if (value === undefined) return "DEFAULT";
		values.push(value);
		return `$${++k}`;
	});
	for (const t of used) pending.delete(t);
	if (out.includes("\u0000"))
		throw new Error(
			"typesql: the SQL text contains a NUL character that is not a sql.param() token",
		);
	return { text: out, values };
}

function randomHex(bytes: number): string {
	const crypto = (
		globalThis as { crypto?: { getRandomValues(a: Uint8Array): Uint8Array } }
	).crypto;
	const a = crypto
		? crypto.getRandomValues(new Uint8Array(bytes))
		: new Uint8Array(bytes).map(() => Math.floor(Math.random() * 256));
	return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
