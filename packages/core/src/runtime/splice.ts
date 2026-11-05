export interface Spliceable {
	readonly text: string;
	readonly values: readonly unknown[];
}

export type SlotValues = { readonly [name: string]: Spliceable };

/** SQL text with the values of its `$n` parameters, in order. */
export interface CompiledSql {
	text: string;
	values: unknown[];
}

/** SQL text with its `:name` parameters numbered, and the names in number order. */
export interface NamedRewrite {
	text: string;
	names: string[];
}

export const QUOTED =
	/(?<![A-Za-z0-9_$])[Ee]'(?:[^'\\]|\\[\s\S]|'')*'?|'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/;
export const DOLLAR_QUOTED =
	/(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?(?:\1|$)/;
const SLOT = new RegExp(
	`${QUOTED.source}|${DOLLAR_QUOTED.source}|\\{([A-Za-z_][A-Za-z0-9_]*)\\}`,
	"g",
);
const PARAMS = new RegExp(
	`${QUOTED.source}|${DOLLAR_QUOTED.source}|\\$(\\d+)`,
	"g",
);
const NAMED = new RegExp(
	`${QUOTED.source}|${DOLLAR_QUOTED.source}|::+|:([A-Za-z_][A-Za-z0-9_]*)`,
	"g",
);

/** Extend block-comment matches through their outer closing delimiter. */
function* sqlMatches(
	text: string,
	pattern: RegExp,
): Generator<RegExpExecArray> {
	pattern.lastIndex = 0;
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		if (match[0].startsWith("/*")) {
			let depth = 1;
			let end = match.index + 2;
			while (end < text.length && depth > 0) {
				if (text.startsWith("/*", end)) {
					depth++;
					end += 2;
				} else if (text.startsWith("*/", end)) {
					depth--;
					end += 2;
				} else end++;
			}
			match[0] = text.slice(match.index, end);
			pattern.lastIndex = end;
		}
		yield match;
	}
}

export function replaceSql(
	text: string,
	pattern: RegExp,
	replace: (match: RegExpExecArray) => string,
): string {
	let out = "";
	let last = 0;
	for (const match of sqlMatches(text, pattern)) {
		out += text.slice(last, match.index) + replace(match);
		last = match.index + match[0].length;
	}
	return out + text.slice(last);
}

export function maxParam(text: string): number {
	if (!text.includes("$")) return 0;
	let max = 0;
	for (const match of sqlMatches(text, PARAMS)) {
		if (match[2] !== undefined) max = Math.max(max, Number(match[2]));
	}
	return max;
}

function renumberParams(text: string, offset: number): string {
	if (offset === 0 || !text.includes("$")) return text;
	return replaceSql(text, PARAMS, (match) =>
		match[2] === undefined ? match[0] : `$${Number(match[2]) + offset}`,
	);
}

export function splice(
	text: string,
	slots: SlotValues,
	values: readonly unknown[],
): CompiledSql {
	let offset = Math.max(maxParam(text), values.length);
	const allValues: unknown[] = [...values];
	const out = replaceSql(text, SLOT, (match) => {
		const name = match[2];
		if (name === undefined) return match[0];
		const frag = slots[name];
		if (frag === undefined) return match[0];
		const fragmentText = renumberParams(frag.text, offset);
		offset += frag.values.length;
		allValues.push(...frag.values);
		return fragmentText;
	});
	return { text: out, values: allValues };
}

export function rewriteNamed(text: string): NamedRewrite {
	const names: string[] = [];
	const out = replaceSql(text, NAMED, (match) => {
		const name = match[2];
		if (name === undefined) return match[0];
		let k = names.indexOf(name);
		if (k === -1) k = names.push(name) - 1;
		return `$${k + 1}`;
	});
	return { text: out, names };
}

export function quoteIdentWith(q: '"' | "`", parts: readonly string[]): string {
	if (parts.length === 1 && !parts[0]!.includes(q))
		return `${q}${parts[0]}${q}`;
	return parts.map((p) => `${q}${p.replaceAll(q, q + q)}${q}`).join(".");
}

export function joinFragments(
	items: readonly Spliceable[],
	separator: string,
): CompiledSql {
	let text = "";
	const values: unknown[] = [];
	items.forEach((f, idx) => {
		if (idx > 0) text += separator;
		text += renumberParams(f.text, values.length);
		values.push(...f.values);
	});
	return { text, values };
}
