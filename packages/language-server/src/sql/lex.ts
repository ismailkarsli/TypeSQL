/** How a dialect splits SQL text into tokens. */
export interface Lexis {
	readonly lineComment: RegExp;
	readonly nestedComments: boolean;
	/** A string's opening quote and any prefix; group 1 is the quote. */
	readonly string: RegExp;
	/** Whether a backslash escapes the next character in the string `prefix` opens. */
	readonly backslashes: (prefix: string) => boolean;
	/** A quoted name's opening, and the character that closes each opening quote. */
	readonly quotedName: RegExp;
	readonly closes: Readonly<Record<string, string>>;
	/** PostgreSQL's $tag$…$tag$ strings. */
	readonly dollarStrings: boolean;
	/** PostgreSQL's `::` cast. */
	readonly cast: boolean;
	/** Parameters besides `:name`. */
	readonly parameter: RegExp;
	readonly variable: RegExp | null;
	readonly operator: RegExp;
}

type Lexeme =
	| "word"
	| "quoted"
	| "string"
	| "comment"
	| "number"
	| "parameter"
	| "variable"
	/** A `${…}` hole, which the literal's text pads as `$0`. */
	| "hole"
	| "cast"
	| "operator"
	| "punctuation";

export interface Token {
	readonly kind: Lexeme;
	readonly start: number;
	readonly end: number;
	/** A comment, string or quoted name with no closing delimiter, so its end is still inside it. */
	readonly open: boolean;
	/** A string's escapes, a doubled quote or a backslash and what it escapes, as [start, end). */
	readonly escapes?: readonly (readonly [number, number])[];
	/** A quoted name's name. */
	readonly name?: string;
}

const NON_ASCII = "\\u0080-\\uffff";
const NAME_START = `A-Za-z_${NON_ASCII}`;
const NAME_PART = `\\w$${NON_ASCII}`;
const NAME = `[${NAME_START}][${NAME_PART}]*`;
const DIGITS =
	"0[xX][0-9A-Fa-f_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\\d[\\d_]*(?:\\.[\\d_]*)?|\\.\\d[\\d_]*)(?:[eE][+-]?\\d+)?";
// The name of a $tag$, which has no $.
const TAG = `[${NAME_START}][\\w${NON_ASCII}]*`;
const PG_STRING_PREFIX = "(?:[eEbBxXnN]|[uU]&)?";
// PostgreSQL's operator characters, but the backtick.
const PG_OPERATOR = "+\\-*/<>=~!@#%^&|?";

const WORD = new RegExp(NAME, "y");
const NUMBER = new RegExp(`(?:${DIGITS})[${NAME_PART}]*`, "y");
const NAMED = new RegExp(`(?<![:${NAME_PART}]):${NAME}`, "y");
const HOLE = /\$0(?![0-9])/y;
const CAST = /::/y;
const DOLLAR_TAG = new RegExp(`\\$(?:${TAG})?\\$`, "y");

const postgres: Lexis = {
	lineComment: /--[^\n\r]*/y,
	nestedComments: true,
	string: new RegExp(`${PG_STRING_PREFIX}(')`, "y"),
	backslashes: (prefix) => prefix === "e" || prefix === "E",
	quotedName: /(?:[uU]&)?(")/y,
	closes: { '"': '"' },
	dollarStrings: true,
	cast: true,
	parameter: /\$\d+/y,
	variable: null,
	operator: new RegExp(`(?:(?!--|/\\*)[${PG_OPERATOR}\`])+`, "y"),
};

/**
 * PostgreSQL's tokens as regular expression sources, for the VS Code
 * grammar, which reads every dialect as PostgreSQL. Its operators leave out
 * the backtick, which it reads as MySQL's and SQLite's name quote.
 */
export const GRAMMAR_LEXIS = {
	name: NAME,
	number: `(?<![${NAME_PART}])(?:${DIGITS})(?![${NAME_PART}])`,
	parameter: postgres.parameter.source,
	/** `:name`, with the colon and the name as groups 1 and 2. */
	named: `(?<![:${NAME_PART}])(:)(${NAME})`,
	/** `::type`, with the operator and the type as groups 1 and 2. */
	cast: `(${CAST.source})\\s*(${NAME})`,
	operator: `(?:(?!--|/\\*)[${PG_OPERATOR}])+`,
	stringPrefix: PG_STRING_PREFIX,
	/** A `$tag$`, with its name as group 1. */
	dollarTag: `\\$(${TAG}|)\\$`,
} as const;

const sqlite: Lexis = {
	lineComment: /--[^\n\r]*/y,
	nestedComments: false,
	string: /[xX]?(')/y,
	backslashes: () => false,
	quotedName: /(["`[])/y,
	closes: { '"': '"', "`": "`", "[": "]" },
	dollarStrings: false,
	cast: false,
	parameter: /\?\d*|[@$][\w$\u0080-￿]+/y,
	variable: null,
	operator: /(?:(?!--|\/\*)[-+*/%<>=!~&|])+/y,
};

// MySQL and MariaDB: `-- ` needs a space after the dashes, `#` starts a
// comment, '…' and "…" are strings with backslash escapes (after an n, x, b
// or _charset prefix), and @name and @@name are variables.
const mysql: Lexis = {
	lineComment: /(?:#|--(?=\s|$))[^\n\r]*/y,
	nestedComments: false,
	string: /(?:[nNxXbB]|_[A-Za-z0-9_]+)?(['"])/y,
	backslashes: () => true,
	quotedName: /(`)/y,
	closes: { "`": "`" },
	dollarStrings: false,
	cast: false,
	parameter: /\$\d+/y,
	variable: /@@?(?:[A-Za-z0-9_$.\u0080-￿]+|`(?:[^`]|``)*`?)?/y,
	operator: /(?:(?!--\s|--$|\/\*)[-+*/<>=~!%^&|?:])+/y,
};

export const LEXIS = { postgres, sqlite, mysql } as const;

type Rule = (text: string, i: number, lexis: Lexis) => Token | null;

const endOf = (re: RegExp | null, text: string, i: number): number => {
	if (!re) return -1;
	re.lastIndex = i;
	return re.test(text) ? re.lastIndex : -1;
};

const rule =
	(kind: Lexeme, re: (lexis: Lexis) => RegExp | null, open = false): Rule =>
	(text, i, lexis) => {
		const end = endOf(re(lexis), text, i);
		return end < 0 ? null : { kind, start: i, end, open };
	};

const RULES: readonly Rule[] = [
	rule("comment", (l) => l.lineComment, true),
	(text, i, lexis) => {
		if (!text.startsWith("/*", i)) return null;
		const [end, closed] = lexis.nestedComments
			? nestedComment(text, i)
			: flatComment(text, i);
		return { kind: "comment", start: i, end, open: !closed };
	},
	rule("hole", () => HOLE),
	(text, i, lexis) => {
		lexis.string.lastIndex = i;
		const m = lexis.string.exec(text);
		if (!m) return null;
		const backslashes = lexis.backslashes(m[0].slice(0, -1));
		return stringAt(text, i, lexis.string.lastIndex, m[1]!, backslashes);
	},
	(text, i, lexis) => {
		const body = lexis.dollarStrings ? endOf(DOLLAR_TAG, text, i) : -1;
		if (body < 0) return null;
		const tag = text.slice(i, body);
		const close = text.indexOf(tag, body);
		return close < 0
			? { kind: "string", start: i, end: text.length, open: true }
			: { kind: "string", start: i, end: close + tag.length, open: false };
	},
	(text, i, lexis) => {
		lexis.quotedName.lastIndex = i;
		const m = lexis.quotedName.exec(text);
		if (!m) return null;
		return quotedAt(text, i, lexis.quotedName.lastIndex, lexis.closes[m[1]!]!);
	},
	rule("parameter", (l) => l.parameter),
	// `:name`, but not the second colon of `::` or a colon right after a name.
	rule("parameter", () => NAMED),
	rule("variable", (l) => l.variable),
	rule("cast", (l) => (l.cast ? CAST : null)),
	rule("number", () => NUMBER),
	rule("word", () => WORD),
	rule("operator", (l) => l.operator),
];

/** Splits SQL text into tokens; whitespace is left out. */
export function lex(text: string, lexis: Lexis): Token[] {
	const out: Token[] = [];
	for (let i = 0; i < text.length; ) {
		if (/\s/.test(text[i]!)) {
			i++;
			continue;
		}
		let token: Token = {
			kind: "punctuation",
			start: i,
			end: i + 1,
			open: false,
		};
		for (const r of RULES) {
			const t = r(text, i, lexis);
			if (t) {
				token = t;
				break;
			}
		}
		out.push(token);
		i = token.end;
	}
	return out;
}

/**
 * The string from `start` whose body starts at `from`: a doubled quote, or
 * with `backslashes` a backslash, escapes the character after it.
 */
function stringAt(
	text: string,
	start: number,
	from: number,
	quote: string,
	backslashes: boolean,
): Token {
	const escapes: [number, number][] = [];
	for (let i = from; i < text.length; ) {
		const c = text[i];
		if ((backslashes && c === "\\") || (c === quote && text[i + 1] === quote)) {
			escapes.push([i, Math.min(i + 2, text.length)]);
			i += 2;
		} else if (c === quote)
			return { kind: "string", start, end: i + 1, open: false, escapes };
		else i++;
	}
	return { kind: "string", start, end: text.length, open: true, escapes };
}

/** The quoted name from `start` whose name starts at `from`; a doubled quote other than `]` is one. */
function quotedAt(
	text: string,
	start: number,
	from: number,
	close: string,
): Token {
	for (let i = from; i < text.length; ) {
		if (text[i] !== close) i++;
		else if (close !== "]" && text[i + 1] === close) i += 2;
		else {
			const name = text.slice(from, i).replaceAll(close + close, close);
			return { kind: "quoted", start, end: i + 1, open: false, name };
		}
	}
	const name = text.slice(from).replaceAll(close + close, close);
	return { kind: "quoted", start, end: text.length, open: true, name };
}

/** The end of the nested block comment at `i`, and whether it was closed. */
function nestedComment(s: string, i: number): [number, boolean] {
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

function flatComment(s: string, i: number): [number, boolean] {
	const end = s.indexOf("*/", i + 2);
	return end < 0 ? [s.length, false] : [end + 2, true];
}
