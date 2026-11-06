import { GRAMMAR_LEXIS } from "../sql/lex.js";
import { CONSTANTS, KEYWORDS, TYPES } from "../sql/words.js";

const NAMES = ["sql", "tx"];
const SUFFIXES = ["Sql", "SQL", "_sql"];

/**
 * What the VS Code grammar colors without types: calls of sql, tx and names
 * ending in Sql, SQL or _sql, their .fragment() and .as(), and .ddl(), .add()
 * and .raw() of a string that starts like a statement, and the words and
 * tokens it colors. The extension's build writes these into its grammar, so
 * the two can't drift.
 */
export const GRAMMAR = {
	/** A regular expression source for the names. */
	name: `(?:${NAMES.join("|")}|[A-Za-z_$][\\w$]*(?:${SUFFIXES.join("|")}))`,
	nameMethods: ["fragment", "as"],
	statementMethods: ["ddl", "add", "raw"],
	statementWords: [
		"alter",
		"analyze",
		"attach",
		"begin",
		"call",
		"cluster",
		"comment",
		"commit",
		"copy",
		"create",
		"delete",
		"describe",
		"detach",
		"do",
		"drop",
		"explain",
		"grant",
		"import",
		"insert",
		"listen",
		"lock",
		"merge",
		"notify",
		"pragma",
		"reassign",
		"refresh",
		"reindex",
		"release",
		"rename",
		"replace",
		"reset",
		"revoke",
		"rollback",
		"savepoint",
		"security",
		"select",
		"set",
		"show",
		"table",
		"truncate",
		"unlisten",
		"update",
		"vacuum",
		"values",
		"with",
	],
	types: TYPES,
	keywords: KEYWORDS,
	constants: CONSTANTS,
	lexis: GRAMMAR_LEXIS,
} as const;
