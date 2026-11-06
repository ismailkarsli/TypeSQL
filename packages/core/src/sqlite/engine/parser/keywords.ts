export const RESERVED = [
	"add",
	"all",
	"alter",
	"and",
	"as",
	"autoincrement",
	"between",
	"case",
	"check",
	"collate",
	"commit",
	"constraint",
	"create",
	"default",
	"deferrable",
	"delete",
	"distinct",
	"drop",
	"else",
	"escape",
	"except",
	"exists",
	"foreign",
	"from",
	"group",
	"having",
	"in",
	"index",
	"insert",
	"intersect",
	"into",
	"is",
	"isnull",
	"join",
	"limit",
	"not",
	"nothing",
	"notnull",
	"null",
	"on",
	"or",
	"order",
	"primary",
	"references",
	"returning",
	"select",
	"set",
	"table",
	"then",
	"to",
	"transaction",
	"union",
	"unique",
	"update",
	"using",
	"values",
	"when",
	"where",
] as const;
export type Reserved = (typeof RESERVED)[number];

export const JOIN_KEYWORDS = [
	"cross",
	"full",
	"inner",
	"left",
	"natural",
	"outer",
	"right",
] as const;
type JoinKeyword = (typeof JOIN_KEYWORDS)[number];

export type NotBareAlias =
	| Reserved
	| JoinKeyword
	| "glob"
	| "like"
	| "match"
	| "regexp"
	| "indexed";

export type NotTableAlias = Reserved | JoinKeyword | "indexed";
