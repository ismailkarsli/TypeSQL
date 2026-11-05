#!/usr/bin/env node
// Measures how fast the current code checks and builds the case1 application.
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import { createSql } from "@typesql/core";
import { CasePlugin } from "@typesql/core/plugins";
import { postgres } from "@typesql/core/postgres";
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
} from "tsrs/ast";
import { API } from "tsrs/sync";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "src/case1.ts";
const source = readFileSync(new URL(fixture, import.meta.url), "utf8");

function sample(type: TypeNode): string {
	if (isUnionTypeNode(type)) {
		const defined = type.types.find(
			(t) => t.kind !== SyntaxKind.UndefinedKeyword && t.getText() !== "null",
		);
		if (!defined) return "null";
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
	queries: string[];
	build: () => { readonly text: string }[];
}

function loadWorkload(): Workload {
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
		const build: Workload["build"] = compileFunction(
			`${code}\nreturn () => [${queries.map((q) => `${q}()`).join(",")}];`,
			["createSql", "postgres", "CasePlugin"],
		)(createSql, postgres, CasePlugin);
		return { queries, build };
	} finally {
		lease.dispose();
		api.close();
	}
}

const { queries, build } = loadWorkload();
const statements = queries.length;

// Check case1 against the built package, as an application would: it reads
// every statement's row type, as executing the statement does. The reads are
// appended to a copy of case1, not put in a second file, which the compiler
// would check on another checker that infers every statement again.
const checked = "src/case1.check.ts";
for (const compiler of ["tsrs", "tsc"]) {
	const config = join(here, "tsconfig.case1.json");
	writeFileSync(
		config,
		JSON.stringify({
			extends: "./tsconfig.json",
			compilerOptions: { paths: {} },
			include: [],
			files: [checked],
		}),
	);
	writeFileSync(
		join(here, checked),
		[
			source,
			'import type { RowType } from "@typesql/core";',
			"export type Rows = [",
			...queries.map((q) => `\tRowType<typeof ${q}>,`),
			"];",
			"",
		].join("\n"),
	);
	try {
		const proc = spawnSync(
			join(here, "../../node_modules/.bin", compiler),
			["--noEmit", "--extendedDiagnostics", "-p", config],
			{ cwd: here, encoding: "utf8" },
		);
		const out = `${proc.stdout}${proc.stderr}`;
		if (proc.status !== 0) {
			console.error(out);
			throw new Error(`${compiler} failed to check ${fixture}`);
		}
		const num = (label: string) =>
			Number(out.match(new RegExp(`^${label}:\\s+([\\d.]+)`, "m"))?.[1]);
		const checkTimeSec = num("Check time");
		console.log(
			`${compiler}: ${checkTimeSec} s check time, ${((checkTimeSec * 1000) / statements).toFixed(2)} ms and ${Math.round(num("Instantiations") / statements)} instantiations per statement`,
		);
	} finally {
		unlinkSync(config);
		unlinkSync(join(here, checked));
	}
}

const iterations = 3_000;
let sink: ReturnType<typeof build> = [];
for (let i = 0; i < iterations / 10; i++) sink = build();
const started = performance.now();
for (let i = 0; i < iterations; i++) sink = build();
const totalMs = performance.now() - started;
if (sink.length !== statements || sink.some((q) => !q.text)) {
	throw new Error("case1 did not build every statement");
}
console.log(
	`runtime: ${((totalMs * 1000) / iterations / statements).toFixed(2)} µs per statement, ${(totalMs / iterations).toFixed(2)} ms for all ${statements}`,
);
