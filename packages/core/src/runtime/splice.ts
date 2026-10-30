export interface Spliceable {
	readonly text: string;
	readonly values: readonly unknown[];
}

export type SlotValues = { readonly [name: string]: Spliceable };

const SLOT = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

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
	if (!text.includes("$")) return 0;
	let max = 0;
	for (const match of text.matchAll(PARAMS)) {
		if (match[2] !== undefined) max = Math.max(max, Number(match[2]));
	}
	return max;
}

export function renumberParams(text: string, offset: number): string {
	if (offset === 0 || !text.includes("$")) return text;
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
	let offset = Math.max(maxParam(text), values.length);
	const allValues: unknown[] = [...values];
	const out = text.replace(SLOT, (_match, name: string) => {
		const frag = slots[name];
		if (frag === undefined)
			throw new Error(`typesql: unknown fragment slot {${name}}`);
		const fragmentText = renumberParams(frag.text, offset);
		offset += frag.values.length;
		allValues.push(...frag.values);
		return fragmentText;
	});
	return { text: out, values: allValues };
}

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
