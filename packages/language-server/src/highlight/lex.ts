import { type Dialect, isMySql } from "../complete/call.js";

export type TokenKind =
	| "keyword"
	| "constant"
	| "type"
	| "function"
	| "number"
	| "string"
	| "escape"
	| "comment"
	| "operator"
	| "parameter"
	| "variable"
	| "punctuation";

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
]);

const CONSTANTS = new Set(["true", "false", "null"]);

// MySQL and MariaDB words on top of the lists above.
const MY_TYPES = new Set([
	"binary",
	"blob",
	"datetime",
	"dec",
	"enum",
	"fixed",
	"geometry",
	"geometrycollection",
	"inet4",
	"inet6",
	"linestring",
	"longblob",
	"longtext",
	"mediumblob",
	"mediumint",
	"mediumtext",
	"multilinestring",
	"multipoint",
	"multipolygon",
	"nchar",
	"nvarchar",
	"signed",
	"tinyblob",
	"tinyint",
	"tinytext",
	"unsigned",
	"varbinary",
	"vector",
	"year",
	"zerofill",
]);

const MY_KEYWORDS = new Set([
	"algorithm",
	"auto_increment",
	"change",
	"charset",
	"columns",
	"comment",
	"delayed",
	"describe",
	"distinctrow",
	"div",
	"dual",
	"duplicate",
	"engine",
	"force",
	"fulltext",
	"high_priority",
	"ignore",
	"invisible",
	"keys",
	"low_priority",
	"member",
	"mod",
	"mode",
	"modify",
	"nested",
	"quick",
	"regexp",
	"rlike",
	"separator",
	"show",
	"sounds",
	"spatial",
	"sql_big_result",
	"sql_buffer_result",
	"sql_calc_found_rows",
	"sql_no_cache",
	"sql_small_result",
	"straight_join",
	"tables",
	"unlock",
	"use",
	"virtual",
	"visible",
	"xor",
]);

const WORD = /[A-Za-z_][\w$]*/y;
const NUMBER =
	/(?:0[xX][0-9A-Fa-f_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)(?![\w$])/y;
const OPERATOR = /[-+*/<>=~!@#%^&|?]+/y;
const DOLLAR_TAG = /\$([A-Za-z_]\w*)?\$/y;
const PARAM = /\$\d+/y;
const NAMED = /:[A-Za-z_][\w$]*/y;
const STRING_PREFIX = /(?:[eEbBxXnN]|[uU]&)'/y;
const MY_STRING_PREFIX = /(?:[bBxXnN]|_[A-Za-z0-9_]+)['"]/y;
const MY_VARIABLE = /@@?(?:[A-Za-z0-9_$.]+|`(?:[^`]|``)*`?)?/y;

const at = (re: RegExp, s: string, i: number): string | null => {
	re.lastIndex = i;
	return re.exec(s)?.[0] ?? null;
};

/** The end of the nested block comment at `i`, and whether it was closed. */
export function blockComment(s: string, i: number): [number, boolean] {
	let depth = 0;
	for (let j = i; j < s.length; ) {
		if (s.startsWith("/*", j)) {
			depth++;
			j += 2;
		} else if (s.startsWith("*/", j)) {
			j += 2;
			if (--depth === 0) return [j, true];
		} else j++;
	}
	return [s.length, false];
}

/** Splits SQL text into tokens; whitespace is left out. */
export function lex(s: string, dialect: Dialect = "postgres"): Token[] {
	if (isMySql(dialect)) return lexMySql(s);
	const out: { start: number; end: number; kind: TokenKind }[] = [];
	const push = (start: number, end: number, kind: TokenKind): void => {
		if (end <= start) return;
		const last = out[out.length - 1];
		if (kind === "punctuation" && last?.kind === kind && last.end === start)
			last.end = end;
		else out.push({ start, end, kind });
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
		if (s.startsWith("--", i) || hashComment(s, i)) {
			const nl = s.indexOf("\n", i);
			const end = nl < 0 ? s.length : nl;
			push(i, end, "comment");
			i = end;
			continue;
		}
		if (s.startsWith("/*", i)) {
			const [end] = blockComment(s, i);
			push(i, end, "comment");
			i = end;
			continue;
		}
		const prefix = at(STRING_PREFIX, s, i);
		if (c === "'" || prefix) {
			const end = quoted(s, i + (prefix ? prefix.length : 1), "'");
			// A quote before the end is the first of a doubled quote.
			let from = i;
			for (let j = i + (prefix ? prefix.length : 1); j < end - 1; j++)
				if (s[j] === "'") {
					push(from, j, "string");
					push(j, j + 2, "escape");
					from = ++j + 1;
				}
			push(from, end, "string");
			i = end;
			continue;
		}
		if (c === '"' || c === "`") {
			const end = quoted(s, i + 1, c);
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
					: CONSTANTS.has(lower)
						? "constant"
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
		push(i, i + 1, "punctuation");
		i++;
	}
	return out;
}

// A # that starts a line, as the grammar reads MySQL's comments, but not
// PostgreSQL's #>, #>>, #- and ## operators.
const hashComment = (s: string, i: number): boolean => {
	if (s[i] !== "#" || /[#>-]/.test(s[i + 1] ?? "")) return false;
	const nl = s.lastIndexOf("\n", i - 1);
	return nl >= 0 && /^\s*$/.test(s.slice(nl + 1, i));
};

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

/**
 * MySQL and MariaDB: `#` and `-- ` comments, block comments that don't nest,
 * '…' and "…" strings with backslash escapes, `…` names, @ and @@ variables.
 */
function lexMySql(s: string): Token[] {
	const out: { start: number; end: number; kind: TokenKind }[] = [];
	const push = (start: number, end: number, kind: TokenKind): void => {
		if (end <= start) return;
		const last = out[out.length - 1];
		if (kind === "punctuation" && last?.kind === kind && last.end === start)
			last.end = end;
		else out.push({ start, end, kind });
	};
	let i = 0;
	while (i < s.length) {
		const c = s[i]!;
		if (c === " " || c === "\t" || c === "\n" || c === "\r") {
			i++;
			continue;
		}
		if (c === "#" || (s.startsWith("--", i) && /^\s?$/.test(s[i + 2] ?? ""))) {
			const nl = s.indexOf("\n", i);
			const end = nl < 0 ? s.length : nl;
			push(i, end, "comment");
			i = end;
			continue;
		}
		if (s.startsWith("/*", i)) {
			const close = s.indexOf("*/", i + 2);
			const end = close < 0 ? s.length : close + 2;
			push(i, end, "comment");
			i = end;
			continue;
		}
		const prefix = at(MY_STRING_PREFIX, s, i);
		if (c === "'" || c === '"' || prefix) {
			const open = prefix ? i + prefix.length - 1 : i;
			const q = s[open]!;
			let from = i;
			let j = open + 1;
			for (; j < s.length; j++) {
				const d = s[j]!;
				if (d === "\\" || (d === q && s[j + 1] === q)) {
					push(from, j, "string");
					push(j, Math.min(j + 2, s.length), "escape");
					from = ++j + 1;
				} else if (d === q) break;
			}
			const end = Math.min(j + 1, s.length);
			push(from, end, "string");
			i = end;
			continue;
		}
		if (c === "`") {
			const end = quoted(s, i + 1, "`");
			push(i, end, "variable");
			i = end;
			continue;
		}
		if (c === "@") {
			const v = at(MY_VARIABLE, s, i)!;
			push(i, i + v.length, "variable");
			i += v.length;
			continue;
		}
		if (c === "$") {
			const param = at(PARAM, s, i);
			if (param) {
				push(i, i + param.length, "parameter");
				i += param.length;
				continue;
			}
		}
		if (c === ":" && !/[:\w$]/.test(s[i - 1] ?? "")) {
			const named = at(NAMED, s, i);
			if (named) {
				push(i, i + named.length, "parameter");
				i += named.length;
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
				TYPES.has(lower) || MY_TYPES.has(lower)
					? "type"
					: CONSTANTS.has(lower)
						? "constant"
						: KEYWORDS.has(lower) || MY_KEYWORDS.has(lower)
							? "keyword"
							: s[end] === "("
								? "function"
								: "variable",
			);
			i = end;
			continue;
		}
		const op = at(MY_OPERATOR, s, i);
		if (op) {
			push(i, i + op.length, "operator");
			i += op.length;
			continue;
		}
		push(i, i + 1, "punctuation");
		i++;
	}
	return out;
}

const MY_OPERATOR = /(?:(?!--\s|--$|\/\*)[-+*/<>=~!%^&|?:])+/y;
