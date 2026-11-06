import type { CallExpression, Node, SourceFile } from "typescript/ast";
import type {
	Checker,
	DocumentIdentifier,
	Program,
	Type,
} from "typescript/async";
import {
	calleeOf,
	dialectOf,
	type EditorKinds,
	isCall,
	isIdentifier,
	isPropertyAccess,
	isSqlLiteral,
	sqlTypeOf,
	textOf,
} from "../call.js";
import { DIALECTS, type Dialect, type DialectFacts } from "../sql/dialect.js";
import { lex } from "../sql/lex.js";
import { GRAMMAR } from "./grammar.js";

export type TokenKind =
	| "keyword"
	| "constant"
	| "type"
	| "function"
	| "number"
	| "string"
	| "escape"
	| "comment"
	| "operator"
	| "parameter"
	| "variable"
	| "punctuation";

/** A run of one kind on one line, in UTF-16 code units. */
export interface Highlight {
	readonly line: number;
	readonly character: number;
	readonly length: number;
	readonly kind: TokenKind;
}

const NAME = new RegExp(`^${GRAMMAR.name}$`);
const STATEMENT_WORDS = GRAMMAR.statementWords.join("|");
const STATEMENT = new RegExp(
	`^\\s*(?:--|/\\*|\\(|(?:${STATEMENT_WORDS})(?=[\\s;(]|$))`,
	"i",
);
// Any string that a TypeSQL call could take as a statement, such as "COMMIT".
const STATEMENT_ANY = new RegExp(
	`^(?:--|/\\*|\\(|(?:${STATEMENT_WORDS})(?![\\w$]))`,
	"i",
);
const MARKER = /\/\*\s*sql\s*\*\//i;
const NAME_METHODS: ReadonlySet<string> = new Set(GRAMMAR.nameMethods);
const STATEMENT_METHODS: ReadonlySet<string> = new Set(
	GRAMMAR.statementMethods,
);

interface Candidate {
	readonly literal: Node;
	/** The node whose type decides, and the method called on it. */
	readonly target: Node;
	readonly method: string | null;
	readonly grammar: boolean;
}

/**
 * Highlights for the first-argument strings of calls in `document`: SQL tokens
 * where a TypeSQL call's string isn't colored by the grammar or the grammar
 * reads its dialect wrong, and `string` where the grammar colors another
 * function's string as SQL. Strings after a `/* sql *\/` marker are left to
 * the grammar.
 */
export async function highlightsIn(
	program: Program,
	checker: Checker,
	kinds: EditorKinds,
	document: DocumentIdentifier,
	isCorePath: (path: string) => boolean,
): Promise<Highlight[] | null> {
	const file = await program.getSourceFile(document);
	if (!file) return null;
	const candidates = collect(file, kinds);
	if (!candidates.length) return [];
	const types = await checker.getTypeAtLocation(
		candidates.map((c) => c.target),
	);
	const dialects = new Map<string, Promise<Dialect | null>>();
	const dialectFor = (t: Type, method: string | null) => {
		const key = `${t.id} ${method}`;
		let d = dialects.get(key);
		if (!d) {
			d = sqlTypeOf(t, method, isCorePath).then((entry) =>
				entry ? dialectOf(checker, t, entry) : null,
			);
			dialects.set(key, d);
		}
		return d;
	};
	const found = await Promise.all(
		candidates.map((c, i) => dialectFor(types[i]!, c.method)),
	);
	const lines = lineStarts(file.text);
	const out: Highlight[] = [];
	candidates.forEach((c, i) => {
		const dialect = found[i];
		const d = dialect ? DIALECTS[dialect] : null;
		if (d ? c.grammar && d.grammarColors : !c.grammar) return;
		const sql = textOf(file, c.literal, kinds);
		const spans: [number, number, TokenKind][] = d
			? tokensOf(sql.text, d).map(([s, e, kind]) => [
					sql.start + s,
					sql.start + e,
					kind,
				])
			: [[sql.start, sql.end, "string"]];
		for (const [start, end, kind] of spans)
			for (const [s, e] of outside(start, end, sql.holes))
				split(file.text, lines, s, e, kind, out);
	});
	return out.sort((a, b) => a.line - b.line || a.character - b.character);
}

/** The highlight of each token, with adjacent punctuation joined. */
function tokensOf(
	text: string,
	d: DialectFacts,
): [number, number, TokenKind][] {
	const out: [number, number, TokenKind][] = [];
	const push = (start: number, end: number, kind: TokenKind): void => {
		if (end <= start) return;
		const last = out.at(-1);
		if (kind === "punctuation" && last?.[2] === kind && last[1] === start)
			last[1] = end;
		else out.push([start, end, kind]);
	};
	let afterCast = false;
	for (const t of lex(text, d.lexis)) {
		const cast = afterCast;
		afterCast = t.kind === "cast";
		switch (t.kind) {
			case "word": {
				const word = text.slice(t.start, t.end).toLowerCase();
				push(
					t.start,
					t.end,
					cast || d.types.has(word)
						? "type"
						: CONSTANT.has(word)
							? "constant"
							: d.keywords.has(word)
								? "keyword"
								: text[t.end] === "("
									? "function"
									: "variable",
				);
				break;
			}
			case "string": {
				let from = t.start;
				for (const [s, e] of t.escapes ?? []) {
					push(from, s, "string");
					push(s, e, "escape");
					from = e;
				}
				push(from, t.end, "string");
				break;
			}
			case "quoted":
				push(t.start, t.end, "variable");
				break;
			case "hole":
				push(t.start, t.end, "parameter");
				break;
			case "cast":
				push(t.start, t.end, "operator");
				break;
			default:
				push(t.start, t.end, t.kind);
		}
	}
	return out;
}

const CONSTANT: ReadonlySet<string> = new Set(GRAMMAR.constants);

function collect(file: SourceFile, kinds: EditorKinds): Candidate[] {
	const out: Candidate[] = [];
	const visit = (n: Node): void => {
		if (isCall(n, kinds)) {
			const c = candidate(file, n, kinds);
			if (c) out.push(c);
		}
		n.forEachChild(visit);
	};
	visit(file);
	return out;
}

function candidate(
	file: SourceFile,
	call: CallExpression,
	kinds: EditorKinds,
): Candidate | null {
	const literal = call.arguments[0];
	if (!isSqlLiteral(literal, kinds)) return null;
	const src = file.text;
	const open = literal.getStart(file);
	if (MARKER.test(src.slice(literal.pos, open))) return null;
	const body = src.slice(open + 1, literal.end);
	const firstLine = body.slice(0, body.search(/\n|$/));
	const callee = call.expression;
	const member = isPropertyAccess(callee, kinds) ? callee : null;
	const nameOf = (n: Node): string | null =>
		isIdentifier(n, kinds)
			? n.text
			: isPropertyAccess(n, kinds)
				? n.name.text
				: null;
	const name = nameOf(callee);
	const grammar =
		(name !== null && NAME.test(name)) ||
		(!!member &&
			NAME_METHODS.has(member.name.text) &&
			NAME.test(nameOf(member.expression) ?? "")) ||
		(!!member &&
			STATEMENT_METHODS.has(member.name.text) &&
			(STATEMENT.test(firstLine) ||
				(src[open] === "`" && /^\s*$/.test(firstLine))));
	const { node, method } = calleeOf(call, kinds);
	if (!grammar && method === null && !STATEMENT_ANY.test(body.trimStart()))
		return null;
	return { literal, target: node, method, grammar };
}

function outside(
	start: number,
	end: number,
	holes: readonly (readonly [number, number])[],
): [number, number][] {
	let parts: [number, number][] = [[start, end]];
	for (const [hs, he] of holes)
		parts = parts.flatMap(([s, e]): [number, number][] => {
			if (he <= s || hs >= e) return [[s, e]];
			const kept: [number, number][] = [];
			if (s < hs) kept.push([s, hs]);
			if (he < e) kept.push([he, e]);
			return kept;
		});
	return parts;
}

function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1))
		starts.push(i + 1);
	return starts;
}

// Semantic tokens can't cross a line, so a multi-line run becomes one per line.
function split(
	text: string,
	lines: readonly number[],
	start: number,
	end: number,
	kind: TokenKind,
	out: Highlight[],
): void {
	let line = lineOf(lines, start);
	let s = start;
	while (s < end) {
		const next = lines[line + 1] ?? text.length + 1;
		let e = Math.min(end, next - 1);
		if (text[e - 1] === "\r") e--;
		if (e > s)
			out.push({ line, character: s - lines[line]!, length: e - s, kind });
		s = next;
		line++;
	}
}

function lineOf(lines: readonly number[], offset: number): number {
	let lo = 0;
	let hi = lines.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (lines[mid]! <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}
