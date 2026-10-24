/**
 * The statement literal under the cursor: the first argument of a `sql(…)` / `tx(…)` call (the
 * callee is core's `Sql` or `TransactionalSql`), or of `sql.fragment(…)` / `sql.as(…)`, and the
 * call's `DB` type. Only the callee is typed, never the call.
 */

import type {
	CallExpression,
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
import { isCoreRef } from "../cache/discover.js";

/** SyntaxKind values (typescript/ast), passed in so this module loads nothing at runtime. */
export interface EditorKinds {
	readonly CallExpression: number;
	readonly PropertyAccessExpression: number;
	readonly StringLiteral: number;
	readonly NoSubstitutionTemplateLiteral: number;
	readonly TemplateExpression: number;
}

export interface SqlCall {
	readonly file: SourceFile;
	/** The cursor's offset in the file. */
	readonly offset: number;
	/** Offsets of the literal's text (inside the quotes) in the file. */
	readonly start: number;
	readonly end: number;
	/**
	 * The literal's text as written, as long as the source range: each `${…}` becomes `$0` padded
	 * with spaces and each escape sequence keeps its length, so an offset in the text is
	 * `start` plus an offset in the file.
	 */
	readonly text: string;
	readonly db: Type;
}

const METHODS = new Set(["fragment", "as"]);

/** The statement literal of a core `sql` call that contains the cursor (an offset or an LSP position), or null. */
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
		!parts ||
		offset < parts.start ||
		offset > parts.end ||
		parts.holes.some(([s, e]) => offset > s && offset < e)
	)
		return null;

	const callee = call.expression;
	let db: Type | undefined;
	if (
		callee.kind === kinds.PropertyAccessExpression &&
		METHODS.has((callee as PropertyAccessExpression).name.text)
	) {
		const receiver = await checker.getTypeAtLocation(
			(callee as PropertyAccessExpression).expression,
		);
		if (await isCoreRef(receiver, ["Sql", "TransactionalSql"], isCorePath))
			db = (await checker.getTypeArguments(receiver as never))[0];
	} else {
		const t = await checker.getTypeAtLocation(callee);
		if (await isCoreRef(t, ["Sql", "TransactionalSql"], isCorePath))
			db = (await checker.getTypeArguments(t as never))[0];
	}
	return db
		? { file, offset, start: parts.start, end: parts.end, text: parts.text, db }
		: null;
}

/** The innermost call whose first argument is a string or template literal containing `offset`. */
function callAt(
	file: SourceFile,
	offset: number,
	kinds: EditorKinds,
): CallExpression | null {
	let found: CallExpression | null = null;
	const visit = (n: Node): void => {
		if (offset < n.pos || offset > n.end) return;
		if (n.kind === kinds.CallExpression) {
			const arg = (n as CallExpression).arguments[0];
			if (
				arg &&
				(arg.kind === kinds.StringLiteral ||
					arg.kind === kinds.NoSubstitutionTemplateLiteral ||
					arg.kind === kinds.TemplateExpression) &&
				offset > arg.getStart(file) &&
				offset <= arg.end
			) {
				found = n as CallExpression;
			}
		}
		n.forEachChild(visit);
	};
	visit(file);
	return found;
}

/** The literal's text range, its text (see `SqlCall.text`) and its `${…}` ranges. */
function textOf(
	file: SourceFile,
	literal: Node,
	kinds: EditorKinds,
): {
	start: number;
	end: number;
	text: string;
	holes: [number, number][];
} | null {
	const src = file.text;
	const open = literal.getStart(file);
	const quote = src[open];
	const start = open + 1;
	// an unterminated literal (still being typed) has no closing quote
	let end = literal.end;
	if (end - 1 > open && src[end - 1] === quote && src[end - 2] !== "\\") end--;
	const holes: [number, number][] = [];
	if (literal.kind === kinds.TemplateExpression) {
		const t = literal as TemplateExpression;
		let prev: Node = t.head;
		for (const span of t.templateSpans) {
			// from `${` to `}`
			holes.push([prev.end - 2, span.literal.getStart(file) + 1]);
			prev = span.literal;
		}
	}
	let text = "";
	let i = start;
	for (const [s, e] of [...holes, [end, end] as [number, number]]) {
		text += escapes(src.slice(i, s));
		if (e > s) text += "$0".padEnd(e - s, " ");
		i = e;
	}
	return { start, end, text, holes };
}

/** Escape sequences replaced by text of the same length: `\"` → ` "`, `\n` → two spaces. */
const escapes = (s: string): string =>
	s.replace(/\\(.)/gs, (_, c: string) =>
		c === '"' || c === "'" || c === "`" ? ` ${c}` : "  ",
	);
