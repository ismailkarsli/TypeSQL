import { empty } from "../empty.js";
import type { InlineMarker } from "../sql/inline.js";

export interface Spliceable {
	readonly text: string;
	readonly values: readonly unknown[];
}

/** A compiled statement: its `:name` parameters in number order, and how many `$n` it takes. */
export interface Compiled extends Spliceable {
	readonly values: unknown[];
	readonly names: string[];
	readonly count: number;
}

export const fail = (message: string): never => {
	throw new Error(`typesql: ${message}`);
};

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

// A marker is "\0typesql", "~" for a fragment, a random prefix, a counter
// and "\0". SQL text can't forge one, and a marker names its value only until
// a statement uses it. The prefix comes from Web Crypto on first use:
// Cloudflare Workers forbid crypto in global scope, so importing
// @typesql/core must not need it.
const MARK = "\0typesql";
// Web Crypto, without requiring the DOM or Node.js type libraries.
declare const crypto: { randomUUID(): string };
let prefix: string | undefined;
let counter = 0;
const pending = new Map<string, unknown>();

function mark<V>(value: V, kind = ""): string {
	prefix ??= crypto.randomUUID();
	const id = kind + prefix + counter++;
	pending.set(id, value);
	return `${MARK}${id}\0`;
}

/** The value of marker `id`, which no other statement can use now. */
// biome-ignore lint/plugin: a marker names any value a statement may take.
function use(id: string): unknown {
	const value = pending.get(id);
	if (!pending.delete(id))
		fail(
			id[0] === "~"
				? "this fragment was already used; interpolate it again"
				: "this sql.param() value was already used; call sql.param() once per statement",
		);
	return value;
}

const NOTHING = new SqlFragment("", []);
Object.defineProperty(empty, "toString", { value: () => mark(NOTHING, "~") });

/** Whether a value holds a marker in a string, as itself or in a plain object or array. */
export const holdsMarkers = <V>(
	value: V,
	seen = new Set<unknown>(),
): boolean =>
	typeof value === "string"
		? value.includes(MARK)
		: typeof value === "object" &&
			value !== null &&
			!seen.has(value) &&
			!!seen.add(value) &&
			(Array.isArray(value) ||
				[Object.prototype, null].includes(Object.getPrototypeOf(value))) &&
			Object.entries(value).some(
				([key, v]) => key.includes(MARK) || holdsMarkers(v, seen),
			);

export const HOLDS =
	"a sql.param() or sql.json() value holds a fragment or marker";

export function param<const T>(value: T): InlineMarker<T> {
	if (value instanceof SqlFragment || holdsMarkers(value)) fail(HOLDS);
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: the marker is a string branded with the value's type.
	return mark(value) as InlineMarker<T>;
}

/**
 * The values of a statement's parameters: `args` in order, or the members of
 * its one object argument named by `names`. A sql.param() or sql.json()
 * marker becomes its value; with `omitDefault`, a DEFAULT marker becomes
 * `undefined`, which sql.set and sql.values leave out.
 */
export function bind(
	names: readonly string[],
	args: readonly unknown[],
	omitDefault?: boolean,
): unknown[] {
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: named parameters are read with `in`, including inherited properties such as getters.
	// biome-ignore lint/plugin: see above.
	const record = Object(args[0]) as Record<string, unknown>;
	return (
		names[0]
			? names.map((name) =>
					name in record ? record[name] : fail(`missing parameter :${name}`),
				)
			: args
	).map((value) => {
		if (typeof value === "string" && value.includes(MARK)) {
			const id = /^\0typesql([^\0~]+)\0$/.exec(value)?.[1];
			value = id ? use(id) : fail("sql.param() inside another value");
			if (value === empty && omitDefault) return undefined;
		}
		return value === empty
			? fail("DEFAULT must be inline, as sql.param(sql.optional(value))")
			: value instanceof SqlFragment
				? fail("a fragment is not a parameter value; interpolate it")
				: value;
	});
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
			const comment = /\/\*|\*\//g;
			comment.lastIndex = pattern.lastIndex;
			for (let depth = 1; depth; ) {
				const c = comment.exec(text);
				depth = c ? depth + (c[0] === "/*" ? 1 : -1) : 0;
			}
			pattern.lastIndex = comment.lastIndex || text.length;
			m[0] = text.slice(m.index, pattern.lastIndex);
		}
		out += text.slice(last, m.index) + replace(m);
		last = pattern.lastIndex;
	}
	return out + text.slice(last);
}

const renumber = (text: string, offset: number): string =>
	offset && text.includes("$")
		? scan(text, (m) => (m[2] ? `$${+m[2] + offset}` : m[0]))
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
	scan(text, ([, , n, name, id]) => {
		if (n) count = Math.max(count, +n);
		else if (name) names.includes(name) || names.push(name);
		else if (id && id[0] !== "~" && pending.get(id) !== empty) inline++;
		return "";
	});
	const values = args ? bind(names, args) : [];
	count = Math.max(count, args ? values.length : names.length);
	const carried: unknown[] = [];
	let k = count;
	let offset = count + inline;
	const out = scan(text, ([t, , n, name, id]) => {
		if (name) return `$${names.indexOf(name) + 1}`;
		if (!id)
			return n || !t.includes(MARK)
				? t
				: fail("sql.param() or fragment inside a string or comment");
		const value = use(id);
		if (id[0] !== "~") {
			if (value === empty) return "DEFAULT";
			values.push(value);
			return `$${++k}`;
		}
		// biome-ignore lint/nursery/noUnsafeTypeAssertion: only toString() above marks a "~" id, with a fragment.
		const fragment = value as Spliceable;
		carried.push(...fragment.values);
		offset += fragment.values.length;
		return renumber(fragment.text, offset - fragment.values.length);
	});
	if (out.includes("\0")) fail("NUL in SQL text");
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
): SqlFragment {
	const values: unknown[] = [];
	return new SqlFragment(
		items
			.map((f) => renumber(f.text, values.push(...f.values) - f.values.length))
			.join(separator),
		values,
	);
}
