import type { EditorKinds } from "./call.js";

export {
	type Dialect,
	type EditorKinds,
	type SqlCall,
	sqlCallAt,
} from "./call.js";
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
