import type {
	CallExpression,
	Identifier,
	Node,
	PropertyAccessExpression,
	SourceFile,
} from "typescript/ast";
import type {
	Checker,
	DocumentIdentifier,
	Program,
	Type,
} from "typescript/async";
import { type EditorKinds, isCoreRef, textOf } from "../complete/call.js";
import { lex, type TokenKind } from "./lex.js";

export type { TokenKind } from "./lex.js";

/** A run of one kind on one line, in UTF-16 code units. */
export interface Highlight {
	readonly line: number;
	readonly character: number;
	readonly length: number;
	readonly kind: TokenKind;
}

// Types whose call takes SQL, and methods that take SQL on them.
const CALLABLE = ["Sql", "TransactionalSql", "SqlApi", "MigrationContext"];
const METHODS: Readonly<Record<string, readonly string[]>> = {
	as: CALLABLE,
	fragment: CALLABLE,
	prepare: CALLABLE,
	raw: CALLABLE,
	add: ["MigrationContext", "Migrations"],
};

// What the VS Code grammar colors without types, so its colors are kept for
// TypeSQL calls and undone for others: calls of sql, tx and names ending in
// Sql, SQL or _sql, their .fragment() and .as(), and .add() and .raw() of a
// string that starts like a statement.
const NAME = /^(?:sql|tx|[A-Za-z_$][\w$]*(?:Sql|SQL|_sql))$/;
const STATEMENT_WORDS =
	"alter|analyze|attach|begin|call|cluster|comment|commit|copy|create|delete|detach|do|drop|explain|grant|import|insert|listen|lock|merge|notify|pragma|reassign|refresh|reindex|release|replace|reset|revoke|rollback|savepoint|security|select|set|table|truncate|unlisten|update|vacuum|values|with";
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

interface Candidate {
	readonly literal: Node;
	/** The node whose type decides, and the type names that make it SQL. */
	readonly target: Node;
	readonly types: readonly string[];
	readonly grammar: boolean;
}

/**
 * Highlights for the first-argument strings of calls in `document`: SQL tokens
 * where a TypeSQL call's string isn't colored by the grammar, and `string`
 * where the grammar colors another function's string as SQL. Strings after a
 * `/* sql *\/` marker are left to the grammar.
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
	const verdicts = new Map<string, Promise<boolean>>();
	const isSql = (t: Type, names: readonly string[]): Promise<boolean> => {
		const key = `${t.id} ${names.join()}`;
		const known = verdicts.get(key);
		if (known) return known;
		const v = isCoreRef(t, names, isCorePath);
		verdicts.set(key, v);
		return v;
	};
	const sql = await Promise.all(
		candidates.map((c, i) => isSql(types[i]!, c.types)),
	);
	const lines = lineStarts(file.text);
	const out: Highlight[] = [];
	candidates.forEach((c, i) => {
		if (sql[i] === c.grammar) return;
		const parts = textOf(file, c.literal, kinds);
		const spans: [number, number, TokenKind][] = sql[i]
			? lex(parts.text).map((t) => [
					parts.start + t.start,
					parts.start + t.end,
					t.kind,
				])
			: [[parts.start, parts.end, "string"]];
		for (const [start, end, kind] of spans)
			for (const [s, e] of outside(start, end, parts.holes))
				split(file.text, lines, s, e, kind, out);
	});
	return out.sort((a, b) => a.line - b.line || a.character - b.character);
}

function collect(file: SourceFile, kinds: EditorKinds): Candidate[] {
	const out: Candidate[] = [];
	const visit = (n: Node): void => {
		if (n.kind === kinds.CallExpression) {
			const c = candidate(file, n as CallExpression, kinds);
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
	if (
		!literal ||
		(literal.kind !== kinds.StringLiteral &&
			literal.kind !== kinds.NoSubstitutionTemplateLiteral &&
			literal.kind !== kinds.TemplateExpression)
	)
		return null;
	const src = file.text;
	const open = literal.getStart(file);
	if (MARKER.test(src.slice(literal.pos, open))) return null;
	const body = src.slice(open + 1, literal.end);
	const firstLine = body.slice(0, body.search(/\n|$/));
	const callee = call.expression;
	const member =
		callee.kind === kinds.PropertyAccessExpression
			? (callee as PropertyAccessExpression)
			: null;
	const method = member && Object.hasOwn(METHODS, member.name.text);
	const nameOf = (n: Node): string | null =>
		n.kind === kinds.Identifier
			? (n as Identifier).text
			: n.kind === kinds.PropertyAccessExpression
				? (n as PropertyAccessExpression).name.text
				: null;
	const name = nameOf(callee);
	const grammar =
		(name !== null && NAME.test(name)) ||
		(!!member &&
			(member.name.text === "fragment" || member.name.text === "as") &&
			NAME.test(nameOf(member.expression) ?? "")) ||
		(!!member &&
			(member.name.text === "add" || member.name.text === "raw") &&
			(STATEMENT.test(firstLine) ||
				(src[open] === "`" && /^\s*$/.test(firstLine))));
	// A call that the grammar leaves alone needs a type only if it could be a
	// TypeSQL call: a method that takes SQL, or a string that starts like a
	// statement, past any blank lines.
	if (!grammar && !method && !STATEMENT_ANY.test(body.trimStart())) return null;
	return method
		? {
				literal,
				target: member.expression,
				types: METHODS[member.name.text]!,
				grammar,
			}
		: { literal, target: callee, types: CALLABLE, grammar };
}

// The parts of [start, end) outside the template literal's `${…}` holes.
function outside(
	start: number,
	end: number,
	holes: readonly (readonly [number, number])[],
): [number, number][] {
	let parts: [number, number][] = [[start, end]];
	for (const [hs, he] of holes)
		parts = parts.flatMap(([s, e]): [number, number][] =>
			he <= s || hs >= e
				? [[s, e]]
				: [
						...(s < hs ? [[s, hs] as [number, number]] : []),
						...(he < e ? [[he, e] as [number, number]] : []),
					],
		);
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
