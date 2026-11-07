import {
	type Analysis,
	analyze,
	type FormatOptions,
	formatSql,
	type HoleSource,
	keepHoles,
	type Position,
	recased,
	type SourceEdit,
	type SqlText,
	spacing,
} from "./format.js";

/** The column a line of SQL ends at by default. */
export const DEFAULT_WIDTH = 80;

/**
 * A SQL string literal, formatted, as an edit of its source. The SQL goes
 * on one line if it fits within `width`, and otherwise on a clause per line,
 * with an item or condition per line in a clause that is still too long.
 * SQL that leaves one line goes into a template literal, so the edit spans
 * the literal's quotes. SQL that can't be laid out, as an unaliased select
 * item written over lines in SQLite, MySQL or MariaDB, keeps its line breaks
 * as `formatSql` does.
 *
 * A fragment keeps the whitespace at its edges, which separates it from what
 * it is spliced next to: one space on one line, a line break over lines.
 * Each `${…}` hole is measured as `hole(start, end)` gives it and written as
 * `hole(start, end, position)` gives it at its position in the result, so a
 * literal in it can be laid out where it ends up.
 */
export function formatLiteral(
	source: string,
	sql: SqlText,
	options: FormatOptions,
	hole: HoleSource = keepHoles(source),
): SourceEdit {
	const edit = layoutLiteral(source, sql, options, hole);
	if (edit) return edit;
	return {
		start: sql.start,
		end: sql.end,
		text: formatSql(source, sql, options, hole),
	};
}

/** The literal laid out, quotes and all, or null if it keeps its line breaks. */
function layoutLiteral(
	source: string,
	sql: SqlText,
	options: FormatOptions,
	hole: HoleSource,
): SourceEdit | null {
	const quote = source[sql.start - 1];
	if (
		(quote !== '"' && quote !== "'" && quote !== "`") ||
		source[sql.end] !== quote
	)
		return null;
	const analysis = analyze(sql, options);
	const first = analysis.sig[0];
	// A text that is all one unaliased select item keeps its text.
	if (first === undefined || analysis.ranges[0]?.[0] === first.start)
		return null;
	const read = unitsOf(source, sql, analysis, options, hole);
	if (read === null) return null;
	const doc = new Builder(read.units).build();

	const width = options.width ?? DEFAULT_WIDTH;
	const { column, indent: callIndent } =
		options.position ?? positionOf(source, sql.start - 1);
	// A fragment's whitespace at its edges separates it from its neighbours.
	const lead = !options.fragment || read.leading !== "";
	const trail = !options.fragment || read.trailing !== "";
	const flat = breaks(doc) ? null : flatten(doc);
	if (flat !== null) {
		const text = `${options.fragment && lead ? " " : ""}${flat}${options.fragment && trail ? " " : ""}`;
		if (column + columns(text) + 2 <= width)
			return {
				start: sql.start - 1,
				end: sql.end + 1,
				text: quote + text + quote,
			};
	}

	// A template literal in place keeps the indentation it is written with;
	// one in a hole is indented from where it ends up.
	const keep = quote === "`" && options.position === undefined;
	const written = keep ? lastLine(read.leading) : null;
	const unit = indentUnit(source, written || callIndent);
	// SQL that starts after the backtick continues at its line's indentation.
	const base = written ?? (lead ? callIndent + unit : callIndent);
	const closing = (keep ? lastLine(read.trailing) : null) ?? callIndent;
	const printed = print(forceBreak(doc), {
		width,
		base,
		unit,
		// Without a line break after the backtick, the SQL starts on its line.
		first: lead
			? { text: base, column: columns(base), indent: base }
			: { text: "", column: column + 1, indent: callIndent },
		hole,
	});
	const content = `${lead ? "\n" : ""}${printed}${trail ? `\n${closing}` : ""}`;
	return {
		start: sql.start - 1,
		end: sql.end + 1,
		text: `\`${quote === "`" ? content : toTemplate(content, quote)}\``,
	};
}

/** Where `text` ends when it is written at `position`. */
export function advance(position: Position, text: string): Position {
	const at = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r"));
	if (at < 0)
		return { column: position.column + columns(text), indent: position.indent };
	const line = text.slice(at + 1);
	return { column: columns(line), indent: /^[ \t]*/.exec(line)![0] };
}

/** The column of `source` at `offset` and the indentation of its line. */
function positionOf(source: string, offset: number): Position {
	const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
	const before = source.slice(lineStart, offset);
	return { column: columns(before), indent: /^[ \t]*/.exec(before)![0] };
}

/** The indentation after a whitespace's last line break, if it has one. */
function lastLine(space: string): string | null {
	const at = Math.max(space.lastIndexOf("\n"), space.lastIndexOf("\r"));
	if (at < 0) return null;
	const indent = space.slice(at + 1);
	return /^[ \t]*$/.test(indent) ? indent : null;
}

/** One level of indentation: a tab or spaces, as `indent` or else the source indents. */
function indentUnit(source: string, indent: string) {
	const sample = indent || /^[ \t]+(?=\S)/m.exec(source)?.[0] || "";
	if (sample.startsWith("\t")) return "\t";
	return sample.length % 4 === 0 && sample.length > 0 ? "    " : "  ";
}

/** A string or quoted literal's source, as the source of a template literal. */
const toTemplate = (s: string, quote: string): string =>
	s.replace(/\\([\s\S])|`|\$(?=\{)/g, (m, escaped: string | undefined) =>
		escaped === undefined ? `\\${m}` : escaped === quote ? escaped : m,
	);

// Documents, laid out as in Philip Wadler's "A prettier printer": a group
// is printed on one line if it fits, and otherwise each of its lines breaks.

type Doc = string | readonly Doc[] | Group | Indent | Line | Hole;

interface Group {
	readonly kind: "group";
	readonly doc: Doc;
	/** It holds a line break that always breaks. */
	readonly breaks: boolean;
}

interface Indent {
	readonly kind: "indent";
	readonly doc: Doc;
}

interface Line {
	readonly kind: "line";
	/** The text in place of the line break on one line. */
	readonly flat: string;
	/** The break after a line comment, merged with the next one. */
	readonly hard: boolean;
}

/** A `${…}` hole: `text` as measured, and its source span to write it from. */
interface Hole {
	readonly kind: "hole";
	readonly text: string;
	readonly start: number;
	readonly end: number;
}

const LINE: Line = { kind: "line", flat: " ", hard: false };
const SOFTLINE: Line = { kind: "line", flat: "", hard: false };
const HARDLINE: Line = { kind: "line", flat: "", hard: true };

const isDocs = (d: Doc): d is readonly Doc[] => Array.isArray(d);

function breaks(d: Doc): boolean {
	if (typeof d === "string") return /[\r\n]/.test(d);
	if (!isDocs(d) && d.kind === "hole") return /[\r\n]/.test(d.text);
	if (isDocs(d)) return d.some(breaks);
	if (d.kind === "line") return d.hard;
	if (d.kind === "group") return d.breaks;
	return breaks(d.doc);
}

const group = (doc: Doc): Group => ({
	kind: "group",
	doc,
	breaks: breaks(doc),
});
const indent = (doc: Doc): Indent => ({ kind: "indent", doc });
const forceBreak = (d: Doc): Doc =>
	typeof d !== "string" && !isDocs(d) && d.kind === "group"
		? { ...d, breaks: true }
		: d;

function join(separator: Doc, docs: readonly Doc[]): Doc[] {
	return docs.flatMap((d, i) => (i === 0 ? [d] : [separator, d]));
}

function flatten(d: Doc): string {
	if (typeof d === "string") return d;
	if (isDocs(d)) return d.map(flatten).join("");
	if (d.kind === "line") return d.flat;
	if (d.kind === "hole") return d.text;
	return flatten(d.doc);
}

/** The width of a line's text: a tab counts as 4 columns. */
function columns(s: string) {
	let n = 0;
	for (const c of s) n += c === "\t" ? 4 : 1;
	return n;
}

interface Command {
	readonly level: number;
	readonly flat: boolean;
	readonly doc: Doc;
}

interface PrintOptions {
	readonly width: number;
	/** The indentation of each line after the first. */
	readonly base: string;
	readonly unit: string;
	/** The first line: its text so far, column and indentation. */
	readonly first: { readonly text: string } & Position;
	readonly hole: HoleSource;
}

/** `doc` on lines of `width` columns, each indented by `base` and `unit` per level. */
function print(doc: Doc, options: PrintOptions): string {
	const { width, base, unit, first, hole } = options;
	let out = first.text;
	let column = first.column;
	let lineIndent = first.indent;
	// A line comment needs a line break before the next text.
	let pending = false;
	const newline = (level: number) => {
		lineIndent = base + unit.repeat(level);
		out = `${out.replace(/[ \t]+$/, "")}\n${lineIndent}`;
		column = columns(lineIndent);
		pending = false;
	};
	const write = (s: string) => {
		out += s;
		const at = Math.max(s.lastIndexOf("\n"), s.lastIndexOf("\r"));
		column = at < 0 ? column + columns(s) : columns(s.slice(at + 1));
	};
	const stack: Command[] = [{ level: 0, flat: false, doc }];
	for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
		const { level, flat, doc: d } = c;
		if (typeof d === "string") {
			if (d === "" || (pending && d === " ")) continue;
			if (pending) newline(level);
			write(d);
		} else if (isDocs(d)) {
			for (let i = d.length - 1; i >= 0; i--)
				stack.push({ level, flat, doc: d[i]! });
		} else if (d.kind === "hole") {
			if (pending) newline(level);
			write(hole(d.start, d.end, { column, indent: lineIndent }));
		} else if (d.kind === "indent") {
			stack.push({ level: level + 1, flat, doc: d.doc });
		} else if (d.kind === "group") {
			const fit =
				flat ||
				(!d.breaks &&
					fits({ level, flat: true, doc: d.doc }, stack, width - column));
			stack.push({ level, flat: fit, doc: d.doc });
		} else if (d.hard) pending = true;
		else if (flat && !pending) {
			out += d.flat;
			column += d.flat.length;
		} else newline(level);
	}
	return out.replace(/[ \t]+$/, "");
}

/** Whether `next`, and what follows it up to a line break, fits in `width` columns. */
function fits(next: Command, rest: readonly Command[], width: number): boolean {
	const stack = [next];
	let r = rest.length;
	let left = width;
	while (left >= 0) {
		let c = stack.pop();
		if (c === undefined) {
			if (r === 0) return true;
			c = rest[--r]!;
		}
		const { level, flat, doc: c2 } = c;
		const d =
			!isDocs(c2) && typeof c2 !== "string" && c2.kind === "hole"
				? c2.text
				: c2;
		if (typeof d === "string") {
			const at = d.search(/[\r\n]/);
			if (at >= 0) return !flat && left >= columns(d.slice(0, at));
			left -= columns(d);
		} else if (isDocs(d)) {
			for (let i = d.length - 1; i >= 0; i--)
				stack.push({ level, flat, doc: d[i]! });
		} else if (d.kind === "indent") {
			stack.push({ level: level + 1, flat, doc: d.doc });
		} else if (d.kind === "group") {
			stack.push({ level, flat: flat && !d.breaks, doc: d.doc });
		} else if (d.hard || !flat) return !flat;
		else left -= d.flat.length;
	}
	return false;
}

// The SQL as units to lay out: a token, or the tokens of an unaliased
// select item that SQLite, MySQL and MariaDB name a column after.

interface Unit {
	/** Its source text, keywords recased. */
	readonly text: string;
	/** A keyword's word in lower case. */
	readonly word: string | undefined;
	/** A punctuation's or operator's text. */
	readonly punct: string | undefined;
	readonly comment: boolean;
	readonly lineComment: boolean;
	/** How to space it from the unit before it on a line. */
	readonly space: string;
	/** The source has a line break before it. */
	readonly newline: boolean;
	/** A `${…}` hole's source span. */
	readonly hole: readonly [number, number] | undefined;
}

/** Spaces and line breaks, escaped or not, between quotes that escapes split off a token. */
const GAP = /^(["'`]?)((?:[ \t\r\n]|\\[nrt])*)(\\?)$/;

function unitsOf(
	source: string,
	sql: SqlText,
	a: Analysis,
	options: FormatOptions,
	hole: HoleSource,
): { units: Unit[]; leading: string; trailing: string } | null {
	const { tokens } = a;
	const base = sql.start;
	const raw = (s: number, e: number) => source.slice(base + s, base + e);
	const upper = options.keywordCase === "upper";
	const lead = GAP.exec(raw(0, tokens[0]!.start));
	if (!lead || lead[1]) return null;
	const units: Unit[] = [];
	let glue = lead[3]!;
	let space = "";
	let newline = false;
	let trailing = "";
	for (let i = 0; i < tokens.length; ) {
		const t = tokens[i]!;
		const r = a.range[i]!;
		let j = i;
		let text: string;
		if (r >= 0) {
			while (a.range[j + 1] === r) j++;
			text = raw(t.start, tokens[j]!.end);
			// A column name written over lines keeps the lines.
			if (/[\r\n]/.test(text)) return null;
		} else if (t.kind === "hole") text = hole(base + t.start, base + t.end);
		else text = recased(raw(t.start, t.end), a.isKeyword(i), upper);
		const next = tokens[j + 1];
		const gap = GAP.exec(
			raw(tokens[j]!.end, next ? next.start : sql.end - base),
		);
		if (!gap) return null;
		const keyword = r < 0 && t.kind === "word" && a.isKeyword(i);
		const comment = r < 0 && t.kind === "comment";
		const prev = units.length > 0 ? tokens[i - 1] : undefined;
		units.push({
			text: glue + text + gap[1]!,
			word: keyword ? t.value : undefined,
			punct:
				r < 0 && (t.kind === "punctuation" || t.kind === "operator")
					? t.value
					: undefined,
			comment,
			lineComment: comment && !text.startsWith("/*"),
			space:
				prev === undefined
					? ""
					: spacing(prev, t, space, a.isBinary(i - 1) || a.isBinary(i)),
			newline,
			hole:
				r < 0 && t.kind === "hole" ? [base + t.start, base + t.end] : undefined,
		});
		glue = gap[3]!;
		space = gap[2] ? " " : "";
		newline = /[\r\n]|\\[nr]/.test(gap[2]!);
		if (next === undefined) {
			if (glue) return null;
			trailing = gap[2]!;
		}
		i = j + 1;
	}
	return { units, leading: lead[2]!, trailing };
}

const set = (words: string): ReadonlySet<string> => new Set(words.split(" "));

/** Words that start a statement in parentheses. */
const STATEMENTS = set("select with values insert update delete replace table");
/** Statements whose words decide which keywords start a clause. */
const VERBS = set("select insert update delete replace merge");
const JOINS = set("natural left right full inner cross outer");
const SELECT_HEAD = set("distinct all distinctrow");
const INSERT_HEAD = set("or replace ignore abort fail rollback into");
const SET_OP_HEAD = set("all distinct");
const LOCKS = set("update share no key");

/** A range of units: `[lo, hi)`. */
interface Span {
	readonly lo: number;
	readonly hi: number;
}

/** Builds the document of the units: statements, clauses, lists and conditions. */
class Builder {
	private readonly units: readonly Unit[];
	private readonly match: Int32Array;

	constructor(units: readonly Unit[]) {
		this.units = units;
		this.match = new Int32Array(units.length).fill(-1);
		const open: number[] = [];
		units.forEach((u, k) => {
			if (u.punct === "(") open.push(k);
			else if (u.punct === ")") {
				const o = open.pop();
				if (o === undefined) return;
				this.match[o] = k;
				this.match[k] = o;
			}
		});
	}

	build(): Doc {
		return this.statements({ lo: 0, hi: this.units.length });
	}

	/** The closing parenthesis of an opening one at `k` before `hi`, or -1. */
	private closing(k: number, hi: number): number {
		const c = this.match[k]!;
		return this.units[k]!.punct === "(" && c > k && c < hi ? c : -1;
	}

	/** Visit the units of `span` outside parentheses and CASE … END. */
	private topLevel(span: Span, visit: (k: number) => void): void {
		let cases = 0;
		for (let k = span.lo; k < span.hi; k++) {
			const close = this.closing(k, span.hi);
			if (close >= 0) {
				k = close;
				continue;
			}
			const word = this.units[k]!.word;
			if (word === "case") cases++;
			else if (word === "end" && cases > 0) cases--;
			else if (cases === 0) visit(k);
		}
	}

	/** The units on one line, as the source spaces them. */
	private inline({ lo, hi }: Span): Doc[] {
		const out: Doc[] = [];
		for (let k = lo; k < hi; k++) {
			const u = this.units[k]!;
			if (k > lo) out.push(u.space);
			const close = this.closing(k, hi);
			if (close >= 0) {
				out.push(this.parens(k, close));
				k = close;
				continue;
			}
			out.push(
				u.hole
					? { kind: "hole", text: u.text, start: u.hole[0], end: u.hole[1] }
					: u.text,
			);
			if (u.lineComment) out.push(HARDLINE);
		}
		return out;
	}

	private parens(open: number, close: number): Doc {
		const [o, c] = [this.units[open]!.text, this.units[close]!.text];
		if (close === open + 1) return [o, c];
		const inner = { lo: open + 1, hi: close };
		const doc = this.startsStatement(inner)
			? this.statements(inner)
			: this.body(inner, false);
		return group([o, indent([SOFTLINE, doc]), SOFTLINE, c]);
	}

	private firstUnit({ lo, hi }: Span): number {
		let k = lo;
		while (k < hi && this.units[k]!.comment) k++;
		return k;
	}

	private startsStatement(span: Span): boolean {
		const word = this.units[this.firstUnit(span)]?.word;
		return word !== undefined && STATEMENTS.has(word);
	}

	/** Comments after unit `k` on its line, and the unit after them. */
	private trailer(k: number, hi: number): [Doc[], number] {
		const out: Doc[] = [];
		let next = k + 1;
		for (; next < hi; next++) {
			const u = this.units[next]!;
			if (!u.comment || u.newline) break;
			out.push(u.space, u.text);
			if (u.lineComment) out.push(HARDLINE);
		}
		return [out, next];
	}

	private statements(span: Span): Doc {
		const semicolons: number[] = [];
		this.topLevel(span, (k) => {
			if (this.units[k]!.punct === ";") semicolons.push(k);
		});
		if (semicolons.length === 0) return this.statement(span);
		const docs: Doc[] = [];
		let lo = span.lo;
		for (const s of semicolons) {
			const [after, next] = this.trailer(s, span.hi);
			docs.push([
				lo < s ? this.statement({ lo, hi: s }) : "",
				this.units[s]!.text,
				...after,
			]);
			lo = next;
		}
		if (lo < span.hi) docs.push(this.statement({ lo, hi: span.hi }));
		return group(join(LINE, docs));
	}

	/** A statement: a clause per line if it doesn't fit on one. */
	private statement(span: Span): Doc {
		const first = this.firstUnit(span);
		const clauses: { start: number; head: number }[] = [];
		let verb: string | undefined;
		this.topLevel(span, (k) => {
			const last = clauses.at(-1);
			if (last && k < last.head) return;
			const head = this.head(k, first, verb, span.hi);
			if (head < 0) return;
			const word = this.units[k]!.word!;
			if (VERBS.has(word)) verb = word;
			clauses.push({ start: k, head });
		});
		const pieces: Doc[] = [];
		const start = clauses[0]?.start ?? span.hi;
		if (start > span.lo)
			pieces.push(this.body({ lo: span.lo, hi: start }, true));
		clauses.forEach(({ start, head }, i) => {
			pieces.push(this.clause(start, head, clauses[i + 1]?.start ?? span.hi));
		});
		return pieces.length === 1 ? pieces[0]! : group(join(LINE, pieces));
	}

	/**
	 * Where the head of a clause starting at `k` ends, as `LEFT JOIN` or
	 * `ORDER BY`, or -1 if no clause starts at `k`.
	 */
	private head(
		k: number,
		first: number,
		verb: string | undefined,
		hi: number,
	): number {
		const word = this.units[k]!.word;
		if (word === undefined) return -1;
		let p = k - 1;
		while (p > first && this.units[p]!.comment) p--;
		const prev = k > first ? this.units[p] : undefined;
		const before = prev?.word;
		const atStart = prev === undefined || prev.punct === ")";
		const at = (j: number) => (j < hi ? this.units[j]!.word : undefined);
		const take = (j: number, words: ReadonlySet<string>) => {
			while (words.has(at(j) ?? "")) j++;
			return j;
		};
		switch (word) {
			case "select":
				return take(k + 1, SELECT_HEAD);
			case "from":
				return before === "distinct" || before === "delete" ? -1 : k + 1;
			case "where":
			case "having":
			case "window":
			case "returning":
			case "limit":
			case "offset":
			case "fetch":
				return k + 1;
			case "group":
				return before !== "within" && at(k + 1) === "by" ? k + 2 : -1;
			case "order":
				return at(k + 1) === "by" ? k + 2 : -1;
			case "union":
			case "intersect":
			case "except":
				return take(k + 1, SET_OP_HEAD);
			case "values":
				return before === "default" ? -1 : k + 1;
			case "set":
				return (verb === "update" || verb === "insert") && before !== "update"
					? k + 1
					: -1;
			case "join":
			case "straight_join":
				return k + 1;
			case "left":
			case "right":
			case "full":
			case "inner":
			case "cross":
			case "natural": {
				const j = take(k, JOINS);
				return at(j) === "join" ? j + 1 : -1;
			}
			case "on":
				if (at(k + 1) === "conflict") return k + 2;
				if (at(k + 1) === "duplicate")
					return take(k + 1, set("duplicate key update"));
				return -1;
			case "do":
				if (at(k + 1) === "update") return at(k + 2) === "set" ? k + 3 : k + 2;
				return at(k + 1) === "nothing" ? k + 2 : -1;
			case "insert":
				return atStart ? take(k + 1, INSERT_HEAD) : -1;
			case "replace":
				return atStart ? take(k + 1, set("into")) : -1;
			case "update":
				return atStart
					? take(k + 1, set("or replace ignore abort fail rollback"))
					: -1;
			case "delete":
				return atStart ? take(k + 1, set("from")) : -1;
			case "with":
				return prev === undefined ? take(k + 1, set("recursive")) : -1;
			case "for":
				return verb === "select" && LOCKS.has(at(k + 1) ?? "") ? k + 1 : -1;
			default:
				return -1;
		}
	}

	/** A clause: its head, then its items or conditions, each on a line if they don't fit. */
	private clause(start: number, head: number, hi: number): Doc {
		const headDoc = this.inline({ lo: start, hi: head });
		if (head >= hi) return headDoc;
		const body = { lo: head, hi };
		const first = this.units[start]!.word;
		const last = this.units[head - 1]!.word;
		const conditions =
			first === "where" ||
			first === "having" ||
			last === "join" ||
			last === "straight_join";
		const items = this.items(body);
		if (items) return group([headDoc, indent([LINE, items])]);
		const parts = conditions ? this.conditions(body) : null;
		if (parts) {
			const [part, ...rest] = parts;
			return group([
				headDoc,
				" ",
				this.inline(part!),
				indent(rest.flatMap((p) => [LINE, this.inline(p)])),
			]);
		}
		return [headDoc, " ", this.inline(body)];
	}

	/** A text without a clause: in parentheses, at the start of a statement or a fragment. */
	private body(span: Span, top: boolean): Doc {
		const items = this.items(span);
		if (items) return top ? group(items) : items;
		const parts = this.conditions(span);
		if (!parts) return this.inline(span);
		const [part, ...rest] = parts;
		const lines = rest.flatMap((p) => [LINE, this.inline(p)]);
		return top
			? group([this.inline(part!), indent(lines)])
			: [this.inline(part!), ...lines];
	}

	/** The comma-separated items of `span`, a line apart, or null if it has one. */
	private items(span: Span): Doc[] | null {
		const commas: number[] = [];
		this.topLevel(span, (k) => {
			if (this.units[k]!.punct === ",") commas.push(k);
		});
		if (commas.length === 0) return null;
		const out: Doc[] = [];
		let lo = span.lo;
		for (const c of commas) {
			const [after, next] = this.trailer(c, span.hi);
			out.push(this.inline({ lo, hi: c }), this.units[c]!.text, ...after, LINE);
			lo = next;
		}
		out.push(this.inline({ lo, hi: span.hi }));
		return out;
	}

	/** The conditions of `span` that AND and OR join, or null if it has one. */
	private conditions(span: Span): Span[] | null {
		const joins: number[] = [];
		let between = false;
		this.topLevel(span, (k) => {
			const word = this.units[k]!.word;
			if (word === "between") between = true;
			else if (word === "and" && between) between = false;
			else if ((word === "and" || word === "or") && k > span.lo) joins.push(k);
		});
		if (joins.length === 0) return null;
		return [span.lo, ...joins].map((lo, i) => ({
			lo,
			hi: joins[i] ?? span.hi,
		}));
	}
}
