// Runs with the consumer's working directory and the workspace's pinned compiler.

import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript/sync";
import type { Diagnostic } from "./types.ts";

const cwd = process.cwd();
const app = resolve("app.ts");
const api = new ts.API({ cwd });
try {
	const snapshot = api.createSnapshot({ openFiles: [app] });
	const project = snapshot.getDefaultProjectForFile(app);
	if (!project)
		throw new Error("Infrastructure: compiler did not open consumer project");
	const { checker, program } = project;
	const printed = (t: ts.Type) =>
		checker.typeToString(
			t,
			undefined,
			ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
		);
	function render(t: ts.Type, parents = new Set<number>()): string {
		if (parents.has(t.id))
			throw new Error(
				`Recursive observed type requires an explicit observer extension: ${printed(t)}`,
			);
		const next = new Set([...parents, t.id]);
		if (t.isUnionType())
			return t
				.getTypes()
				.map((x) => render(x, next))
				.join(" | ");
		if (t.isIntersectionType())
			return t
				.getTypes()
				.map((x) => `(${render(x, next)})`)
				.join(" & ");
		if (t.isTupleType()) {
			const target = t.getTarget();
			const args = checker.getTypeArguments(t);
			return `${target.readonly ? "readonly " : ""}[${args
				.map((arg, i) => {
					const flags = target.elementFlags[i] ?? ts.ElementFlags.Required;
					const name = target.labeledElementDeclarations?.[i]?.resolve()?.name;
					const label = name && "text" in name ? name.text : undefined;
					const optional = flags & ts.ElementFlags.Optional;
					const rest =
						flags & (ts.ElementFlags.Rest | ts.ElementFlags.Variadic);
					return `${rest ? "..." : ""}${label ? `${label}${optional ? "?" : ""}: ` : ""}${render(arg, next)}${rest ? "[]" : ""}${optional && !label ? "?" : ""}`;
				})
				.join(", ")}]`;
		}
		if (
			t.isTypeReference() &&
			(checker.isArrayType(t) || t.getSymbol()?.name === "ReadonlyArray")
		) {
			const [item] = checker.getTypeArguments(t);
			if (!item) throw new Error("Array type has no element type");
			return `${t.getSymbol()?.name === "ReadonlyArray" ? "readonly " : ""}(${render(item, next)})[]`;
		}
		if (!(t.flags & ts.TypeFlags.Object)) return printed(t);
		// Built-in public value types have meaningful names. Application aliases do
		// not: walk them so an inferred nullable field cannot hide behind an alias.
		const symbol = t.getSymbol();
		if (
			symbol &&
			["Date", "Buffer", "Uint8Array", "Decimal"].includes(symbol.name)
		)
			return checker.typeToString(
				t,
				undefined,
				ts.TypeFormatFlags.NoTruncation,
			);
		const calls = checker.getSignaturesOfType(t, ts.SignatureKind.Call);
		if (calls.length) return printed(t);
		const properties = checker
			.getPropertiesOfType(t)
			.map(
				(p) =>
					`${checker.isReadonlySymbol(p) ? "readonly " : ""}${/^[a-zA-Z_$][\w$]*$/.test(p.name) ? p.name : JSON.stringify(p.name)}${p.flags & ts.SymbolFlags.Optional ? "?" : ""}: ${render(checker.getNonMissingTypeOfSymbol(p), next)}`,
			);
		for (const index of checker.getIndexInfosOfType(t))
			properties.push(
				`${index.isReadonly ? "readonly " : ""}[key: ${render(index.keyType, next)}]: ${render(index.valueType, next)}`,
			);
		return `{ ${properties.join("; ")} }`;
	}
	const module = checker.getSymbolOfSourceFile(app);
	if (!module) throw new Error("app.ts must be a module");
	const types = Object.fromEntries(
		checker.getExportsOfModule(module).map((s) => {
			const target =
				s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
			const type =
				target.flags & ts.SymbolFlags.TypeAlias
					? checker.getDeclaredTypeOfSymbol(target)
					: checker.getTypeOfSymbol(target);
			return [s.name, render(type)];
		}),
	);
	function diagnostic(d: ts.Diagnostic): Diagnostic {
		const observation: Diagnostic = {
			code: d.code,
			category: d.category,
			message: d.text,
		};
		if (d.fileName) {
			if (!d.startPosition)
				throw new Error("File diagnostic has no start position");
			const source = readFileSync(d.fileName, "utf8");
			Object.assign(observation, {
				file: relative(cwd, d.fileName),
				line: d.startPosition.line + 1,
				column: d.startPosition.character + 1,
				expression: source.slice(d.pos, d.end),
			});
		}
		if (d.messageChain?.length)
			observation.details = d.messageChain.map(diagnostic);
		if (d.relatedInformation?.length)
			observation.related = d.relatedInformation.map(diagnostic);
		return observation;
	}
	const diagnostics = [
		...program.getConfigFileParsingDiagnostics(),
		...program.getProgramDiagnostics(),
		...program.getGlobalDiagnostics(),
		...program.getSyntacticDiagnostics(),
		...program.getBindDiagnostics(),
		...program.getSemanticDiagnostics(),
	].map(diagnostic);
	const unique = [
		...new Map(diagnostics.map((d) => [JSON.stringify(d), d])).values(),
	];
	writeFileSync(
		".consumer/compiler.json",
		JSON.stringify({ types, diagnostics: unique }, null, 2),
	);
} finally {
	api.close();
}
