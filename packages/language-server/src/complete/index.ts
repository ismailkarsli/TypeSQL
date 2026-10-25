/**
 * Completions inside statement literals. Runs next to a TypeScript 7.1 API session (on the
 * language server's own program), reads the schema from the `DB` type of the call with the
 * checker and the context at the cursor with a scanner. It never evaluates a statement's types.
 *
 * It reads how `@typesql/core` represents a schema (`$view`, `$types`, `$functions`, a column's
 * `type`) and finds `Sql` / `TransactionalSql` by their declarations in the project's core.
 */
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
