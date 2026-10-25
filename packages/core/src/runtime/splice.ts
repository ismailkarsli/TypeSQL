/**
 * Runtime side of fragment composition.
 *
 * `{name}` slots in a query text are replaced by the fragment's text; the fragment's
 * `$n` placeholders are renumbered to follow the parameters already present, and its
 * values are appended. Renumbering skips string literals, quoted identifiers,
 * dollar-quoted strings and comments so `'$1'` inside a literal is left alone.
 */

export interface Spliceable {
	readonly text: string;
	readonly values: readonly unknown[];
}

export type SlotValues = { readonly [name: string]: Spliceable };

const SLOT = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * `fn` remembered per argument. A program has a fixed set of statement texts (and column
 * names), so these stay small; past `limit` entries (texts built at runtime) the memo starts over.
 */
export function memo<V>(
	fn: (text: string) => V,
	limit = 10_000,
): (text: string) => V {
	const cache = new Map<string, V>();
	return (text) => {
		let v = cache.get(text);
		if (v === undefined) {
			v = fn(text);
			if (cache.size >= limit) cache.clear();
			cache.set(text, v);
		}
		return v;
	};
}

/**
 * A quoted string or quoted identifier (`''` / `""` escapes), a `--` comment or a block
 * comment, each running to the end of the text when unclosed. No capturing group, so the
 * expressions built from it number their own groups from 1.
 */
export const QUOTED =
	/'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/;
/** A dollar-quoted string (`$$ … $$`, `$tag$ … $tag$`; to the end when unclosed). Group 1: the opener. */
const DOLLAR_QUOTED = /(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?(?:\1|$)/;
/** Text to copy, or (group 2) the number of a `$n`. */
const PARAMS = new RegExp(
	`${QUOTED.source}|${DOLLAR_QUOTED.source}|\\$(\\d+)`,
	"g",
);
/**
 * Text to copy, or (group 2) the name of a `:name`. A run of colons (`::` casts) is copied, so
 * a colon right after another one never starts a name.
 */
const NAMED = new RegExp(
	`${QUOTED.source}|${DOLLAR_QUOTED.source}|::+|:([A-Za-z_][A-Za-z0-9_]*)`,
	"g",
);

/** Highest `$n` in `text` (0 if none), skipping literals and comments. */
export function maxParam(text: string): number {
	let max = 0;
	scan(text, (n) => {
		if (n > max) max = n;
		return null;
	});
	return max;
}

/** Add `offset` to every `$n` outside literals/comments. */
export function renumberParams(text: string, offset: number): string {
	if (offset === 0) return text;
	return scan(text, (n) => `$${n + offset}`);
}

/**
 * Call `onParam(n)` for every `$n` placeholder of `text` outside literals and comments; when it
 * returns a string, that string replaces the placeholder in the returned text.
 */
function scan(text: string, onParam: (n: number) => string | null): string {
	return text.replace(PARAMS, (m: string, _open?: string, n?: string) =>
		n === undefined ? m : (onParam(Number(n)) ?? m),
	);
}

/**
 * Replace `{name}` slots with the fragments' texts (renumbered) and return the combined
 * text and values. Outer `values` come first; fragment values follow in order of
 * appearance. Unknown slots throw.
 */
export function splice(
	text: string,
	slots: SlotValues,
	values: readonly unknown[],
): { text: string; values: unknown[] } {
	const plan = splicePlan(text);
	let offset = Math.max(plan.max, values.length);
	const allValues: unknown[] = [...values];
	let out = plan.parts[0]!;
	plan.names.forEach((name, i) => {
		const frag = slots[name];
		if (frag === undefined)
			throw new Error(`typesql: unknown fragment slot {${name}}`);
		out +=
			(offset === 0 ? frag.text : renumbered(`${offset}\0${frag.text}`)) +
			plan.parts[i + 1]!;
		offset += frag.values.length;
		allValues.push(...frag.values);
	});
	return { text: out, values: allValues };
}

/** A query text split at its `{slot}`s (`parts` around `names`), and its highest `$n`. */
const splicePlan = memo((text: string) => {
	const parts: string[] = [];
	const names: string[] = [];
	let last = 0;
	for (const m of text.matchAll(SLOT)) {
		parts.push(text.slice(last, m.index));
		names.push(m[1]!);
		last = m.index + m[0].length;
	}
	parts.push(text.slice(last));
	return { parts, names, max: maxParam(text) };
});

/** `renumberParams` of a fragment text, keyed by `${offset}\0${text}`. */
const renumbered = memo((key: string) => {
	const at = key.indexOf("\0");
	return renumberParams(key.slice(at + 1), Number(key.slice(0, at)));
});

/** `rewriteNamed`, remembered per text (the result is shared: do not modify it). */
export const rewriteNamedOnce: (text: string) => {
	readonly text: string;
	readonly names: readonly string[];
} = memo(rewriteNamed);

/**
 * Rewrite `:name` parameters to `$k` (first-appearance order) outside literals/comments,
 * skipping `::` casts and `:=`. Returns the new text and the ordered names.
 */
export function rewriteNamed(text: string): { text: string; names: string[] } {
	const names: string[] = [];
	const out = text.replace(
		NAMED,
		(m: string, _open?: string, name?: string) => {
			if (name === undefined) return m;
			let k = names.indexOf(name);
			if (k === -1) k = names.push(name) - 1;
			return `$${k + 1}`;
		},
	);
	return { text: out, names };
}

/** Quote an identifier (or dotted path) the Postgres way: `"a"."b"`, doubling embedded quotes. */
export function quoteIdent(...parts: readonly string[]): string {
	return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

/** Join fragments with a separator, renumbering parameters left to right. */
export function joinFragments(
	items: readonly Spliceable[],
	separator: string,
): { text: string; values: unknown[] } {
	let text = "";
	const values: unknown[] = [];
	items.forEach((f, idx) => {
		if (idx > 0) text += separator;
		text += renumberParams(f.text, values.length);
		values.push(...f.values);
	});
	return { text, values };
}
