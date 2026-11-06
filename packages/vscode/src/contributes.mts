// The tables package.json's contributions and the grammar are generated from
// (scripts/contributes.mts), and that the extension reads at run time.
import type { TokenKind } from "@typesql/language-server";

/** The languages whose strings hold SQL, and their TextMate scopes. */
export const LANGUAGES = {
	typescript: "source.ts",
	typescriptreact: "source.tsx",
	javascript: "source.js",
	javascriptreact: "source.js.jsx",
} as const;

/**
 * Each SQL token kind as a semantic token, and the grammar scope whose color
 * it takes. The tokens carry the definition modifier, which TypeScript never
 * sets, and package.json's semanticTokenScopes map each to its scope. Strings
 * and comments stay plain, as in the grammar.
 */
export const SQL_TOKENS = {
	keyword: { token: "keyword.definition", scope: "keyword.other.sql" },
	constant: { token: "enumMember.definition", scope: "constant.language.sql" },
	type: { token: "type.definition", scope: "storage.type.sql" },
	function: {
		token: "function.definition",
		scope: "entity.name.function.sql",
	},
	number: { token: "number.definition", scope: "constant.numeric.sql" },
	escape: {
		token: "regexp.definition",
		scope: "constant.character.escape.sql",
	},
	operator: { token: "operator.definition", scope: "keyword.operator.sql" },
	parameter: {
		token: "parameter.definition",
		scope: "variable.parameter.positional.sql",
	},
	variable: { token: "variable.definition", scope: "meta.embedded.line.sql" },
	punctuation: { token: "string.definition", scope: "meta.embedded.line.sql" },
	string: null,
	comment: null,
} as const satisfies {
	readonly [K in TokenKind]: { token: string; scope: string } | null;
};
