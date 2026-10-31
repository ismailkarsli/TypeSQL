import type { EditorKinds } from "./call.js";

export { type EditorKinds } from "./call.js";
export {
	type CompletionItem,
	type Completions,
	completionsAt,
} from "./complete.js";

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
		Identifier: k("Identifier"),
		CallExpression: k("CallExpression"),
		PropertyAccessExpression: k("PropertyAccessExpression"),
		StringLiteral: k("StringLiteral"),
		NoSubstitutionTemplateLiteral: k("NoSubstitutionTemplateLiteral"),
		TemplateExpression: k("TemplateExpression"),
	};
}
