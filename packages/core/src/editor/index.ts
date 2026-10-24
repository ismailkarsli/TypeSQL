/// <reference types="node" />
/**
 * `@typesql/core/editor`: completions inside statement literals, for editor extensions. Runs in
 * Node next to a TypeScript 7.1 API session (on the language server's own program), reads the
 * schema from the `DB` type of the call with the checker and the context at the cursor with a
 * scanner. It never evaluates a statement's types.
 *
 * Load the project's own copy (resolved from its tsconfig), so completions follow the project's
 * version of the engine.
 */
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { EditorKinds } from "./call.js";

export { type EditorKinds, type SqlCall, sqlCallAt } from "./call.js";
export {
	type CompletionItem,
	type Completions,
	completions,
	completionsAt,
	quoteIdent,
	type Range,
} from "./complete.js";
export {
	type Context,
	type Cte,
	contextAt,
	type Expect,
	fold,
	type RelRef,
	type ScopeItem,
} from "./scan.js";
export { type Column, type Relation, type Schema, schemaOf } from "./schema.js";

/** The package root (dist/editor/ or src/editor/ → the directory with package.json). */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Whether a declaration belongs to this copy of `@typesql/core` (its dist or src). */
export const isCorePath = (path: string): boolean =>
	path.startsWith(join(root, "dist") + sep) ||
	path.startsWith(join(root, "src") + sep);

/** The `EditorKinds` from `typescript/ast`'s `SyntaxKind`. */
export function editorKinds(
	syntaxKind: Readonly<Record<string, number | string>>,
): EditorKinds {
	const k = (name: string): number => {
		const v = syntaxKind[name];
		if (typeof v !== "number")
			throw new Error(`typesql: SyntaxKind.${name} is missing`);
		return v;
	};
	return {
		CallExpression: k("CallExpression"),
		PropertyAccessExpression: k("PropertyAccessExpression"),
		StringLiteral: k("StringLiteral"),
		NoSubstitutionTemplateLiteral: k("NoSubstitutionTemplateLiteral"),
		TemplateExpression: k("TemplateExpression"),
	};
}
