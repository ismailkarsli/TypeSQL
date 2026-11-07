import { DIALECTS, type Dialect, type DialectFacts } from "./dialect.js";
import { lex, type Token } from "./lex.js";
import { CONSTANTS, KEYWORDS, MY_KEYWORDS, MY_TYPES, TYPES } from "./words.js";

export type KeywordCase = "upper" | "lower";

export interface FormatOptions {
	readonly dialect: Dialect;
	readonly keywordCase: KeywordCase;
	/** The column a line of SQL ends at (default: 80); a tab counts as 4. */
	readonly width?: number | undefined;
	/**
	 * The text is a fragment, which keeps the whitespace at its edges: it
	 * separates the fragment from what it is spliced next to.
	 */
	readonly fragment?: boolean | undefined;
	/** Where the literal's opening quote ends up, if not where it is in the source. */
	readonly position?: Position | undefined;
}

/** A column, and the indentation of its line. */
export interface Position {
	readonly column: number;
	readonly indent: string;
}

/** A SQL string literal as `textOf` reads it from its source. */
export interface SqlText {
	/** The source offset of the first character after the opening quote. */
	readonly start: number;
	/** The source offset of the closing quote. */
	readonly end: number;
	/** The SQL, at the same offsets as the source, each `${…}` hole as `$0`. */
	readonly text: string;
	/** Each `${…}` hole, as source offsets `[start, end)`. */
	readonly holes: readonly (readonly [number, number])[];
}

/** Source text to put in place of `[start, end)`. */
export interface SourceEdit {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

/**
 * The source of the `${…}` hole at `[start, end)`: at `position` in the
 * result if given, and otherwise to measure on one line.
 */
export type HoleSource = (
	start: number,
	end: number,
	position?: Position,
) => string;

export const keepHoles =
	(source: string): HoleSource =>
	(s, e) =>
		source.slice(s, e);

/** The tokens of a literal, and what `formatSql` and `layoutLiteral` know about each. */
export interface Analysis {
	readonly tokens: readonly SqlToken[];
	/** The tokens but comments. */
	readonly sig: readonly SqlToken[];
	/** The verbatim range each token is in, or -1. */
	readonly range: Int32Array;
	readonly ranges: readonly (readonly [number, number])[];
	/** Whether token `i` is a binary operator or the operand of one. */
	readonly isBinary: (i: number) => boolean;
	/** Whether token `i` is a keyword to recase. */
	readonly isKeyword: (i: number) => boolean;
}

export function analyze(sql: SqlText, options: FormatOptions): Analysis {
	const d = DIALECTS[options.dialect];
	const tokens = tokensOf(sql, d);
	// The tokens but comments, and each token's index among them (or -1).
	const sig: SqlToken[] = [];
	const sigOf = new Int32Array(tokens.length).fill(-1);
	tokens.forEach((t, i) => {
		if (t.kind === "comment") return;
		sigOf[i] = sig.length;
		sig.push(t);
	});
	const { keyword, operand } = classify(sig, options.dialect, d);
	const binary = binaryOperators(sig, operand);
	const range = new Int32Array(tokens.length).fill(-1);
	let ranges: [number, number][] = [];
	if (namesAsWritten(options.dialect)) {
		ranges = outermost(verbatimRanges(sig, keyword));
		let r = 0;
		tokens.forEach((t, i) => {
			while (r < ranges.length && ranges[r]![1] < t.end) r++;
			const span = ranges[r];
			if (span && t.start >= span[0] && t.end <= span[1]) range[i] = r;
		});
	}
	return {
		tokens,
		sig,
		range,
		ranges,
		isBinary: (i) => {
			const s = sigOf[i]!;
			return s >= 0 && binary[s] === true;
		},
		isKeyword: (i) => {
			const s = sigOf[i]!;
			return range[i]! < 0 && s >= 0 && keyword[s] === true;
		},
	};
}

/** A word in the configured case if it is a keyword to recase. */
export const recased = (
	written: string,
	keyword: boolean,
	upper: boolean,
): string =>
	keyword && PLAIN_WORD.test(written)
		? upper
			? written.toUpperCase()
			: written.toLowerCase()
		: written;

/**
 * The SQL of a string literal, formatted: its keywords in `keywordCase` and
 * the whitespace between its tokens tidied, as source text to put between
 * its quotes. Line breaks, indentation, comments, strings and names stay as
 * written, and so does the text of an unaliased select item in SQLite, MySQL
 * and MariaDB, which name the column after it. `hole` gives the source of
 * each `${…}` hole to keep, by default as written.
 */
export function formatSql(
	source: string,
	sql: SqlText,
	options: FormatOptions,
	hole: HoleSource = keepHoles(source),
): string {
	const { tokens, range, isBinary, isKeyword } = analyze(sql, options);
	const base = sql.start;
	const last = tokens.at(-1);
	if (last === undefined) return source.slice(base, sql.end);
	const upper = options.keywordCase === "upper";

	let out = trimLineEnds(source.slice(base, base + tokens[0]!.start));
	tokens.forEach((t, i) => {
		const written = source.slice(base + t.start, base + t.end);
		if (t.kind === "hole") out += hole(base + t.start, base + t.end);
		else out += recased(written, isKeyword(i), upper);
		const next = tokens[i + 1];
		if (next === undefined) return;
		const between = source.slice(base + t.end, base + next.start);
		out +=
			range[i]! >= 0 && range[i] === range[i + 1]
				? between
				: spacing(t, next, between, isBinary(i) || isBinary(i + 1));
	});
	return out + trimLineEnds(source.slice(base + last.end, sql.end));
}

/** The whitespace `written` between tokens `a` and `b`, tidied. */
export function spacing(
	a: SqlToken,
	b: SqlToken,
	written: string,
	binary: boolean,
): string {
	// A string or name written with escaped quotes (\"Ada\") leaves its last
	// quote and the next one's backslash out of the tokens: they stay at the
	// edges. Anything else but spaces and line breaks, as an escaped \n, stays
	// as written.
	const edges = ESCAPED_QUOTES.exec(written);
	if (!edges) return written;
	const [, before = "", inner = "", after = ""] = edges;
	if (before || after) return before + spacing(a, b, inner, binary) + after;
	if (written.includes("\n") || written.includes("\r"))
		return trimLineEnds(written);
	const spaced = written.length > 0 ? " " : "";
	if (a.kind === "comment" || b.kind === "comment") return spaced;
	if (isPunctuation(b, ",") || isPunctuation(b, ";") || isPunctuation(b, ")"))
		return "";
	if (isPunctuation(a, "(")) return "";
	if (isPunctuation(a, ",") || isPunctuation(a, ";") || binary) return " ";
	return spaced;
}

/** A token: a word's `value` is in lower case, a punctuation's or operator's is its text. */
interface SqlToken {
	readonly kind: Token["kind"];
	readonly start: number;
	readonly end: number;
	readonly value: string;
}

const PLAIN_WORD = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const ESCAPED_QUOTES = /^(["'`]?)([ \t\r\n]*)(\\?)$/;

/** Strip the spaces before each line break. */
const trimLineEnds = (s: string): string =>
	s.includes("\n") ? s.replace(/[ \t]+(?=\r?\n)/g, "") : s;

const isPunctuation = (t: SqlToken | undefined, value: string): boolean =>
	t !== undefined &&
	(t.kind === "punctuation" || t.kind === "operator") &&
	t.value === value;

/** The literal's tokens, with each `${…}` hole spanning its source. */
function tokensOf(sql: SqlText, d: DialectFacts): SqlToken[] {
	const holes =
		sql.holes.length === 0
			? null
			: new Map(sql.holes.map(([s, e]) => [s - sql.start, e - sql.start]));
	const out: SqlToken[] = [];
	for (const t of lex(sql.text, d.lexis)) {
		let { kind, end } = t;
		if (kind === "hole") {
			const hole = holes?.get(t.start);
			if (hole === undefined) kind = "parameter";
			else end = hole;
		}
		const value =
			kind === "word"
				? sql.text.slice(t.start, t.end).toLowerCase()
				: kind === "punctuation" || kind === "operator"
					? sql.text.slice(t.start, t.end)
					: "";
		out.push({ kind, start: t.start, end, value });
	}
	return out;
}

/** The ranges that no other range contains, in order. */
function outermost(ranges: [number, number][]): [number, number][] {
	const out: [number, number][] = [];
	for (const r of ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
		const prev = out.at(-1);
		if (prev && r[1] <= prev[1]) continue;
		out.push(r);
	}
	return out;
}

/** SQLite, MySQL and MariaDB name an unaliased column after its text. */
const namesAsWritten = (dialect: Dialect): boolean => dialect !== "postgres";

const set = (words: string): ReadonlySet<string> => new Set(words.split(" "));

/** Words that start a statement, a script's or a subquery's. */
const STATEMENT = set(
	"select insert update delete values with merge replace create alter drop truncate begin start commit rollback end savepoint release explain analyze vacuum pragma show set lock unlock use describe call grant revoke reindex attach detach table",
);
const AFTER_OPEN = set(
	"select values with insert update delete partition order",
);
const AFTER_CLOSE = set("select insert update delete merge");

/** Values that are keywords: they end an operand. */
const VALUE_WORDS = set(
	`${CONSTANTS.join(" ")} unknown current_date current_time current_timestamp localtime localtimestamp current_user session_user current_role current_catalog current_schema system_user`,
);

/** Keywords that take a parenthesis, which no function shares a name with. */
const PAREN_SYNTAX = set(
	"in exists values cast over filter any some all array row using on check unique key conflict group as and or not when then else where select from with distinct lateral index primary foreign",
);

/** Keywords that follow another one. */
const FOLLOWS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	Object.entries({
		by: "order group partition cluster",
		key: "primary foreign unique duplicate no",
		into: "insert ignore replace",
		ignore: "insert",
		from: "delete distinct",
		conflict: "on",
		duplicate: "on",
		nothing: "do",
		update: "do key on for",
		delete: "on",
		set: "update",
		if: "table index view column schema sequence type concurrently",
		exists: "if not",
		not: "if is",
		null: "is not set",
		nulls: "asc desc",
		first: "nulls",
		last: "nulls",
		table: "create alter drop truncate temp temporary unlogged virtual",
		index: "create unique drop alter add",
		unique: "create add",
		view: "create replace materialized drop alter",
		materialized: "create drop",
		temp: "create",
		temporary: "create",
		unlogged: "create",
		virtual: "create",
		schema: "create drop alter",
		sequence: "create drop alter",
		extension: "create drop",
		trigger: "create drop",
		column: "add drop alter rename modify change",
		constraint: "add drop",
		replace: "or",
		recursive: "with",
		outer: "left right full",
		join: "left right full inner cross natural outer",
		default: "set drop by",
		values: "default",
		always: "generated",
		identity: "as",
		cascade: "delete update",
		restrict: "delete update",
		action: "no",
		no: "delete update for",
		between: "rows range groups",
		unbounded: "between and",
		preceding: "unbounded row",
		following: "unbounded row",
		current: "between and",
		row: "current",
		transaction: "begin start commit rollback end",
		work: "begin commit rollback",
		savepoint: "to release rollback",
		share: "for in",
		mode: "share",
		skip: "update share",
		locked: "skip",
		nowait: "update share",
		of: "update share member",
		ordinality: "with",
		ties: "with",
		group: "within",
		data: "set",
		type: "data",
		concurrently: "index",
		only: "from join update table",
	}).map(([w, prev]) => [w, set(prev)]),
);

/** Keywords that follow an operand, and what else must hold for one to be a keyword. */
type Check = (c: Context) => boolean;
const always: Check = () => true;
const nextWord =
	(...words: string[]): Check =>
	(c) =>
		words.includes(c.next?.kind === "word" ? c.next.value : "");
const nextIs =
	(...kinds: Token["kind"][]): Check =>
	(c) =>
		c.next !== undefined && kinds.includes(c.next.kind);
const inStatement =
	(...words: string[]): Check =>
	(c) =>
		words.includes(c.statement ?? "");
const AFTER_OPERAND: ReadonlyMap<string, Check> = new Map<string, Check>([
	...[
		"and or not is isnull notnull in like ilike glob regexp rlike match between collate",
		"asc desc from where group having order limit fetch for window union intersect except returning",
		"on using join inner left right full cross natural outer straight_join set values select when then else as",
		"div mod xor auto_increment autoincrement primary references default check unique constraint null",
	]
		.flatMap((s) => s.split(" "))
		.map((w): [string, Check] => [w, always]),
	["offset", (c) => c.next !== undefined && c.next.kind !== "word"],
	["nulls", nextWord("first", "last")],
	["escape", nextIs("string")],
	["comment", nextIs("string")],
	["member", nextWord("of")],
	["sounds", nextWord("like")],
	["within", nextWord("group")],
	["similar", nextWord("to")],
	["at", nextWord("time")],
	["do", nextWord("nothing", "update")],
	["filter", (c) => isPunctuation(c.next, "(")],
	["over", (c) => isPunctuation(c.next, "(")],
	["rows", nextWord("between", "unbounded", "current")],
	["range", nextWord("between", "unbounded", "current")],
	["groups", nextWord("between", "unbounded", "current")],
	["generated", nextWord("always", "by")],
	["stored", (c) => isPunctuation(c.prev, ")")],
	["virtual", (c) => isPunctuation(c.prev, ")")],
	["to", always],
	["engine", inStatement("create", "alter")],
	["after", inStatement("alter")],
	["first", inStatement("alter")],
	...["cascade", "restrict"].map((w): [string, Check] => [
		w,
		inStatement("drop", "truncate", "alter"),
	]),
]);

/** ALTER TABLE's actions, after its table or a comma. */
const ALTER_ACTIONS = set("add drop alter rename modify change");

/** After these keywords comes a name, unless it is one of the keywords listed. */
const NAME_AFTER: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	Object.entries({
		from: "only lateral",
		join: "lateral only",
		into: "temp temporary",
		table: "if only",
		index: "if concurrently on",
		view: "if",
		exists: "",
		references: "",
		truncate: "table only",
		on: "conflict duplicate delete update",
	}).map(([w, next]) => [w, set(next)]),
);

/** The words after AS that are keywords rather than an alias or a type. */
const AFTER_AS = set("select with values not materialized identity");

/** Keywords that open a select list's items. */
const SELECT_MODIFIERS = set(
	"distinct all distinctrow high_priority straight_join sql_small_result sql_big_result sql_buffer_result sql_no_cache sql_calc_found_rows",
);
/** Keywords that end a select list. */
const LIST_END = set(
	"from into where group having order limit offset fetch for window union intersect except returning lock",
);
/** Keywords a SQLite, MySQL or MariaDB text may start with to be formatted. */
const STARTS = set(
	"select with insert update delete replace values from where group having order limit offset join left right inner cross full natural straight_join on using set returning union intersect except window create alter drop truncate begin start commit rollback end savepoint release explain analyze pragma show",
);

/** Where a word is: first in a statement, after `(`, after `)`, or elsewhere. */
type Start = "statement" | "open" | "close" | null;

interface Context {
	readonly prev: SqlToken | undefined;
	readonly next: SqlToken | undefined;
	readonly statement: string | undefined;
}

const KEYWORD_WORDS = new Set<string>([
	...KEYWORDS,
	...CONSTANTS,
	...VALUE_WORDS,
	...AFTER_OPERAND.keys(),
	...ALTER_ACTIONS,
	...FOLLOWS.keys(),
]);
const MYSQL_WORDS = new Set<string>([...KEYWORD_WORDS, ...MY_KEYWORDS]);
const PG_TYPES: ReadonlySet<string> = new Set(TYPES);
const MY_TYPE_WORDS: ReadonlySet<string> = new Set([...TYPES, ...MY_TYPES]);

/**
 * Which of `sig`, the tokens but comments, are keywords to recase, and which
 * end an operand.
 */
function classify(sig: readonly SqlToken[], dialect: Dialect, d: DialectFacts) {
	const mysql = dialect === "mysql" || dialect === "mariadb";
	const words = mysql ? MYSQL_WORDS : KEYWORD_WORDS;
	const types = mysql ? MY_TYPE_WORDS : PG_TYPES;
	const keyword: boolean[] = sig.map(() => false);
	const operand: boolean[] = sig.map(() => false);
	// The first word of the statement at each parenthesis depth.
	const statements: (string | undefined)[] = [undefined];
	let start: Start = "statement";
	let cases = 0;
	const wordAt = (i: number): string | undefined =>
		sig[i]?.kind === "word" ? sig[i].value : undefined;
	const keywordAt = (i: number): string | undefined =>
		keyword[i] ? wordAt(i) : undefined;

	const decide = (i: number, w: string, start: Start): boolean => {
		const prev = sig[i - 1];
		const next = sig[i + 1];
		if (isPunctuation(prev, ".") || isPunctuation(next, ".")) return false;
		// AT TIME ZONE; a type's WITH TIME ZONE is part of the type.
		if (w === "time" && keywordAt(i - 1) === "at") return true;
		if (w === "zone" && wordAt(i - 1) === "time")
			return keywordAt(i - 2) === "at";
		if (!words.has(w) && !d.reserved.has(w)) return false;
		if (
			(w === "with" || w === "without") &&
			wordAt(i + 1) === "time" &&
			wordAt(i + 2) === "zone"
		)
			return false;
		if (types.has(w)) return false;
		const before = keywordAt(i - 1);
		if (before === "as" && !AFTER_AS.has(w)) return false;
		// A function call.
		if (isPunctuation(next, "(") && next!.start === sig[i]!.end)
			if (!PAREN_SYNTAX.has(w)) return false;
		if (d.reserved.has(w)) return true;
		if (VALUE_WORDS.has(w) && !isPunctuation(next, "(")) return true;
		if (before !== undefined && NAME_AFTER.get(before)?.has(w) === false)
			return false;
		if (
			(start === "statement" && STATEMENT.has(w)) ||
			(start === "open" && AFTER_OPEN.has(w)) ||
			(start === "close" && AFTER_CLOSE.has(w))
		)
			return true;
		if (before !== undefined && FOLLOWS.get(w)?.has(before)) {
			if (w !== "replace") return true;
			if (keywordAt(i - 2) === "create") return true;
		}
		const check = AFTER_OPERAND.get(w);
		if (
			check !== undefined &&
			i > 0 &&
			operand[i - 1] &&
			check({ prev, next, statement: statements.at(-1) })
		)
			return true;
		if (
			ALTER_ACTIONS.has(w) &&
			statements.at(-1) === "alter" &&
			(operand[i - 1] || isPunctuation(prev, ","))
		)
			return true;
		if (w === "end" && cases > 0) return true;
		return isPunctuation(next, "(") && PAREN_SYNTAX.has(w);
	};

	sig.forEach((t, i) => {
		const was = start;
		start = null;
		if (t.kind === "word") {
			const isKeyword = decide(i, t.value, was);
			keyword[i] = isKeyword;
			if (was === "statement" || was === "open")
				statements[statements.length - 1] = isKeyword ? t.value : undefined;
			// CASE … END is an operand.
			const closesCase = isKeyword && t.value === "end" && cases > 0;
			if (isKeyword && t.value === "case") cases++;
			if (closesCase) cases--;
			operand[i] = !isKeyword || VALUE_WORDS.has(t.value) || closesCase;
			return;
		}
		operand[i] = endsOperand(t, operand[i - 1] ?? false);
		if (isPunctuation(t, ";")) {
			start = "statement";
			statements[statements.length - 1] = undefined;
		} else if (isPunctuation(t, "(")) {
			start = "open";
			statements.push(undefined);
		} else if (isPunctuation(t, ")")) {
			start = "close";
			if (statements.length > 1) statements.pop();
		}
	});
	return { keyword, operand };
}

/** Whether a token other than a word ends an operand. */
function endsOperand(t: SqlToken, afterOperand: boolean): boolean {
	switch (t.kind) {
		case "number":
		case "string":
		case "quoted":
		case "parameter":
		case "variable":
		case "hole":
			return true;
		case "operator":
			// `SELECT *`, `t.*` and `count(*)`, not a product.
			return t.value === "*" && !afterOperand;
		case "punctuation":
			return t.value === ")" || t.value === "]";
		default:
			return false;
	}
}

/** Operators spaced as binary ones: a run the server reads the same with spaces around it. */
const BINARY =
	/^(?:=|==|<>|!=|<=|>=|<|>|<=>|\|\||\+|-|\*|\/|%|->>?|#>>?|@>|<@|&&|:=|~\*?|!~\*?|~~\*?|!~~\*?)$/;

function binaryOperators(
	sig: readonly SqlToken[],
	operands: readonly boolean[],
): boolean[] {
	return sig.map((t, i) => {
		const next = sig[i + 1];
		return (
			t.kind === "operator" &&
			BINARY.test(t.value) &&
			(operands[i - 1] ?? false) &&
			next !== undefined &&
			(next.kind !== "punctuation" || next.value === "(") &&
			next.kind !== "comment"
		);
	});
}

/**
 * The text spans that SQLite, MySQL and MariaDB name a column after: each
 * select or RETURNING item without an AS alias. A text that starts with an
 * expression may be spliced into a select list, so all of it is kept.
 */
function verbatimRanges(
	sig: readonly SqlToken[],
	keyword: readonly boolean[],
): [number, number][] {
	const first = sig[0];
	if (first === undefined) return [];
	const firstWord = (i: number) =>
		sig[i]?.kind === "word" && keyword[i] ? sig[i].value : undefined;
	const statementStart =
		STARTS.has(firstWord(0) ?? "") ||
		(isPunctuation(first, "(") && STARTS.has(firstWord(1) ?? ""));
	if (!statementStart) return [[first.start, sig.at(-1)!.end]];
	const out: [number, number][] = [];
	sig.forEach((t, i) => {
		if (!keyword[i] || (t.value !== "select" && t.value !== "returning"))
			return;
		let j = i + 1;
		while (keyword[j] && SELECT_MODIFIERS.has(sig[j]!.value)) j++;
		let depth = 0;
		let itemStart = j;
		const item = (end: number) => {
			if (end < itemStart) return;
			const aliased =
				end - itemStart >= 2 &&
				(sig[end]!.kind === "quoted" ||
					(sig[end]!.kind === "word" && !keyword[end])) &&
				keyword[end - 1] &&
				sig[end - 1]!.value === "as";
			if (!aliased) out.push([sig[itemStart]!.start, sig[end]!.end]);
		};
		for (; j < sig.length; j++) {
			const u = sig[j]!;
			if (isPunctuation(u, "(")) depth++;
			else if (isPunctuation(u, ")")) {
				if (depth === 0) break;
				depth--;
			} else if (depth === 0) {
				if (isPunctuation(u, ";")) break;
				if (keyword[j] && LIST_END.has(u.value)) break;
				if (isPunctuation(u, ",")) {
					item(j - 1);
					itemStart = j + 1;
				}
			}
		}
		item(j - 1);
	});
	return out;
}
