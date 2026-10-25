#!/usr/bin/env node
// `@ts-expect-error` passes on any error, so a type test of an invalid statement must assert the exact
// SqlError instead. Argument-shape errors (parameter values, missing arguments) may still use it.
import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	getTokenAtPosition,
	isCallExpression,
	isIdentifier,
	isNoSubstitutionTemplateLiteral,
	isStringLiteral,
	isTypeReferenceNode,
	type Node,
	type SourceFile,
	SyntaxKind,
	type TypeReferenceNode,
} from "tsrs/unstable/ast";
import { API } from "tsrs/unstable/sync";

const root = fileURLToPath(new URL("..", import.meta.url));

const STATEMENTS = new Set([
	SyntaxKind.ExpressionStatement,
	SyntaxKind.VariableStatement,
	SyntaxKind.ReturnStatement,
]);
const SQL_CALLEE = /^\w*sql$/i;
const PLACEHOLDER = /\$\d|(?:^|[^:]):[A-Za-z_]|\{[A-Za-z_]\w*\}/;

export interface Violation {
	line: number;
	kind: keyof typeof LABELS;
	statement: string;
}

export function findViolations(
	api: API,
	fileName: string,
	text: string,
): Violation[] {
	const lease = api.createSourceFile(fileName, text);
	try {
		const sf = lease.sourceFile;
		const lineStarts = sf.getLineStarts();
		const found: Violation[] = [];
		for (const m of text.matchAll(
			/\/\/\s*@ts-expect-error\b|\/\*+\s*@ts-expect-error\b/g,
		)) {
			const at = m.index;
			const token = getTokenAtPosition(sf, at);
			if (
				token.kind !== SyntaxKind.EndOfFile &&
				token.getStart() <= at &&
				at < token.end
			)
				continue; // inside a string or template
			const { line } = sf.getLineAndCharacterOfPosition(at);
			if (line + 1 >= lineStarts.length) continue;
			const statement = statementAt(
				sf,
				text,
				lineStarts[line + 1]!,
				lineStarts[line + 2] ?? text.length,
			);
			if (!statement) continue;
			const kind = mentionsRow(statement)
				? "row"
				: hasTextOnlySqlCall(statement)
					? "sql"
					: undefined;
			if (kind)
				found.push({ line: line + 1, kind, statement: firstLine(statement) });
		}
		const visit = (n: Node): void => {
			if (isTypeReferenceNode(n) && nameOf(n) === "SqlError") {
				const [message] = n.typeArguments ?? [];
				if (!message || message.kind === SyntaxKind.StringKeyword)
					found.push({
						line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
						kind: "loose",
						statement: firstLine(n),
					});
			}
			n.forEachChild(visit);
		};
		visit(sf);
		return found.sort((a, b) => a.line - b.line);
	} finally {
		lease.dispose();
	}
}

function statementAt(
	sf: SourceFile,
	text: string,
	from: number,
	to: number,
): Node | undefined {
	let pos = from;
	while (pos < to && /\s/.test(text[pos]!)) pos++;
	if (pos >= to) return undefined;
	let node = getTokenAtPosition(sf, pos);
	if (node.getStart() !== pos) return undefined;
	for (; node && node.kind !== SyntaxKind.SourceFile; node = node.parent) {
		if (node.getStart() !== pos) return undefined;
		if (STATEMENTS.has(node.kind)) return node;
	}
	return undefined;
}

const firstLine = (node: Node): string => node.getText().split("\n")[0]!.trim();

const nameOf = (ref: TypeReferenceNode): string =>
	(ref.typeName.kind === SyntaxKind.QualifiedName
		? ref.typeName.right
		: ref.typeName
	).text;

function mentionsRow(node: Node): boolean {
	let hit = false;
	const visit = (n: Node): void => {
		if (hit) return;
		if (
			isTypeReferenceNode(n) &&
			(nameOf(n) === "Row" || nameOf(n) === "RowOf")
		) {
			hit = true;
			return;
		}
		n.forEachChild(visit);
	};
	visit(node);
	return hit;
}

function hasTextOnlySqlCall(node: Node): boolean {
	let hit = false;
	const visit = (n: Node): void => {
		if (hit) return;
		if (
			isCallExpression(n) &&
			isIdentifier(n.expression) &&
			SQL_CALLEE.test(n.expression.text)
		) {
			const args = [...n.arguments];
			const [q] = args;
			if (
				args.length === 1 &&
				(isStringLiteral(q!) || isNoSubstitutionTemplateLiteral(q!)) &&
				!PLACEHOLDER.test(q.text)
			) {
				hit = true;
				return;
			}
		}
		n.forEachChild(visit);
	};
	visit(node);
	return hit;
}

const LABELS = {
	row: "@ts-expect-error on a Row/RowOf assertion",
	sql: "@ts-expect-error on sql() of a statement without parameters",
	loose: "SqlError without its message",
};

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const files =
		process.argv.length > 2
			? process.argv.slice(2).map((f) => resolve(f))
			: globSync("packages/*/test/**/*.test-d.ts", {
					cwd: root,
					exclude: ["**/node_modules/**"],
				}).map((f) => resolve(root, f));
	const api = new API({ cwd: root });
	const problems: string[] = [];
	try {
		for (const file of files.sort())
			for (const v of findViolations(api, file, readFileSync(file, "utf8")))
				problems.push(
					`${relative(root, file)}:${v.line}: ${LABELS[v.kind]}: ${v.statement}`,
				);
	} finally {
		api.close();
	}
	if (problems.length) {
		console.error(
			`check-expect-error: ${problems.length} type test(s) do not name the exact SqlError; assert it instead,\n` +
				`  expectTypeOf<V<"…">>().toEqualTypeOf<SqlError<"message", position>>()\n\n  ${problems.join("\n  ")}`,
		);
		process.exit(1);
	}
	console.log(`check-expect-error: ok (${files.length} files)`);
}
