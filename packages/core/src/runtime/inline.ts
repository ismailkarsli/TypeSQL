import { isEmpty } from "../empty.js";
import type { InlineMarker } from "../sql/inline.js";
import { QUOTED } from "./splice.js";

const PREFIX = randomHex(8);
const MARK = `\u0000typesql${PREFIX}`;
const pending = new Map<string, unknown>();
let counter = 0;

export function param<const T>(value: T): InlineMarker<T> {
	if (value === undefined)
		throw new Error(
			"typesql: sql.param() does not accept undefined; use sql.empty for DEFAULT or null for SQL NULL",
		);
	const id = (counter++).toString(36);
	const token = `${MARK}${id}\u0000`;
	pending.set(id, value);
	return token as InlineMarker<T>;
}

const EXACT = new RegExp(`^${MARK}[0-9a-z]+\u0000$`);
const INLINE = new RegExp(`${QUOTED.source}|${MARK}([0-9a-z]+)\u0000`, "g");

export function takeValue(value: unknown): unknown {
	if (isEmpty(value))
		throw new Error(
			"typesql: sql.empty cannot be a bound parameter; use an inline sql.param(sql.empty) for DEFAULT",
		);
	if (typeof value !== "string" || !EXACT.test(value)) return value;
	const id = value.slice(MARK.length, -1);
	if (!pending.has(id))
		throw new Error(
			"typesql: this sql.json() / sql.param() value was already used by another statement; call it once per statement",
		);
	const v = pending.get(id);
	pending.delete(id);
	if (isEmpty(v))
		throw new Error(
			"typesql: sql.param(sql.empty) must be interpolated inline to emit DEFAULT",
		);
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
	const used: string[] = [];
	let k = start;
	let out = "";
	let last = 0;
	INLINE.lastIndex = 0;
	for (
		let match = INLINE.exec(text);
		match !== null;
		match = INLINE.exec(text)
	) {
		const m = match[0];
		const id = match[1];
		if (id === undefined) {
			if (!m.includes(MARK)) continue;
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
		used.push(id);
		out += text.slice(last, match.index);
		if (isEmpty(value)) out += "DEFAULT";
		else {
			values.push(value);
			out += `$${++k}`;
		}
		last = match.index + m.length;
	}
	out += text.slice(last);
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
