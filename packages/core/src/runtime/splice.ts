export interface Spliceable {
	readonly text: string;
	readonly values: readonly unknown[];
}

export type SlotValues = { readonly [name: string]: Spliceable };

const SLOT = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

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

export const QUOTED =
	/'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/;
const DOLLAR_QUOTED = /(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?(?:\1|$)/;
const PARAMS = new RegExp(
	`${QUOTED.source}|${DOLLAR_QUOTED.source}|\\$(\\d+)`,
	"g",
);
const NAMED = new RegExp(
	`${QUOTED.source}|${DOLLAR_QUOTED.source}|::+|:([A-Za-z_][A-Za-z0-9_]*)`,
	"g",
);

export function maxParam(text: string): number {
	let max = 0;
	scan(text, (n) => {
		if (n > max) max = n;
		return null;
	});
	return max;
}

export function renumberParams(text: string, offset: number): string {
	if (offset === 0) return text;
	return scan(text, (n) => `$${n + offset}`);
}

function scan(text: string, onParam: (n: number) => string | null): string {
	return text.replace(PARAMS, (m: string, _open?: string, n?: string) =>
		n === undefined ? m : (onParam(Number(n)) ?? m),
	);
}

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

const renumbered = memo((key: string) => {
	const at = key.indexOf("\0");
	return renumberParams(key.slice(at + 1), Number(key.slice(0, at)));
});

export const rewriteNamedOnce: (text: string) => {
	readonly text: string;
	readonly names: readonly string[];
} = memo(rewriteNamed);

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

export function quoteIdent(...parts: readonly string[]): string {
	return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

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
