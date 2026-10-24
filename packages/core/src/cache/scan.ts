/**
 * The names a statement could resolve, for a cache entry's dependencies (engine/cache.ts
 * `DbSnapshot`): every word (unquoted identifiers folded like the engine's lexer, quoted ones
 * as written) and every `a.b` pair. Strings, comments and dollar-quoted bodies are skipped the
 * way the lexer skips them; anything else can only add names, which costs nothing but a
 * dependency.
 */
export interface Names {
	readonly words: Set<string>;
	readonly pairs: Set<string>;
}

const isIdStart = (c: string): boolean =>
	/[A-Za-z_]/.test(c) || c.charCodeAt(0) >= 0x80;
const isIdChar = (c: string): boolean =>
	/[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) >= 0x80;
/** The lexer lowercases ASCII letters only. */
const fold = (word: string): string =>
	word.replace(/[A-Z]+/g, (m) => m.toLowerCase());

type Tok = { readonly name: string } | "." | null;

export function scanNames(text: string): Names {
	const toks: Tok[] = [];
	const n = text.length;
	let i = 0;
	/** Index after the closing quote `q` (doubled quotes escape it; backslashes too when `escapes`). */
	const skipQuoted = (from: number, q: string, escapes: boolean): number => {
		let j = from;
		while (j < n) {
			const c = text[j]!;
			if (escapes && c === "\\") j += 2;
			else if (c === q) {
				if (text[j + 1] === q) j += 2;
				else return j + 1;
			} else j++;
		}
		return n;
	};
	while (i < n) {
		const c = text[i]!;
		if (c === "-" && text[i + 1] === "-") {
			const e = text.indexOf("\n", i);
			i = e < 0 ? n : e + 1;
		} else if (c === "/" && text[i + 1] === "*") {
			let depth = 1;
			i += 2;
			while (i < n && depth > 0) {
				if (text.startsWith("/*", i)) depth++, (i += 2);
				else if (text.startsWith("*/", i)) depth--, (i += 2);
				else i++;
			}
		} else if (c === "'") {
			i = skipQuoted(i + 1, "'", false);
			toks.push(null);
		} else if (c === '"') {
			const end = skipQuoted(i + 1, '"', false);
			toks.push({
				name: text.slice(i + 1, Math.max(i + 1, end - 1)).replaceAll('""', '"'),
			});
			i = end;
		} else if (c === "$") {
			const m = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(
				text.slice(i),
			);
			if (m) {
				const close = text.indexOf(m[0], i + m[0].length);
				i = close < 0 ? n : close + m[0].length;
				toks.push(null);
			} else {
				i++;
				while (i < n && /[0-9]/.test(text[i]!)) i++;
				toks.push(null);
			}
		} else if (isIdStart(c)) {
			if (text[i + 1] === "'" && /[EeBbXx]/.test(c)) {
				i = skipQuoted(i + 2, "'", c === "E" || c === "e");
				toks.push(null);
				continue;
			}
			let j = i + 1;
			while (j < n && isIdChar(text[j]!)) j++;
			toks.push({ name: fold(text.slice(i, j)) });
			i = j;
		} else if (c === ".") {
			toks.push(".");
			i++;
		} else if (/\s/.test(c)) {
			i++;
		} else {
			toks.push(null);
			i++;
		}
	}
	const words = new Set<string>();
	const pairs = new Set<string>();
	toks.forEach((t, k) => {
		if (t === null || t === ".") return;
		words.add(t.name);
		const next = toks[k + 2];
		if (toks[k + 1] === "." && next && next !== ".")
			pairs.add(`${t.name}.${next.name}`);
	});
	return { words, pairs };
}

/** `DROP TYPE` / `ALTER TYPE` rewrite columns of any table: such a step depends on the whole schema. */
export const touchesAllTables = (text: string): boolean =>
	/\b(drop|alter)\s+type\b/i.test(text);
