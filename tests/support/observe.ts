// Runs with the scenario's working directory and the workspace's pinned compiler.
// usage: node observe.ts <output.json>

import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript/sync";
import type { CompilerObservation, Diagnostic } from "./types.ts";

const output = process.argv[2];
if (!output) throw new Error("usage: node observe.ts <output.json>");
const cwd = process.cwd();
const app = resolve("app.ts");
const api = new ts.API({ cwd });
try {
	const snapshot = api.createSnapshot({ openFiles: [app] });
	const project = snapshot.getDefaultProjectForFile(app);
	if (!project)
		throw new Error("Infrastructure: compiler did not open scenario project");
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
	type Location = Pick<Diagnostic, "file" | "line" | "column" | "expression">;
	function diagnostic(d: ts.Diagnostic, parent?: Location): Diagnostic {
		const observation: Diagnostic = {
			code: d.code,
			category: d.category,
			message: d.text,
		};
		let location: Location | undefined;
		if (d.fileName) {
			if (!d.startPosition)
				throw new Error("File diagnostic has no start position");
			location = {
				// A path out of the scenario stays absolute: its relative form depends on $TMPDIR.
				file: d.fileName.startsWith(`${cwd}/`)
					? relative(cwd, d.fileName)
					: d.fileName,
				line: d.startPosition.line + 1,
				column: d.startPosition.character + 1,
				expression: readFileSync(d.fileName, "utf8").slice(d.pos, d.end),
			};
			if (JSON.stringify(location) !== JSON.stringify(parent))
				Object.assign(observation, location);
		}
		if (d.messageChain?.length)
			observation.details = d.messageChain.map((x) => diagnostic(x, location));
		if (d.relatedInformation?.length)
			observation.related = d.relatedInformation.map((x) => diagnostic(x));
		return observation;
	}
	const diagnostics = [
		...program.getConfigFileParsingDiagnostics(),
		...program.getProgramDiagnostics(),
		...program.getGlobalDiagnostics(),
		...program.getSyntacticDiagnostics(),
		...program.getBindDiagnostics(),
		...program.getSemanticDiagnostics(),
	].map((d) => diagnostic(d));
	const observation: CompilerObservation = {
		types,
		diagnostics: [
			...new Map(diagnostics.map((d) => [JSON.stringify(d), d])).values(),
		],
	};
	writeFileSync(output, JSON.stringify(observation, null, 2));
} finally {
	api.close();
}
