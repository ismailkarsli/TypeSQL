// Read the immutable application fixture once for compile-time and runtime measurements.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { compileFunction } from "node:vm";
import { createSql } from "@typesql/core";
import {
	isArrayTypeNode,
	isCallExpression,
	isIdentifier,
	isImportDeclaration,
	isLiteralTypeNode,
	isParenthesizedTypeNode,
	isPropertyAccessExpression,
	isPropertySignatureDeclaration,
	isTupleTypeNode,
	isTypeLiteralNode,
	isTypeReferenceNode,
	isUnionTypeNode,
	isVariableStatement,
	SyntaxKind,
	type TypeNode,
} from "tsrs/unstable/ast";
import { API } from "tsrs/unstable/sync";

export const fixture = "src/case1.ts";
export const source = readFileSync(new URL(fixture, import.meta.url), "utf8");

/** Keep every SQL call while placing independent calls in separate checker units. */
export function shardWorkload(count: number): string[] {
	const api = new API();
	const lease = api.createSourceFile(
		new URL(fixture, import.meta.url).pathname,
		source,
	);
	try {
		const calls: { start: number; end: number }[] = [];
		for (const statement of lease.sourceFile.statements) {
			if (!isVariableStatement(statement)) continue;
			if (
				!statement.modifiers?.some((m) => m.kind === SyntaxKind.ExportKeyword)
			)
				continue;
			for (const declaration of statement.declarationList.declarations) {
				const call = declaration.initializer;
				if (!call || !isCallExpression(call)) continue;
				const callee = call.expression;
				if (
					(isIdentifier(callee) && callee.text === "sql") ||
					(isPropertyAccessExpression(callee) && callee.getText() === "sql.as")
				) {
					calls.push({ start: statement.getStart(), end: statement.end });
				}
			}
		}
		if (calls.length !== 379)
			throw new Error(`case1 SQL call count changed: ${calls.length}`);
		return Array.from({ length: count }, (_, shard) => {
			let text = source;
			for (let i = calls.length - 1; i >= 0; i--) {
				if (i % count === shard) continue;
				const { start, end } = calls[i]!;
				text =
					text.slice(0, start) +
					text.slice(start, end).replace(/[^\n]/g, " ") +
					text.slice(end);
			}
			return text;
		});
	} finally {
		lease.dispose();
		api.close();
	}
}

/** Deterministic, populated inputs; SQL text and fragment expressions always come from case1. */
function sample(type: TypeNode): string {
	if (isUnionTypeNode(type)) {
		const defined = type.types.find(
			(t) => t.kind !== SyntaxKind.UndefinedKeyword && t.getText() !== "null",
		);
		if (!defined) return "null";
		// These are type-level JSON markers, not reusable runtime parameter tokens.
		if (defined.getText().includes("\\0PJ")) return "undefined";
		return sample(defined);
	}
	if (isParenthesizedTypeNode(type)) return sample(type.type);
	if (isArrayTypeNode(type)) return `[${sample(type.elementType)}]`;
	if (isTupleTypeNode(type)) return `[${type.elements.map(sample).join(",")}]`;
	if (isLiteralTypeNode(type)) {
		return type.getText().includes("\\0PJ") ? '"{}"' : type.getText();
	}
	if (isTypeLiteralNode(type)) {
		return `{${type.members
			.flatMap((member) =>
				isPropertySignatureDeclaration(member) && member.type
					? [`${JSON.stringify(member.name.getText())}: ${sample(member.type)}`]
					: [],
			)
			.join(",")}}`;
	}
	if (isTypeReferenceNode(type)) {
		if (type.typeName.getText() === "Date")
			return 'new Date("2026-01-01T00:00:00Z")';
		if (type.typeName.getText() === "Record") return '{"sample": 1}';
	}
	switch (type.kind) {
		case SyntaxKind.StringKeyword:
			return '"sample"';
		case SyntaxKind.NumberKeyword:
			return "1";
		case SyntaxKind.BooleanKeyword:
			return "true";
		case SyntaxKind.TemplateLiteralType:
			return '"sample"';
		default:
			throw new Error(`No runtime sample for ${type.getText()}`);
	}
}

interface Workload {
	statements: number;
	/** Build every application statement once, reusing the fixture's setup fragments. */
	build: () => { readonly text: string }[];
}

export function loadWorkload(): Workload {
	const api = new API();
	const lease = api.createSourceFile(
		new URL(fixture, import.meta.url).pathname,
		source,
	);
	try {
		const edits: { start: number; end: number; text: string }[] = [];
		const queries: string[] = [];
		for (const statement of lease.sourceFile.statements) {
			if (isImportDeclaration(statement)) {
				edits.push({
					start: statement.getStart(),
					end: statement.end,
					text: "",
				});
				continue;
			}
			if (!isVariableStatement(statement)) continue;
			const hasModifier = (kind: SyntaxKind) =>
				statement.modifiers?.some((m) => m.kind === kind);
			if (hasModifier(SyntaxKind.DeclareKeyword)) {
				edits.push({
					start: statement.getStart(),
					end: statement.end,
					text: statement.declarationList.declarations
						.map((d) => {
							if (!d.type)
								throw new Error(`Missing input type: ${d.getText()}`);
							return `const ${d.name.getText()} = ${sample(d.type)};`;
						})
						.join("\n"),
				});
				continue;
			}
			if (!hasModifier(SyntaxKind.ExportKeyword)) continue;
			for (const d of statement.declarationList.declarations) {
				const call = d.initializer;
				if (!call || !isCallExpression(call)) continue;
				const callee = call.expression;
				if (
					(isIdentifier(callee) && callee.text === "sql") ||
					(isPropertyAccessExpression(callee) && callee.getText() === "sql.as")
				) {
					queries.push(d.name.getText());
					edits.push({
						start: call.getStart(),
						end: call.end,
						text: `() => (${call.getText()})`,
					});
				}
			}
			edits.push({
				start: statement.getStart(),
				end: statement.getStart() + "export ".length,
				text: "",
			});
		}
		let executable = source;
		for (const edit of edits.sort((a, b) => b.start - a.start)) {
			executable =
				executable.slice(0, edit.start) +
				edit.text +
				executable.slice(edit.end);
		}
		if (!queries.length) throw new Error("case1 contains no statements");
		const code = stripTypeScriptTypes(executable);
		const build = compileFunction(
			`${code}\nreturn () => [${queries.map((q) => `${q}()`).join(",")}];`,
			["createSql"],
		)(createSql) as Workload["build"];
		return { statements: queries.length, build };
	} finally {
		lease.dispose();
		api.close();
	}
}
