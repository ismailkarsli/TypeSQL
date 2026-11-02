import { empty, isEmpty } from "../empty.js";
import type { InlineMarker } from "../sql/inline.js";
import {
	DOLLAR_QUOTED,
	QUOTED,
	replaceSql,
	type Spliceable,
	sqlMatches,
} from "./splice.js";

/** Markers with one random prefix. */
interface Generation {
	readonly prefix: string;
	readonly mark: string;
	readonly fragmentMark: string;
	/** Whether the prefix came from crypto rather than Math.random. */
	readonly strong: boolean;
	/** Its markers not used yet. */
	readonly ids: Set<string>;
}

/** What the readers below look for: the markers of every live generation. */
interface Readers {
	readonly marks: readonly string[];
	readonly fragmentMarks: readonly string[];
	readonly exact: RegExp;
	readonly inline: RegExp;
	readonly fragment: RegExp;
}

// The markers hold a random prefix, so SQL text can't forge one. It is made
// on first use: Cloudflare Workers forbid crypto's random values in global
// scope, so importing @typesql/core must not need one. Until then no marker
// exists, and the readers below have nothing to find.
//
// A first use in global scope, such as a module-level sql.param(), takes
// Math.random's values instead. The next use where crypto works starts a
// generation with a crypto prefix, and the Math.random one is read only
// while one of its markers is still unused.
const generations: Generation[] = [];
let readers: Readers | undefined;
const owners = new Map<string, Generation>();

function generation(prefix: string, strong: boolean): Generation {
	const mark = `\u0000typesql${prefix}`;
	return { prefix, mark, fragmentMark: `${mark}~`, strong, ids: new Set() };
}

/** A new marker's generation, which holds `id` until it is used. */
function issue(id: string): Generation {
	let current = generations.at(-1);
	if (!current?.strong) {
		const random = cryptoHex(8);
		if (random !== undefined || current === undefined) {
			current = generation(random ?? mathHex(8), random !== undefined);
			generations.push(current);
			prune();
		}
	}
	current.ids.add(id);
	owners.set(id, current);
	return current;
}

/** A marker was used. */
function settle(id: string): void {
	const owner = owners.get(id);
	if (owner === undefined) return;
	owners.delete(id);
	owner.ids.delete(id);
	if (owner.ids.size === 0 && owner !== generations.at(-1)) prune();
}

/** Drop the earlier generations with no unused marker, and rebuild the readers. */
function prune(): void {
	const live = generations.filter(
		(g, i) => i === generations.length - 1 || g.ids.size > 0,
	);
	generations.splice(0, generations.length, ...live);
	const marks = live.map((g) => g.mark);
	const fragmentMarks = live.map((g) => g.fragmentMark);
	const mark = `(?:${marks.join("|")})`;
	readers = {
		marks,
		fragmentMarks,
		exact: new RegExp(`^${mark}([0-9a-z]+)\u0000$`),
		inline: new RegExp(`${QUOTED.source}|${mark}([0-9a-z]+)\u0000`, "g"),
		fragment: new RegExp(
			`${QUOTED.source}|${DOLLAR_QUOTED.source}|(?:${fragmentMarks.join("|")})([0-9a-z]+)\u0000`,
			"g",
		),
	};
}

const pending = new Map<string, unknown>();
let counter = 0;

/** What every marker starts with, whatever its prefix. */
const MARK = "\u0000typesql";

/** Whether a string holds a marker: a sql.param() or sql.json() value, or a fragment. */
const holdsMarker = (text: string): boolean => text.includes(MARK);

/** Whether a value holds a marker in a string, as itself or in a plain object or array. */
export function holdsMarkers(
	value: unknown,
	seen = new Set<object>(),
): boolean {
	if (typeof value === "string") return holdsMarker(value);
	if (value === null || typeof value !== "object" || seen.has(value))
		return false;
	seen.add(value);
	if (Array.isArray(value)) return value.some((v) => holdsMarkers(v, seen));
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return false;
	return Object.entries(value).some(
		([key, v]) => holdsMarker(key) || holdsMarkers(v, seen),
	);
}

/**
 * A marker's id: a counter, so it is unique, and random hex, so a plain
 * value can't name another statement's pending value even when a marker
 * leaks, with its prefix, into stored data or a log.
 */
function nextId(): string {
	return `${(counter++).toString(36)}${randomHex(8)}`;
}

export function param<const T>(value: T): InlineMarker<T> {
	if (value === undefined)
		throw new Error(
			"typesql: sql.param() does not accept undefined; use sql.optional(value) for DEFAULT or null for SQL NULL",
		);
	if (isFragment(value))
		throw new Error(
			"typesql: sql.param() takes a value, not a fragment or query; interpolate it itself: ${fragment}",
		);
	if (holdsMarkers(value))
		throw new Error(
			"typesql: sql.param() takes a value, not another sql.param() or sql.json(); pass the value itself",
		);
	const id = nextId();
	const token = `${issue(id).mark}${id}\u0000`;
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
	if (typeof value !== "string") return value;
	const id = readers?.exact.exec(value)?.[1];
	if (id === undefined) {
		if (holdsMarker(value))
			throw new Error(
				"typesql: a sql.param() or sql.json() value, or a fragment, can't be part of another value; pass it as a parameter by itself",
			);
		return value;
	}
	if (!pending.has(id))
		throw new Error(
			"typesql: this sql.json() / sql.param() value was already used by another statement; call it once per statement",
		);
	const v = pending.get(id);
	pending.delete(id);
	settle(id);
	return v;
}

export function hasInline(text: string): boolean {
	return text.includes("\u0000");
}

export function resolveInline(
	text: string,
	start: number,
): { text: string; values: unknown[] } {
	if (!readers)
		throw new Error(
			"typesql: the SQL text contains a NUL character that is not a sql.param() token",
		);
	const { marks, inline } = readers;
	const values: unknown[] = [];
	const used: string[] = [];
	let k = start;
	let out = "";
	let last = 0;
	for (const match of sqlMatches(text, inline)) {
		const m = match[0];
		const id = match[1];
		if (id === undefined) {
			if (!marks.some((mark) => m.includes(mark))) continue;
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
	for (const t of used) {
		pending.delete(t);
		settle(t);
	}
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
	const id = nextId();
	fragments.set(id, fragment);
	return `${issue(id).fragmentMark}${id}\u0000`;
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
	if (!readers?.fragmentMarks.some((mark) => text.includes(mark))) return null;
	const { fragmentMarks, fragment: pattern } = readers;
	const prefix = generations.at(-1)?.prefix;
	const slots: Record<string, Spliceable> = {};
	const used: string[] = [];
	const out = replaceSql(text, pattern, (match) => {
		const m = match[0];
		const id = match[2];
		if (id === undefined) {
			if (!fragmentMarks.some((mark) => m.includes(mark))) return m;
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
	for (const id of used) {
		fragments.delete(id);
		settle(id);
	}
	return { text: out, slots };
}

const hex = (bytes: Uint8Array): string =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Random bytes from crypto, or undefined where it is missing or forbidden. */
function cryptoBytes(length: number): Uint8Array | undefined {
	const crypto = (
		globalThis as { crypto?: { getRandomValues(a: Uint8Array): Uint8Array } }
	).crypto;
	try {
		return crypto?.getRandomValues(new Uint8Array(length));
	} catch {
		// Cloudflare Workers throw in global scope.
		return undefined;
	}
}

const cryptoHex = (length: number): string | undefined => {
	const bytes = cryptoBytes(length);
	return bytes && hex(bytes);
};

const mathBytes = (length: number): Uint8Array =>
	new Uint8Array(length).map(() => Math.floor(Math.random() * 256));

const mathHex = (length: number): string => hex(mathBytes(length));

// Marker ids take their random part from a pool, refilled from crypto. A
// pool filled from Math.random, where crypto throws, is replaced as soon as
// crypto works.
let pool: Uint8Array = new Uint8Array(0);
let drawn = 0;
let poolFromCrypto = false;

function randomHex(length: number): string {
	if (!poolFromCrypto || drawn + length > pool.length) {
		const bytes = cryptoBytes(1024);
		if (bytes) {
			pool = bytes;
			poolFromCrypto = true;
			drawn = 0;
		} else if (drawn + length > pool.length) {
			pool = mathBytes(1024);
			drawn = 0;
		}
	}
	drawn += length;
	return hex(pool.subarray(drawn - length, drawn));
}
