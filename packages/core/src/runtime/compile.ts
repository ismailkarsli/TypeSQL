import { empty, isEmpty } from "../empty.js";
import type { InlineMarker } from "../sql/inline.js";

export interface Spliceable {
	readonly text: string;
	readonly values: readonly unknown[];
}

/** SQL text with the values of its `$n` parameters, in order. */
export interface CompiledSql {
	text: string;
	values: unknown[];
}

/** A compiled statement: its `:name` parameters in number order, and how many `$n` it takes. */
export interface Compiled extends CompiledSql {
	names: string[];
	count: number;
}

/** What `${fragment}` and `${query}` splice in place: the fragments and queries `sql` makes. */
export class SqlFragment implements Spliceable {
	declare readonly text: string;
	declare readonly values: readonly unknown[];
	constructor(text: string, values: readonly unknown[]) {
		this.text = text;
		this.values = values;
	}
	/** A marker compile() splices this fragment in place of. */
	toString(): string {
		return mark(this, "~");
	}
}

// A marker is "\0typesql", "~" for a fragment, a random prefix made on first
// use (Cloudflare Workers forbid crypto in global scope, so importing
// @typesql/core must not need one), a counter and "\0". SQL text can't forge
// one, and a marker names its value only until a statement uses it.
const MARK = "\0typesql";
let prefix: string | undefined;
let counter = 0;
const pending = new Map<string, unknown>();

function mark<V>(value: V, kind = ""): string {
	prefix ??= random();
	const id = `${kind}${prefix}${(counter++).toString(36)}`;
	pending.set(id, value);
	return `${MARK}${id}\0`;
}

/** A random prefix from Web Crypto, or from Math.random where it is missing or forbidden. */
function random(): string {
	const scope: {
		readonly Math: Math;
		readonly crypto?: { readonly randomUUID?: () => string };
	} = globalThis;
	try {
		const uuid = scope.crypto?.randomUUID?.();
		if (uuid) return uuid;
	} catch {
		// Cloudflare Workers throw in global scope.
	}
	return Math.random().toString(36).slice(2);
}

/** The value of marker `id`, which no other statement can use now. */
// biome-ignore lint/plugin: a marker names any value a statement may take.
function use(id: string): unknown {
	if (!pending.has(id))
		throw new Error(
			id[0] === "~"
				? "typesql: this fragment was already used; interpolate it again for each statement"
				: "typesql: this sql.param() value was already used; call sql.param() once per statement",
		);
	const value = pending.get(id);
	pending.delete(id);
	return value;
}

const NOTHING = new SqlFragment("", []);
Object.defineProperty(empty, "toString", { value: () => mark(NOTHING, "~") });

/** Whether a value holds a marker in a string, as itself or in a plain object or array. */
export function holdsMarkers<V>(value: V, seen = new Set<object>()): boolean {
	if (typeof value === "string") return value.includes(MARK);
	if (value === null || typeof value !== "object" || seen.has(value))
		return false;
	seen.add(value);
	if (Array.isArray(value)) return value.some((v) => holdsMarkers(v, seen));
	const proto = Object.getPrototypeOf(value);
	return (
		(proto === Object.prototype || proto === null) &&
		Object.entries(value).some(
			([key, v]) => key.includes(MARK) || holdsMarkers(v, seen),
		)
	);
}

export const HOLDS =
	"typesql: a sql.param() or sql.json() value holds another one";

export function param<const T>(value: T): InlineMarker<T> {
	if (value === undefined)
		throw new Error(
			"typesql: sql.param(undefined); use sql.optional() or null",
		);
	if (value instanceof SqlFragment)
		throw new Error("typesql: sql.param() takes a value, not a fragment");
	if (holdsMarkers(value)) throw new Error(HOLDS);
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: the marker is a string branded with the value's type.
	return mark(value) as InlineMarker<T>;
}

const INLINE =
	"typesql: DEFAULT must be inline, as sql.param(sql.optional(value))";

/** A bound parameter's value: a sql.param() or sql.json() marker becomes its value. */
// biome-ignore lint/plugin: a parameter takes any value the driver accepts.
function take<V>(value: V, omitDefault?: boolean): unknown {
	if (value instanceof SqlFragment)
		throw new Error(
			"typesql: a fragment is not a parameter value; interpolate it",
		);
	if (isEmpty(value)) throw new Error(INLINE);
	if (typeof value !== "string" || !value.includes(MARK)) return value;
	const id = /^\0typesql([^\0~]+)\0$/.exec(value)?.[1];
	if (id === undefined)
		throw new Error(
			"typesql: a sql.param() or sql.json() value inside another value",
		);
	const v = use(id);
	if (!isEmpty(v)) return v;
	if (omitDefault) return undefined;
	throw new Error(INLINE);
}

/**
 * The values of a statement's parameters: `args` in order, or the members of
 * its one object argument named by `names`. With `omitDefault`, a DEFAULT
 * marker becomes `undefined`, which sql.set and sql.values leave out.
 */
export function bind(
	names: readonly string[],
	args: readonly unknown[],
	omitDefault?: boolean,
): unknown[] {
	let list = args;
	if (names.length > 0) {
		const obj = args[0];
		if (args.length !== 1 || obj === null || typeof obj !== "object")
			throw new Error("typesql: :name parameters take one object argument");
		// biome-ignore lint/nursery/noUnsafeTypeAssertion: named parameters are read with `in`, including inherited properties such as getters.
		// biome-ignore lint/plugin: see above.
		const record = obj as Record<string, unknown>;
		list = names.map((name) => {
			if (!(name in record))
				throw new Error(`typesql: missing parameter :${name}`);
			return record[name];
		});
	}
	return list.map((value) => take(value, omitDefault));
}

/**
 * The tokens compile() reads past or rewrites: quoted strings, identifiers
 * and comments (kept as they are), then `$n`, `::`, `:name` and markers.
 */
const TOKEN =
	/(?<![\w$])[Ee]'(?:[^'\\]|\\.|'')*'?|'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*|(\$(?:[A-Za-z_]\w*)?\$).*?(?:\1|$)|\$(\d+)|::+|:([A-Za-z_]\w*)|\0typesql([^\0]+)\0/gs;

/** `text` with each token replaced; a block comment runs to its outer closing delimiter, as it nests. */
function scan(
	text: string,
	replace: (match: RegExpExecArray) => string,
): string {
	const pattern = new RegExp(TOKEN);
	let out = "";
	let last = 0;
	for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
		if (m[0] === "/*") {
			let depth = 1;
			let end = m.index + 2;
			while (end < text.length && depth > 0) {
				if (text.startsWith("/*", end)) {
					depth++;
					end += 2;
				} else if (text.startsWith("*/", end)) {
					depth--;
					end += 2;
				} else end++;
			}
			m[0] = text.slice(m.index, end);
			pattern.lastIndex = end;
		}
		out += text.slice(last, m.index) + replace(m);
		last = m.index + m[0].length;
	}
	return out + text.slice(last);
}

const renumber = (text: string, offset: number): string =>
	offset > 0 && text.includes("$")
		? scan(text, (m) => (m[2] ? `$${Number(m[2]) + offset}` : m[0]))
		: text;

/**
 * A statement's text with `$n` parameters and the values they take: `args`
 * (positional or, with `:name` parameters, one object) first, then each
 * inline sql.param() in order, then each interpolated fragment's. Without
 * `args` the statement is prepared: its own parameters stay for later.
 */
export function compile(text: string, args?: readonly unknown[]): Compiled {
	const names: string[] = [];
	let count = 0;
	let inline = 0;
	scan(text, (m) => {
		if (m[2]) count = Math.max(count, Number(m[2]));
		else if (m[3]) {
			if (!names.includes(m[3])) names.push(m[3]);
		} else if (m[4] && m[4][0] !== "~" && !isEmpty(pending.get(m[4]))) inline++;
		return "";
	});
	const values = args ? bind(names, args) : [];
	count = Math.max(count, args ? values.length : names.length);
	const carried: unknown[] = [];
	let k = count;
	let offset = count + inline;
	const out = scan(text, (m) => {
		const [t, , n, name, id] = m;
		if (n) return t;
		if (name) return `$${names.indexOf(name) + 1}`;
		if (id === undefined) {
			if (t.includes(MARK))
				throw new Error(
					"typesql: a sql.param() value or fragment inside a string, name or comment",
				);
			return t;
		}
		const value = use(id);
		if (id[0] !== "~") {
			if (isEmpty(value)) return "DEFAULT";
			values.push(value);
			return `$${++k}`;
		}
		// biome-ignore lint/nursery/noUnsafeTypeAssertion: only toString() above marks a "~" id, with a fragment.
		const fragment = value as Spliceable;
		carried.push(...fragment.values);
		const spliced = renumber(fragment.text, offset);
		offset += fragment.values.length;
		return spliced;
	});
	if (out.includes("\0"))
		throw new Error("typesql: NUL character in the SQL text");
	return { text: out, values: [...values, ...carried], names, count };
}

/** `parts` as a quoted, dotted name. */
export const ident = (quote: string, parts: readonly string[]): string =>
	parts
		.map((p) => quote + p.replaceAll(quote, quote + quote) + quote)
		.join(".");

/** `items` joined by `separator`, their parameters renumbered in sequence. */
export function join(
	items: readonly Spliceable[],
	separator: string,
): CompiledSql {
	const values: unknown[] = [];
	const text = items
		.map((f) => {
			const t = renumber(f.text, values.length);
			values.push(...f.values);
			return t;
		})
		.join(separator);
	return { text, values };
}
