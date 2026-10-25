import type { InlineMarker } from "../engine/inline.js";
import { QUOTED } from "./splice.js";

/**
 * Runtime side of inline parameters.
 *
 * `param(value)` returns a token string (NUL-delimited, with a per-process random prefix, so it
 * cannot be forged by user input and never collides with SQL text) and remembers the value.
 * `resolveInline(text, start)` replaces the tokens with `$start+1`, `$start+2`, … and returns
 * the values in that order; a token whose value is `undefined` becomes `DEFAULT` and takes no
 * number. Each token is consumed by the statement that uses it; a fragment resolves its tokens
 * when it is created, so fragments can be reused.
 *
 * The declared return type is the type-level marker (`InlineMarker<T>`), which encodes the
 * value's TS type for the compile-time checks; the runtime string differs on purpose.
 */
const PREFIX = randomHex(8);
const MARK = `\u0000typesql${PREFIX}`;
const pending = new Map<string, unknown>();
let counter = 0;

/** Bind `value` as a parameter at this position of a template literal (`DEFAULT` when it is `undefined`). */
export function param<const T>(value: T): InlineMarker<T> {
	const token = `${MARK}${(counter++).toString(36)}\u0000`;
	pending.set(token, value);
	return token as InlineMarker<T>;
}

const EXACT = new RegExp(`^${MARK}[0-9a-z]+\u0000$`);
/** A quoted string, quoted identifier or comment, or (group 1: its id) a token. */
const INLINE = new RegExp(`${QUOTED.source}|${MARK}([0-9a-z]+)\u0000`, "g");

/**
 * A value passed as a value rather than in the SQL text (a `sql.set` / `sql.values` value, a
 * positional or named argument): a `sql.json()` or `sql.param()` token is replaced by the value
 * it holds (a `JsonParam` for `sql.json()`), and consumed. Anything else is returned as it is.
 */
export function takeValue(value: unknown): unknown {
	if (typeof value !== "string" || !EXACT.test(value)) return value;
	if (!pending.has(value))
		throw new Error(
			"typesql: this sql.json() / sql.param() value was already used by another statement; call it once per statement",
		);
	const v = pending.get(value);
	pending.delete(value);
	return v;
}

/** Number of tokens created but not yet used (for leak diagnostics in tests). */
export function pendingParams(): number {
	return pending.size;
}

/** Can `text` hold a token? (`resolveInline` leaves a text without a NUL as it is.) */
export function hasInline(text: string): boolean {
	// Stryker disable next-line StringLiteral: a shortcut: resolveInline returns a text without a NUL unchanged, with no values
	return text.includes("\u0000");
}

/**
 * Replace inline tokens with `$k` (k = start + 1, …) outside quotes and comments (a token whose
 * value is `undefined` with `DEFAULT`, taking no number); tokens inside a quoted string, quoted
 * identifier or comment are an error (the type checker rejects them too).
 */
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
		if (!pending.has(m))
			throw new Error(
				"typesql: this sql.param() value was already used by another statement; call sql.param() once per statement",
			);
		const value = pending.get(m);
		used.add(m);
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
