import { blockComment } from "../highlight/lex.js";
import { type Dialect, isMySql } from "./call.js";

export interface RelRef {
	readonly schema: string | null;
	readonly name: string;
}

interface ScopeItem {
	readonly name: string;
	readonly rel: RelRef | null;
	readonly columns: readonly string[] | null;
}

interface Cte {
	readonly name: string;
	readonly columns: readonly string[] | null;
}

type Expect =
	| { readonly kind: "none" }
	| {
			readonly kind: "relation";
			readonly schema: string | null;
			readonly ctes: readonly Cte[];
			readonly used: readonly RelRef[];
	  }
	| {
			readonly kind: "column";
			readonly sources: readonly ScopeItem[];
			readonly aliases: readonly string[];
	  };

export interface Context {
	readonly expect: Expect;
	readonly from: number;
}

const NONE: Context["expect"] = { kind: "none" };

interface Tok {
	readonly k: "w" | "q" | "v" | "x" | "o";
	readonly v: string;
	readonly s: number;
	readonly e: number;
}

/** The tokens before the cursor, and whether the cursor is inside one. */
interface Lexed {
	readonly toks: Tok[];
	readonly inside: boolean;
}

const WORD = /[A-Za-z_\u0080-￿][A-Za-z0-9_$\u0080-￿]*/y;
const LINE_COMMENT = /--[^\n\r]*/y;
const STRING = /(?:([eE])|[bBxXnN]|[uU]&)?'/y;
const STRING_REST = /[^']*'?/y;
const ESCAPE_STRING_REST = /(?:[^'\\]|\\.|'')*'?/sy;
const QUOTED = /(?:[uU]&)?"((?:[^"]|"")*)"?/y;
const DOLLAR_TAG = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;
const NUMBER =
	/(?:[0-9]|[.$][0-9])[0-9._]*(?:[eE][-+])?[A-Za-z0-9_$\u0080-￿]*/y;
const NAMED_PARAM = /:[A-Za-z_][A-Za-z0-9_$\u0080-￿]*/y;
/** A `${…}` hole, which the call text pads as `$0`: a value or an interpolated fragment. */
const HOLE = /\$0(?![0-9])/y;
const PUNCTUATION = /::|./sy;
const OPERATOR = /(?:(?!--|\/\*)[+\-*/<>=~!@#%^&|`?])+/y;

// MySQL and MariaDB: `-- ` comments need a space after the dashes, `#` starts
// a comment, block comments don't nest, strings take '…' or "…" with backslash
// escapes (after an n, x, b or _charset prefix), names are quoted with
// backticks, and @name and @@name are variables.
const MY_LINE_COMMENT = /(?:#|--(?=\s|$))[^\n\r]*/y;
const MY_STRING = /(?:[nNxXbB]|_[A-Za-z0-9_]+)?(['"])/y;
const MY_SINGLE_REST = /(?:[^'\\]|\\.|'')*'?/sy;
const MY_DOUBLE_REST = /(?:[^"\\]|\\.|"")*"?/sy;
const MY_QUOTED = /`((?:[^`]|``)*)`?/y;
const MY_VARIABLE = /@@?(?:[A-Za-z0-9_$.\u0080-￿]+|`(?:[^`]|``)*`?)?/y;
const MY_OPERATOR = /(?:(?!--\s|--$|\/\*)[+\-*/<>=~!%^&|?])+/y;

const fold = (s: string): string => s.replace(/[A-Z]/g, (m) => m.toLowerCase());

function lex(text: string, offset: number, my: boolean): Lexed {
	const toks: Tok[] = [];
	let inside = false;
	const n = text.length;
	let i = 0;
	const take = (re: RegExp): RegExpExecArray | null => {
		re.lastIndex = i;
		const m = re.exec(text);
		if (m) i = re.lastIndex;
		return m;
	};
	const push = (k: Tok["k"], s: number, v = text.slice(s, i)): void => {
		toks.push({ k, v, s, e: i });
	};
	const value = (): boolean => {
		if (my) {
			const string = take(MY_STRING);
			if (string) take(string[1] === "'" ? MY_SINGLE_REST : MY_DOUBLE_REST);
			return !!(
				string ||
				take(MY_VARIABLE) ||
				take(NUMBER) ||
				take(NAMED_PARAM)
			);
		}
		const string = take(STRING);
		if (string) {
			take(string[1] ? ESCAPE_STRING_REST : STRING_REST);
			return true;
		}
		const tag = take(DOLLAR_TAG)?.[0];
		if (tag) {
			const end = text.indexOf(tag, i);
			i = end === -1 ? n : end + tag.length;
			return true;
		}
		return !!(take(NUMBER) || take(NAMED_PARAM));
	};
	const comment = (s: number, open: boolean): void => {
		if (s < offset && (offset < i || (open && offset === i))) inside = true;
	};
	while (i < n) {
		const s = i;
		if (/\s/.test(text[i]!)) {
			i++;
			continue;
		}
		if (take(my ? MY_LINE_COMMENT : LINE_COMMENT)) {
			comment(s, true);
			continue;
		}
		if (my && text.startsWith("/*", i)) {
			const end = text.indexOf("*/", i + 2);
			i = end === -1 ? n : end + 2;
			comment(s, end === -1);
			continue;
		}
		if (text.startsWith("/*", i)) {
			const [end, closed] = blockComment(text, i);
			i = end;
			comment(s, !closed);
			continue;
		}
		if (take(HOLE)) {
			push("x", s);
			continue;
		}
		if (value()) {
			push("v", s);
			continue;
		}
		const quoted = take(my ? MY_QUOTED : QUOTED);
		if (quoted) {
			const q = my ? "`" : '"';
			push("q", s, quoted[1]!.replaceAll(q + q, q));
			continue;
		}
		if (take(WORD)) push("w", s, fold(text.slice(s, i)));
		else {
			if (!take(my ? MY_OPERATOR : OPERATOR)) take(PUNCTUATION);
			push("o", s);
		}
	}
	return { toks, inside };
}

const QUERY_START: ReadonlySet<string | null> = new Set([
	"select",
	"with",
	"values",
	"table",
	"insert",
	"update",
	"delete",
	"merge",
]);
const NOT_ALIAS = new Set([
	"as",
	"on",
	"using",
	"join",
	"inner",
	"left",
	"right",
	"full",
	"outer",
	"cross",
	"natural",
	"where",
	"group",
	"order",
	"having",
	"window",
	"limit",
	"offset",
	"fetch",
	"for",
	"union",
	"intersect",
	"except",
	"returning",
	"values",
	"default",
	"select",
	"set",
	"when",
	"then",
	"lateral",
	"tablesample",
	"with",
	"into",
	"from",
	"and",
	"or",
	"not",
	"overriding",
	"do",
	"only",
	"table",
]);
// MySQL words after a table that aren't its alias: index hints, PARTITION,
// STRAIGHT_JOIN, and the modifiers of UPDATE before its table.
const MY_NOT_ALIAS = new Set([
	"use",
	"force",
	"ignore",
	"partition",
	"straight_join",
	"low_priority",
]);
const MY_BEFORE_TABLE = new Set(["ignore", "low_priority"]);
const BEFORE_EXPR = new Set([
	"select",
	"where",
	"on",
	"and",
	"or",
	"not",
	"by",
	"having",
	"returning",
	"when",
	"then",
	"else",
	"distinct",
	"case",
	"between",
	"in",
	"like",
	"ilike",
	"all",
	"any",
	"some",
	"exists",
	"array",
]);

type ParenKind = "target" | "names" | "values" | "expr";

interface Item {
	name: string;
	readonly rel: RelRef | null;
	columns: string[] | null;
}

interface Level {
	readonly parent: Level | null;
	readonly items: Item[];
	readonly ctes: Item[];
	outputs: string[] | null;
	target: Item | null;
}

interface At {
	readonly level: Level;
	readonly clause: string;
	readonly paren: ParenKind | null;
	opens?: ParenKind;
	relNext?: boolean;
}

interface Structure {
	readonly at: At[];
	readonly used: RelRef[];
}

/** A parsed level and the index of the token that ends it. */
interface LevelEnd {
	readonly level: Level;
	readonly i: number;
}

/** A token that can be a name: quoted, or a word that isn't a keyword after a table. */
const named = (t: Tok | undefined, my = false): boolean =>
	!!t &&
	(t.k === "q" ||
		(t.k === "w" && !NOT_ALIAS.has(t.v) && !(my && MY_NOT_ALIAS.has(t.v))));

function* levels(level: Level | null): Generator<Level> {
	for (let l = level; l; l = l.parent) yield l;
}

function structure(toks: readonly Tok[], my: boolean): Structure {
	const notAlias = (w: string): boolean =>
		NOT_ALIAS.has(w) || (my && MY_NOT_ALIAS.has(w));
	const beforeTable = (w: string | null): boolean =>
		w === "only" || w === "lateral" || (my && MY_BEFORE_TABLE.has(w ?? ""));
	const at: At[] = [];
	const used: RelRef[] = [];
	const word = (i: number): string | null =>
		toks[i]?.k === "w" ? toks[i]!.v : null;
	const is = (i: number, v: string): boolean =>
		toks[i]?.k === "o" && toks[i]!.v === v;

	const level = (i: number, parent: Level | null): LevelEnd => {
		const fresh = (): Level => ({
			parent,
			items: [],
			ctes: [],
			outputs: null,
			target: null,
		});
		const first = fresh();
		let lv = first;
		let clause = "";
		const parens: { kind: ParenKind; item: Item | null }[] = [];
		let expectRel = false;
		let targetNext = false;
		let after: Item | null = null;
		let aliased: boolean | undefined;
		let cteNext: boolean | undefined;
		let cte: Item | null = null;
		let out: Tok[] | null = null;

		const endOutput = (): void => {
			if (!out) return;
			const name = outputName(out);
			if (name !== null) lv.outputs!.push(name);
			out = null;
		};
		const visibleCte = (name: string): Item | undefined =>
			[...levels(lv)].flatMap((l) => l.ctes).find((x) => x.name === name);
		const addItem = (item: Item): void => {
			lv.items.push(item);
			if (item.rel) used.push(item.rel);
			if (targetNext) lv.target = item;
			targetNext = false;
			expectRel = false;
			after = item;
			aliased = false;
		};

		for (; i < toks.length; i++) {
			const t = toks[i]!;
			const here: At = {
				level: lv,
				clause,
				paren: parens.at(-1)?.kind ?? null,
			};
			at[i] = here;
			const w = t.k === "w" ? t.v : null;
			const depth0 = parens.length === 0;

			if (is(i, "(")) {
				if (QUERY_START.has(word(i + 1))) {
					const inner = level(i + 1, lv);
					if (expectRel && depth0) {
						addItem({ name: "", rel: null, columns: inner.level.outputs });
					} else if (cte) {
						cte.columns ??= inner.level.outputs;
						cte = null;
					} else after = null;
					i = inner.i;
					if (out && depth0) out.push(t, toks[i] ?? t);
					continue;
				}
				const prev = word(i - 1);
				let kind: ParenKind = "expr";
				let item: Item | null = null;
				if (depth0 && after) {
					kind = after === lv.target && clause === "into" ? "target" : "names";
					item = after;
					after = null;
				} else if (cte) {
					kind = "names";
					item = cte;
					cte = null;
				} else if (prev === "insert" || prev === "conflict") kind = "target";
				else if (
					prev === "values" ||
					(clause === "values" && depth0 && is(i - 1, ","))
				)
					kind = "values";
				here.opens = kind;
				if (kind === "names") item!.columns = [];
				parens.push({ kind, item });
				if (depth0 && out) out.push(t);
				continue;
			}
			if (is(i, ")")) {
				if (depth0) {
					endOutput();
					return { level: first, i };
				}
				parens.pop();
				if (parens.length === 0) {
					if (out) out.push(t);
					if (clause === "from-call") {
						clause = "from";
						after = lv.items.at(-1)!;
						aliased = false;
					}
				}
				continue;
			}
			if (!depth0) {
				const p = parens.at(-1)!;
				if (p.kind === "names" && (t.k === "w" || t.k === "q"))
					p.item!.columns!.push(t.v);
				continue;
			}

			if (after) {
				if (w === "as") continue;
				if (!aliased && named(t, my) && !is(i + 1, ".")) {
					after.name = t.v;
					aliased = true;
					continue;
				}
				after = null;
			}
			if (
				expectRel &&
				(t.k === "w" || t.k === "q" || t.k === "x") &&
				!(w && notAlias(w) && !beforeTable(w))
			) {
				if (beforeTable(w)) {
					here.relNext = true;
					continue;
				}
				if (t.k === "x") {
					addItem({ name: t.v, rel: null, columns: null });
					continue;
				}
				let ref: RelRef = { schema: null, name: t.v };
				if (
					is(i + 1, ".") &&
					(toks[i + 2]?.k === "w" || toks[i + 2]?.k === "q")
				) {
					at[i + 1] = at[i + 2] = here;
					ref = { schema: t.v, name: toks[i + 2]!.v };
					i += 2;
				}
				if (is(i + 1, "(") && clause !== "into") {
					addItem({ name: ref.name, rel: null, columns: null });
					after = null;
					clause = "from-call";
					continue;
				}
				const c = ref.schema === null ? visibleCte(ref.name) : undefined;
				addItem(
					c
						? { name: ref.name, rel: null, columns: c.columns }
						: { name: ref.name, rel: ref, columns: null },
				);
				continue;
			}
			expectRel = false;

			if (t.k === "o" && t.v === ",") {
				if (out) {
					endOutput();
					out = [];
				}
				if (clause === "from") here.relNext = expectRel = true;
				else cteNext = true;
				continue;
			}
			if (t.k === "o" && t.v === ";") {
				out = null;
				lv = fresh();
				clause = "";
				continue;
			}
			if (clause === "with" && cteNext && w !== "recursive") {
				cteNext = false;
				if (t.k === "w" || t.k === "q") {
					cte = { name: t.v, rel: null, columns: null };
					lv.ctes.push(cte);
					continue;
				}
			}
			switch (w) {
				case "with":
					if (clause === "") {
						clause = "with";
						cteNext = true;
					}
					break;
				case "select":
				case "returning":
					clause = w;
					lv.outputs = [];
					out = [];
					break;
				case "from":
					endOutput();
					if (clause === "delete") targetNext = !lv.target;
					clause = "from";
					here.relNext = expectRel = true;
					break;
				case "straight_join":
				case "join":
					if (w === "straight_join" && !my) {
						if (out) out.push(t);
						break;
					}
					clause = "from";
					here.relNext = expectRel = true;
					break;
				case "into":
					if (clause === "insert" || clause === "merge")
						targetNext = !lv.target;
					clause = "into";
					here.relNext = expectRel = true;
					break;
				case "update":
					// MySQL's INSERT … ON DUPLICATE KEY UPDATE sets the target's columns.
					if (word(i - 1) === "key" && word(i - 2) === "duplicate") {
						clause = "set";
						break;
					}
					if (lv.target || word(i - 1) === "for" || word(i - 1) === "key")
						break;
					targetNext = true;
					here.relNext = expectRel = true;
					break;
				case "table":
					here.relNext = expectRel = true;
					break;
				case "using":
					if (
						clause === "into" ||
						(clause === "from" && lv.target !== null && lv.items.length === 1)
					) {
						clause = "from";
						here.relNext = expectRel = true;
					}
					break;
				case "conflict":
					clause = w;
					if (lv.target?.rel)
						lv.items.push({
							name: "excluded",
							rel: lv.target.rel,
							columns: null,
						});
					break;
				case "union":
				case "intersect":
				case "except": {
					endOutput();
					lv = { ...lv, items: [] };
					break;
				}
				case "replace":
					// REPLACE INTO (MySQL, SQLite), not the replace() function.
					if (clause !== "" || is(i + 1, "(")) {
						if (out) out.push(t);
						break;
					}
					clause = "insert";
					break;
				case "where":
				case "group":
				case "order":
				case "having":
				case "window":
				case "limit":
				case "offset":
				case "set":
				case "values":
				case "delete":
				case "insert":
				case "merge":
					endOutput();
					clause = w;
					break;
				default:
					if (out) out.push(t);
			}
		}
		endOutput();
		return { level: first, i };
	};

	for (let i = 0; toks[i]; ) i = level(i, null).i + 1;
	return { at, used };
}

function outputName(toks: readonly Tok[]): string | null {
	const last = toks.at(-1);
	if (!last) return null;
	if (named(last)) {
		const before = toks.at(-2);
		if (before?.k !== "o" || before.v === ")" || before.v === ".")
			return last.v;
	}
	const head = toks[0]!;
	if (toks.length === 3 && head.k === "w" && toks[1]!.v === "(") return head.v;
	return null;
}

export function contextAt(
	text: string,
	offset: number,
	dialect: Dialect = "postgres",
): Context {
	const my = isMySql(dialect);
	const { toks, inside } = lex(text, offset, my);
	let from = offset;
	let j = toks.length - 1;
	while (j >= 0 && toks[j]!.s >= offset) j--;
	const cur = toks[j];
	if (cur && cur.k === "w" && cur.e >= offset) {
		from = cur.s;
		j--;
	} else if (cur && cur.e > offset) return { expect: NONE, from };
	if (inside || j < 0) return { expect: NONE, from };
	const { at, used } = structure(toks, my);
	return { expect: expectAfter(toks, at, used, j), from };
}

function expectAfter(
	toks: readonly Tok[],
	at: readonly At[],
	used: readonly RelRef[],
	j: number,
): Expect {
	const t = toks[j]!;
	if (t.v === ")") return NONE;
	const a = at[j]!;
	const scope = (): Expect => {
		const sources: ScopeItem[] = [...levels(a.level)].flatMap((l) => l.items);
		if (!sources.length && a.level.target) sources.push(a.level.target);
		const aliases = new Set<string>();
		for (const { name } of sources)
			if (name !== "" && name !== "excluded") aliases.add(name);
		return { kind: "column", sources, aliases: Array.from(aliases) };
	};
	const target = (): Expect =>
		a.level.target
			? { kind: "column", sources: [a.level.target], aliases: [] }
			: NONE;
	const ctes = (): Cte[] => [...levels(a.level)].flatMap((l) => l.ctes);
	const relation = (schema: string | null): Expect => ({
		kind: "relation",
		schema,
		ctes: schema === null ? ctes() : [],
		used,
	});

	if (t.v === ".") {
		const q: string[] = [];
		let k = j;
		while (
			toks[k]?.k === "o" &&
			toks[k]!.v === "." &&
			(toks[k - 1]?.k === "w" || toks[k - 1]?.k === "q")
		) {
			q.unshift(toks[k - 1]!.v);
			k -= 2;
			if (q.length === 2) break;
		}
		if (!q.length) return NONE;
		if (at[k]?.relNext) return q.length === 1 ? relation(q[0]!) : NONE;
		return qualified(a.level, q);
	}
	if (a.relNext) return relation(null);
	if (t.v === "(") {
		const opens = a.opens;
		return opens === "target" ? target() : opens === "expr" ? scope() : NONE;
	}
	if (t.k === "o" && t.v === ",") {
		if (a.paren === "target") return target();
		if (a.paren === "expr") return scope();
		if (a.paren) return NONE;
		if (a.clause === "set") return target();
		return a.clause === "select" ||
			a.clause === "group" ||
			a.clause === "order" ||
			a.clause === "returning"
			? scope()
			: NONE;
	}
	if (t.k === "w") {
		if (
			t.v === "set" ||
			(t.v === "update" &&
				toks[j - 1]?.v === "key" &&
				toks[j - 2]?.v === "duplicate")
		)
			return target();
		return BEFORE_EXPR.has(t.v) ? scope() : NONE;
	}
	if (t.k === "o" && t.v !== "::" && t.v !== ";" && t.v !== "]") {
		if (t.v === "*") {
			const p = toks[j - 1];
			if (
				!p ||
				(p.k === "w" && p.v === "select") ||
				(p.k === "o" && (p.v === "," || p.v === "." || p.v === "("))
			)
				return NONE;
		}
		return scope();
	}
	return NONE;
}

function qualified(level: Level, q: readonly string[]): Expect {
	if (q.length === 1) {
		const all = [...levels(level)];
		const item =
			all.flatMap((l) => l.items).find((x) => x.name === q[0]) ??
			all.flatMap((l) => l.ctes).find((x) => x.name === q[0]);
		if (item) return { kind: "column", sources: [item], aliases: [] };
		return {
			kind: "column",
			sources: [
				{ name: q[0]!, rel: { schema: null, name: q[0]! }, columns: null },
			],
			aliases: [],
		};
	}
	return {
		kind: "column",
		sources: [
			{ name: q[1]!, rel: { schema: q[0]!, name: q[1]! }, columns: null },
		],
		aliases: [],
	};
}
