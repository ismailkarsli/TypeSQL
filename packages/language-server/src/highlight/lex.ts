export type TokenKind =
	| "keyword"
	| "type"
	| "function"
	| "number"
	| "string"
	| "comment"
	| "operator"
	| "parameter"
	| "variable";

export interface Token {
	readonly start: number;
	readonly end: number;
	readonly kind: TokenKind;
}

// The word lists and token rules follow the VS Code extension's grammar
// (packages/vscode/syntaxes/sql-injection.tmLanguage.json), so a string colors
// the same whichever of the two colors it.
const TYPES = new Set([
	"bigint",
	"bigserial",
	"bit",
	"bool",
	"boolean",
	"box",
	"bytea",
	"char",
	"character",
	"cidr",
	"circle",
	"date",
	"daterange",
	"decimal",
	"double",
	"float",
	"float4",
	"float8",
	"inet",
	"int",
	"int2",
	"int4",
	"int4range",
	"int8",
	"int8range",
	"integer",
	"interval",
	"json",
	"jsonb",
	"jsonpath",
	"line",
	"lseg",
	"macaddr",
	"macaddr8",
	"money",
	"numeric",
	"numrange",
	"path",
	"point",
	"polygon",
	"precision",
	"real",
	"record",
	"regclass",
	"regtype",
	"serial",
	"serial2",
	"serial4",
	"serial8",
	"smallint",
	"smallserial",
	"text",
	"time",
	"timestamp",
	"timestamptz",
	"timetz",
	"tsquery",
	"tsrange",
	"tstzrange",
	"tsvector",
	"uuid",
	"varbit",
	"varchar",
	"varying",
	"void",
	"xml",
]);

const KEYWORDS = new Set([
	"add",
	"after",
	"all",
	"alter",
	"always",
	"analyze",
	"and",
	"any",
	"array",
	"as",
	"asc",
	"asymmetric",
	"at",
	"authorization",
	"before",
	"begin",
	"between",
	"both",
	"by",
	"cascade",
	"case",
	"cast",
	"check",
	"collate",
	"column",
	"commit",
	"concurrently",
	"conflict",
	"constraint",
	"create",
	"cross",
	"cube",
	"current_catalog",
	"current_date",
	"current_role",
	"current_schema",
	"current_time",
	"current_timestamp",
	"current_user",
	"database",
	"declare",
	"default",
	"deferrable",
	"deferred",
	"delete",
	"desc",
	"distinct",
	"do",
	"domain",
	"drop",
	"each",
	"else",
	"end",
	"enum",
	"escape",
	"except",
	"exclude",
	"execute",
	"exists",
	"explain",
	"extension",
	"fetch",
	"filter",
	"first",
	"following",
	"for",
	"foreign",
	"from",
	"full",
	"function",
	"generated",
	"grant",
	"group",
	"grouping",
	"having",
	"identity",
	"if",
	"ilike",
	"immediate",
	"in",
	"include",
	"index",
	"initially",
	"inner",
	"insert",
	"intersect",
	"into",
	"is",
	"isnull",
	"join",
	"key",
	"language",
	"last",
	"lateral",
	"leading",
	"left",
	"like",
	"limit",
	"localtime",
	"localtimestamp",
	"lock",
	"locked",
	"materialized",
	"matched",
	"merge",
	"natural",
	"next",
	"no",
	"not",
	"nothing",
	"notnull",
	"nowait",
	"nulls",
	"of",
	"offset",
	"on",
	"only",
	"or",
	"order",
	"ordinality",
	"outer",
	"over",
	"overlaps",
	"overriding",
	"partition",
	"placing",
	"preceding",
	"primary",
	"procedure",
	"range",
	"recursive",
	"references",
	"release",
	"rename",
	"replace",
	"restrict",
	"returning",
	"returns",
	"revoke",
	"right",
	"rollback",
	"rollup",
	"row",
	"rows",
	"savepoint",
	"schema",
	"select",
	"sequence",
	"session_user",
	"set",
	"sets",
	"share",
	"similar",
	"skip",
	"some",
	"stored",
	"symmetric",
	"system_user",
	"table",
	"tablesample",
	"temp",
	"temporary",
	"then",
	"ties",
	"to",
	"trailing",
	"transaction",
	"trigger",
	"truncate",
	"unbounded",
	"union",
	"unique",
	"unlogged",
	"update",
	"user",
	"using",
	"values",
	"variadic",
	"verbose",
	"view",
	"when",
	"where",
	"window",
	"with",
	"within",
	"without",
	"zone",
	"true",
	"false",
	"null",
]);

const WORD = /[A-Za-z_][\w$]*/y;
const NUMBER =
	/(?:0[xX][0-9A-Fa-f_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)(?![\w$])/y;
const OPERATOR = /[-+*/<>=~!@#%^&|?]+/y;
const DOLLAR_TAG = /\$([A-Za-z_]\w*)?\$/y;
const PARAM = /\$\d+/y;
const NAMED = /:[A-Za-z_][\w$]*/y;
const SLOT = /\{[A-Za-z_][\w$]*\}/y;
const STRING_PREFIX = /(?:[eEbBxXnN]|[uU]&)'/y;

const at = (re: RegExp, s: string, i: number): string | null => {
	re.lastIndex = i;
	return re.exec(s)?.[0] ?? null;
};

/** Splits SQL text into the tokens worth coloring; punctuation is left out. */
export function lex(s: string): Token[] {
	const out: Token[] = [];
	const push = (start: number, end: number, kind: TokenKind): void => {
		out.push({ start, end, kind });
	};
	let i = 0;
	let afterCast = false;
	while (i < s.length) {
		const c = s[i]!;
		if (c === " " || c === "\t" || c === "\n" || c === "\r") {
			i++;
			continue;
		}
		const cast = afterCast;
		afterCast = false;
		if (s.startsWith("--", i)) {
			const nl = s.indexOf("\n", i);
			const end = nl < 0 ? s.length : nl;
			push(i, end, "comment");
			i = end;
			continue;
		}
		if (s.startsWith("/*", i)) {
			let depth = 0;
			let j = i;
			while (j < s.length) {
				if (s.startsWith("/*", j)) {
					depth++;
					j += 2;
				} else if (s.startsWith("*/", j)) {
					j += 2;
					if (--depth === 0) break;
				} else j++;
			}
			push(i, j, "comment");
			i = j;
			continue;
		}
		const prefix = at(STRING_PREFIX, s, i);
		if (c === "'" || prefix) {
			const end = quoted(s, i + (prefix ? prefix.length : 1), "'");
			push(i, end, "string");
			i = end;
			continue;
		}
		if (c === '"') {
			const end = quoted(s, i + 1, '"');
			push(i, end, "variable");
			i = end;
			continue;
		}
		if (c === "$") {
			const param = at(PARAM, s, i);
			if (param) {
				push(i, i + param.length, "parameter");
				i += param.length;
				continue;
			}
			const tag = at(DOLLAR_TAG, s, i);
			if (tag) {
				const close = s.indexOf(tag, i + tag.length);
				const end = close < 0 ? s.length : close + tag.length;
				push(i, end, "string");
				i = end;
				continue;
			}
		}
		if (s.startsWith("::", i)) {
			push(i, i + 2, "operator");
			i += 2;
			afterCast = true;
			continue;
		}
		if (c === ":" && !/[:\w$]/.test(s[i - 1] ?? "")) {
			const named = at(NAMED, s, i);
			if (named) {
				push(i, i + named.length, "parameter");
				i += named.length;
				continue;
			}
		}
		if (c === "{") {
			const slot = at(SLOT, s, i);
			if (slot) {
				push(i, i + slot.length, "variable");
				i += slot.length;
				continue;
			}
		}
		if (!/[\w$]/.test(s[i - 1] ?? "")) {
			const n = at(NUMBER, s, i);
			if (n) {
				push(i, i + n.length, "number");
				i += n.length;
				continue;
			}
		}
		const word = at(WORD, s, i);
		if (word) {
			const lower = word.toLowerCase();
			const end = i + word.length;
			push(
				i,
				end,
				cast || TYPES.has(lower)
					? "type"
					: KEYWORDS.has(lower)
						? "keyword"
						: s[end] === "("
							? "function"
							: "variable",
			);
			i = end;
			continue;
		}
		const op = at(OPERATOR, s, i);
		if (op) {
			push(i, i + op.length, "operator");
			i += op.length;
			continue;
		}
		i++;
	}
	return out;
}

// The end of a quoted run opened before `from`; a doubled quote stays inside.
function quoted(s: string, from: number, q: string): number {
	let j = from;
	for (;;) {
		const k = s.indexOf(q, j);
		if (k < 0) return s.length;
		if (s[k + 1] !== q) return k + 1;
		j = k + 2;
	}
}
