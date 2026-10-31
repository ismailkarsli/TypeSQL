import type { Range, SemanticTokens } from "typescript/vscode";
import type { Highlight } from "./highlight/index.js";

interface Abs {
	line: number;
	character: number;
	length: number;
	type: number;
	modifiers: number;
}

/**
 * Adds `highlights` to a semantic tokens response encoded with `legend`'s token
 * types, dropping the response's tokens they overlap. A kind missing from the
 * legend is skipped. With `range`, only highlights on its lines are added.
 * The result has no resultId, so the client never asks for a delta of it.
 */
export function mergeTokens(
	result: SemanticTokens | null,
	highlights: readonly Highlight[],
	legend: readonly string[],
	range?: Range,
): SemanticTokens | null {
	const ours: Abs[] = [];
	for (const h of highlights) {
		const type = legend.indexOf(h.kind);
		if (type < 0) continue;
		if (range && (h.line < range.start.line || h.line > range.end.line))
			continue;
		ours.push({ ...h, type, modifiers: 0 });
	}
	if (!ours.length) return result;
	const theirs = decode(result?.data ?? []).filter(
		(t) => !ours.some((o) => overlaps(o, t)),
	);
	const all = [...theirs, ...ours].sort(
		(a, b) => a.line - b.line || a.character - b.character,
	);
	return { data: encode(all) };
}

const overlaps = (a: Abs, b: Abs): boolean =>
	a.line === b.line &&
	a.character < b.character + b.length &&
	b.character < a.character + a.length;

function decode(data: readonly number[]): Abs[] {
	const out: Abs[] = [];
	let line = 0;
	let character = 0;
	for (let i = 0; i + 4 < data.length; i += 5) {
		const dl = data[i]!;
		line += dl;
		character = dl === 0 ? character + data[i + 1]! : data[i + 1]!;
		out.push({
			line,
			character,
			length: data[i + 2]!,
			type: data[i + 3]!,
			modifiers: data[i + 4]!,
		});
	}
	return out;
}

function encode(tokens: readonly Abs[]): number[] {
	const data: number[] = [];
	let line = 0;
	let character = 0;
	for (const t of tokens) {
		const dl = t.line - line;
		data.push(
			dl,
			dl === 0 ? t.character - character : t.character,
			t.length,
			t.type,
			t.modifiers,
		);
		line = t.line;
		character = t.character;
	}
	return data;
}
