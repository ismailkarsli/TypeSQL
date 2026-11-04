import type {
	CallExpression,
	Identifier,
	LineAndCharacter,
	Node,
	PropertyAccessExpression,
	SourceFile,
	TemplateExpression,
} from "typescript/ast";
import type {
	Checker,
	DocumentIdentifier,
	Program,
	Type,
} from "typescript/async";

export interface EditorKinds {
	readonly Identifier: number;
	readonly CallExpression: number;
	readonly PropertyAccessExpression: number;
	readonly StringLiteral: number;
	readonly NoSubstitutionTemplateLiteral: number;
	readonly TemplateExpression: number;
}

export interface SqlCall {
	readonly file: SourceFile;
	readonly offset: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
	/** The TypeScript literal's delimiter: `"`, `'` or a backtick. */
	readonly quote: string;
	readonly db: Type;
	readonly dialect: Dialect;
}

export type Dialect = "postgres" | "sqlite";

const METHODS = new Set(["fragment", "as"]);

export async function sqlCallAt(
	program: Program,
	checker: Checker,
	kinds: EditorKinds,
	document: DocumentIdentifier,
	at: number | LineAndCharacter,
	isCorePath: (path: string) => boolean,
): Promise<SqlCall | null> {
	const file = await program.getSourceFile(document);
	if (!file) return null;
	const offset =
		typeof at === "number"
			? at
			: file.getPositionOfLineAndCharacter(at.line, at.character);
	const call = callAt(file, offset, kinds);
	if (!call) return null;
	const literal = call.arguments[0]!;
	const parts = textOf(file, literal, kinds);
	if (
		offset < parts.start ||
		offset > parts.end ||
		parts.holes.some(([s, e]) => offset > s && offset < e)
	)
		return null;

	const callee = call.expression;
	const sqlType = await checker.getTypeAtLocation(
		isPropertyAccess(callee, kinds) && METHODS.has(callee.name.text)
			? callee.expression
			: callee,
	);
	const target = await sqlTarget(checker, sqlType, isCorePath);
	if (!target) return null;
	return {
		file,
		offset,
		start: parts.start,
		end: parts.end,
		text: parts.text,
		quote: file.text[literal.getStart(file)]!,
		...target,
	};
}

async function sqlTarget(
	checker: Checker,
	t: Type,
	isCorePath: (path: string) => boolean,
): Promise<{ db: Type; dialect: Dialect } | null> {
	if (!t.isTypeReference()) return null;
	if (await isCoreRef(t, ["Sql", "TransactionalSql"], isCorePath)) {
		const db = (await checker.getTypeArguments(t))[0];
		const sym = await t.getSymbol();
		const sqlite = sym?.declarations.some((d) =>
			/[\\/]sqlite[\\/]/.test(d.path),
		);
		return db ? { db, dialect: sqlite ? "sqlite" : "postgres" } : null;
	}
	// core's createSql(dialect).withPlugin(…) returns SqlApi<Engine, DB, …>.
	if (await isCoreRef(t, ["SqlApi"], isCorePath)) {
		const [engine, db] = await checker.getTypeArguments(t);
		const name = engine ? (await engine.getSymbol())?.name : undefined;
		return db
			? { db, dialect: name === "SqliteEngine" ? "sqlite" : "postgres" }
			: null;
	}
	return null;
}

function callAt(
	file: SourceFile,
	offset: number,
	kinds: EditorKinds,
): CallExpression | null {
	let found: CallExpression | null = null;
	const visit = (n: Node): void => {
		if (offset < n.pos || offset > n.end) return;
		if (isCall(n, kinds) && isSqlLiteral(n.arguments[0], kinds)) found = n;
		n.forEachChild(visit);
	};
	visit(file);
	return found;
}

export const isCall = (n: Node, kinds: EditorKinds): n is CallExpression =>
	n.kind === kinds.CallExpression;

export const isPropertyAccess = (
	n: Node,
	kinds: EditorKinds,
): n is PropertyAccessExpression => n.kind === kinds.PropertyAccessExpression;

export const isIdentifier = (n: Node, kinds: EditorKinds): n is Identifier =>
	n.kind === kinds.Identifier;

const isTemplate = (n: Node, kinds: EditorKinds): n is TemplateExpression =>
	n.kind === kinds.TemplateExpression;

export const isSqlLiteral = (
	n: Node | undefined,
	kinds: EditorKinds,
): n is Node =>
	n !== undefined &&
	(n.kind === kinds.StringLiteral ||
		n.kind === kinds.NoSubstitutionTemplateLiteral ||
		n.kind === kinds.TemplateExpression);

/** A SQL literal's source span and text, with each `${…}` hole as `[start, end)`. */
export interface LiteralText {
	readonly start: number;
	readonly end: number;
	readonly text: string;
	readonly holes: [number, number][];
}

export function textOf(
	file: SourceFile,
	literal: Node,
	kinds: EditorKinds,
): LiteralText {
	const src = file.text;
	const open = literal.getStart(file);
	const quote = src[open];
	const start = open + 1;
	let end = literal.end;
	if (end - 1 > open && src[end - 1] === quote && !escaped(src, end - 1)) end--;
	const holes: [number, number][] = [];
	if (isTemplate(literal, kinds)) {
		let prev: Node = literal.head;
		for (const span of literal.templateSpans) {
			holes.push([prev.end - 2, span.literal.getStart(file) + 1]);
			prev = span.literal;
		}
	}
	let text = "";
	let i = start;
	for (const [s, e] of [...holes, [end, end] satisfies [number, number]]) {
		text += escapes(src.slice(i, s));
		if (e > s) text += "$0".padEnd(e - s, " ");
		i = e;
	}
	return { start, end, text, holes };
}

function escaped(s: string, i: number): boolean {
	let n = 0;
	while (s[i - n - 1] === "\\") n++;
	return n % 2 === 1;
}

// Replace each escape with two characters to keep offsets. An escaped quote
// keeps its quote and gets a space outside the SQL quote it opens or closes,
// so `\"Users\"` reads as ` "Users" `, not ` "Users "`.
const escapes = (s: string): string => {
	const open = new Set<string>();
	return s.replace(/\\(.)/gs, (_, c: string) => {
		if (c !== '"' && c !== "'" && c !== "`") return "  ";
		if (open.delete(c)) return `${c} `;
		open.add(c);
		return ` ${c}`;
	});
};

export async function isCoreRef(
	type: Type,
	names: readonly string[],
	isCorePath: (path: string) => boolean,
): Promise<boolean> {
	if (!type.isTypeReference()) return false;
	const sym = await type.getSymbol();
	return (
		!!sym &&
		names.includes(sym.name) &&
		sym.declarations.some((d) => isCorePath(d.path))
	);
}
