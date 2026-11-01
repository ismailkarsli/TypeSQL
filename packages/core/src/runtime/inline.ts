import { empty, isEmpty } from "../empty.js";
import type { InlineMarker } from "../sql/inline.js";
import { DOLLAR_QUOTED, QUOTED, type Spliceable } from "./splice.js";

interface Marks {
	readonly prefix: string;
	readonly mark: string;
	readonly exact: RegExp;
	readonly inline: RegExp;
	readonly fragmentMark: string;
	readonly fragment: RegExp;
}

// The markers hold a random prefix, so SQL text can't forge one. It is made
// on first use: Cloudflare Workers forbid crypto's random values in global
// scope, so importing @typesql/core must not need one. Until then no marker
// exists, and the readers below have nothing to find. A first use in global
// scope takes Math.random's instead.
let created: Marks | undefined;

function marks(): Marks {
	if (created) return created;
	const prefix = randomHex(8);
	const mark = `\u0000typesql${prefix}`;
	const fragmentMark = `${mark}~`;
	created = {
		prefix,
		mark,
		exact: new RegExp(`^${mark}[0-9a-z]+\u0000$`),
		inline: new RegExp(`${QUOTED.source}|${mark}([0-9a-z]+)\u0000`, "g"),
		fragmentMark,
		fragment: new RegExp(
			`${QUOTED.source}|${DOLLAR_QUOTED.source}|${fragmentMark}([0-9a-z]+)\u0000`,
			"g",
		),
	};
	return created;
}

const pending = new Map<string, unknown>();
let counter = 0;

export function param<const T>(value: T): InlineMarker<T> {
	if (value === undefined)
		throw new Error(
			"typesql: sql.param() does not accept undefined; use sql.optional(value) for DEFAULT or null for SQL NULL",
		);
	if (isFragment(value))
		throw new Error(
			"typesql: sql.param() takes a value, not a fragment or query; interpolate it itself: ${fragment}",
		);
	const id = (counter++).toString(36);
	const token = `${marks().mark}${id}\u0000`;
	pending.set(id, value);
	return token as InlineMarker<T>;
}

export function takeValue(value: unknown): unknown {
	const v = take(value);
	if (isEmpty(v))
		throw new Error(
			"typesql: sql.param(sql.optional(value)) and sql.json(undefined) must be interpolated inline to emit DEFAULT",
		);
	return v;
}

/** A column value for sql.set / sql.values: a DEFAULT token leaves the column out, as `undefined` does. */
export function takeColumnValue(value: unknown): unknown {
	const v = take(value);
	return isEmpty(v) ? undefined : v;
}

function take(value: unknown): unknown {
	if (isFragment(value))
		throw new Error(
			"typesql: a fragment or query is not a parameter value; interpolate it into the SQL: ${fragment}",
		);
	if (isEmpty(value))
		throw new Error(
			"typesql: sql.optional(value) cannot be a bound parameter; use an inline sql.param(sql.optional(value)) for DEFAULT",
		);
	if (typeof value !== "string" || !created?.exact.test(value)) return value;
	const id = value.slice(created.mark.length, -1);
	if (!pending.has(id))
		throw new Error(
			"typesql: this sql.json() / sql.param() value was already used by another statement; call it once per statement",
		);
	const v = pending.get(id);
	pending.delete(id);
	return v;
}

export function hasInline(text: string): boolean {
	return text.includes("\u0000");
}

export function resolveInline(
	text: string,
	start: number,
): { text: string; values: unknown[] } {
	if (!created)
		throw new Error(
			"typesql: the SQL text contains a NUL character that is not a sql.param() token",
		);
	const { mark, inline } = created;
	const values: unknown[] = [];
	const used: string[] = [];
	let k = start;
	let out = "";
	let last = 0;
	inline.lastIndex = 0;
	for (
		let match = inline.exec(text);
		match !== null;
		match = inline.exec(text)
	) {
		const m = match[0];
		const id = match[1];
		if (id === undefined) {
			if (!m.includes(mark)) continue;
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

const FRAGMENTS = new WeakSet<object>();
const fragments = new Map<string, Spliceable>();

/** Lets `${fragment}` or `${query}` splice it in place. */
export function inlineable<F extends Spliceable>(fragment: F): F {
	FRAGMENTS.add(fragment);
	Object.defineProperty(fragment, "toString", {
		value: () => token(fragment),
	});
	return fragment;
}

function token(fragment: Spliceable): string {
	const id = (counter++).toString(36);
	fragments.set(id, fragment);
	return `${marks().fragmentMark}${id}\u0000`;
}

const NOTHING: Spliceable = { text: "", values: [] };
Object.defineProperty(empty, "toString", { value: () => token(NOTHING) });

function isFragment(value: unknown): boolean {
	return typeof value === "object" && value !== null && FRAGMENTS.has(value);
}

/**
 * Turns each interpolated fragment into an internal `{name}` slot for
 * splice(). The names hold the random marker prefix, so no `{…}` written in
 * the SQL can match them.
 */
export function resolveFragments(
	text: string,
): { text: string; slots: Record<string, Spliceable> } | null {
	if (!created || !text.includes(created.fragmentMark)) return null;
	const { prefix, fragmentMark, fragment: pattern } = created;
	const slots: Record<string, Spliceable> = {};
	const used: string[] = [];
	const out = text.replace(pattern, (m: string, _tag?: string, id?: string) => {
		if (id === undefined) {
			if (!m.includes(fragmentMark)) return m;
			const where =
				m[0] === "$"
					? "a dollar-quoted string"
					: m[0] === '"'
						? "a quoted identifier"
						: m[0] === "'" || m[0] === "E" || m[0] === "e"
							? "a quoted string"
							: "a comment";
			throw new Error(
				`typesql: a fragment cannot be interpolated inside ${where}; remove the surrounding quotes or comment`,
			);
		}
		const fragment = fragments.get(id);
		if (fragment === undefined)
			throw new Error(
				"typesql: this interpolated fragment was already used by another statement; interpolate the fragment again for each statement",
			);
		used.push(id);
		const name = `_typesql${prefix}_${used.length}`;
		slots[name] = fragment;
		return `{${name}}`;
	});
	for (const id of used) fragments.delete(id);
	return { text: out, slots };
}

function randomHex(bytes: number): string {
	const crypto = (
		globalThis as { crypto?: { getRandomValues(a: Uint8Array): Uint8Array } }
	).crypto;
	let a: Uint8Array | undefined;
	try {
		a = crypto?.getRandomValues(new Uint8Array(bytes));
	} catch {
		// Cloudflare Workers throw in global scope, where a module-level
		// sql.param() or fragment makes the first marker.
	}
	a ??= new Uint8Array(bytes).map(() => Math.floor(Math.random() * 256));
	return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
