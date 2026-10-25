/**
 * What may come at a cursor in a statement's text, for editor completions: a relation, a
 * column (and of which FROM items), or nothing. A rough scan, not the parser: it reads
 * keywords, FROM items, aliases and CTEs around the cursor and never fails on incomplete
 * text. A wrong guess only makes the list less useful; it never changes a type.
 */

/** A relation as written: `users` (schema null), `auth.sessions`. Unquoted names are folded. */
export interface RelRef {
	readonly schema: string | null;
	readonly name: string;
}

/** A FROM item (or DML target) visible at the cursor. */
export interface ScopeItem {
	/** The alias, or the relation's name without one. */
	readonly name: string;
	/** The relation it reads; null for a subquery, CTE, function or `{slot}`. */
	readonly rel: RelRef | null;
	/** Output column names of a subquery or CTE, when the scan can tell. */
	readonly columns: readonly string[] | null;
}

export interface Cte {
	readonly name: string;
	readonly columns: readonly string[] | null;
}

export type Expect =
	| { readonly kind: "none" }
	/** A relation, CTE or namespace name; `schema` for `auth.|`. `used`: relations the statement names. */
	| {
			readonly kind: "relation";
			readonly schema: string | null;
			readonly ctes: readonly Cte[];
			readonly used: readonly RelRef[];
	  }
	/**
	 * A column of `sources` (innermost FROM items first). `aliases` are FROM item names to offer
	 * too (for a bare name; empty after `alias.` and in a column list).
	 */
	| {
			readonly kind: "column";
			readonly sources: readonly ScopeItem[];
			readonly aliases: readonly string[];
	  };

export interface Context {
	readonly expect: Expect;
	/** Start of the name being typed; the completion replaces `[from, offset)`. */
	readonly from: number;
}

const NONE: Context["expect"] = { kind: "none" };

// ───────────────────────────── lexer ─────────────────────────────

/**
 * `w` unquoted word (folded), `q` quoted identifier, `s` string, `n` number, `p` parameter
 * (`$1`, `:name`), `x` `{slot}`, `o` operator or punctuation.
 */
interface Tok {
	readonly k: "w" | "q" | "s" | "n" | "p" | "x" | "o";
	readonly v: string;
	readonly s: number;
	readonly e: number;
}

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD = /[A-Za-z0-9_$\u0080-￿]/;
const OP = /[+\-*/<>=~!@#%^&|`?]/;

/** Postgres folds unquoted names to lower case. */
export const fold = (s: string): string =>
	s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

/** Tokens, and whether `offset` is inside a string, comment, quoted identifier or slot. */
function lex(text: string, offset: number): { toks: Tok[]; inside: boolean } {
	const toks: Tok[] = [];
	let inside = false;
	const n = text.length;
	/** Something that is not code ran from `s` to `e` (`open`: no closing delimiter). */
	const skipped = (s: number, e: number, open: boolean): void => {
		if (s < offset && (offset < e || (open && offset <= e))) inside = true;
	};
	let i = 0;
	while (i < n) {
		const c = text[i]!;
		const s = i;
		if (/\s/.test(c)) {
			i++;
		} else if (c === "-" && text[i + 1] === "-") {
			while (i < n && text[i] !== "\n") i++;
			skipped(s, i, true);
		} else if (c === "/" && text[i + 1] === "*") {
			let depth = 0;
			while (i < n) {
				if (text[i] === "/" && text[i + 1] === "*") depth++, (i += 2);
				else if (text[i] === "*" && text[i + 1] === "/") {
					i += 2;
					if (--depth === 0) break;
				} else i++;
			}
			skipped(s, i, depth > 0);
		} else if (
			c === "'" ||
			(/[eEbBxXnN]/.test(c) && text[i + 1] === "'") ||
			((c === "u" || c === "U") && text[i + 1] === "&" && text[i + 2] === "'")
		) {
			const backslash = c === "e" || c === "E";
			i = text.indexOf("'", i) + 1;
			let closed = false;
			while (i < n) {
				if (backslash && text[i] === "\\") i += 2;
				else if (text[i] === "'") {
					if (text[i + 1] === "'") i += 2;
					else {
						i++;
						closed = true;
						break;
					}
				} else i++;
			}
			skipped(s, Math.min(i, n), !closed);
			toks.push({ k: "s", v: "", s, e: i });
		} else if (
			c === '"' ||
			((c === "u" || c === "U") && text[i + 1] === "&" && text[i + 2] === '"')
		) {
			i = text.indexOf('"', i) + 1;
			let v = "";
			let closed = false;
			while (i < n) {
				if (text[i] === '"') {
					if (text[i + 1] === '"') (v += '"'), (i += 2);
					else {
						i++;
						closed = true;
						break;
					}
				} else v += text[i++];
			}
			skipped(s, Math.min(i, n), !closed);
			toks.push({ k: "q", v, s, e: i });
		} else if (c === "$" && /[0-9]/.test(text[i + 1] ?? "")) {
			i++;
			while (i < n && /[0-9]/.test(text[i]!)) i++;
			toks.push({ k: "p", v: text.slice(s, i), s, e: i });
		} else if (
			c === "$" &&
			/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.test(text.slice(i, i + 64))
		) {
			const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(
				text.slice(i, i + 64),
			)![0];
			const end = text.indexOf(tag, i + tag.length);
			i = end < 0 ? n : end + tag.length;
			skipped(s, i, end < 0);
			toks.push({ k: "s", v: "", s, e: i });
		} else if (c === ":" && text[i + 1] === ":") {
			i += 2;
			toks.push({ k: "o", v: "::", s, e: i });
		} else if (c === ":" && /[A-Za-z_]/.test(text[i + 1] ?? "")) {
			i++;
			while (i < n && WORD.test(text[i]!)) i++;
			toks.push({ k: "p", v: text.slice(s, i), s, e: i });
		} else if (
			c === "{" &&
			/^\{[A-Za-z_][A-Za-z0-9_]*\}/.test(text.slice(i, i + 256))
		) {
			i = text.indexOf("}", i) + 1;
			skipped(s, i, false);
			toks.push({ k: "x", v: text.slice(s, i), s, e: i });
		} else if (
			/[0-9]/.test(c) ||
			(c === "." && /[0-9]/.test(text[i + 1] ?? ""))
		) {
			while (i < n && /[0-9._]/.test(text[i]!)) i++;
			if (/[eE]/.test(text[i] ?? "") && /[-+0-9]/.test(text[i + 1] ?? "")) {
				i += 2;
				while (i < n && /[0-9]/.test(text[i]!)) i++;
			}
			while (i < n && WORD.test(text[i]!)) i++;
			toks.push({ k: "n", v: text.slice(s, i), s, e: i });
		} else if (WORD_START.test(c)) {
			while (i < n && WORD.test(text[i]!)) i++;
			toks.push({ k: "w", v: fold(text.slice(s, i)), s, e: i });
		} else if (OP.test(c)) {
			while (
				i < n &&
				OP.test(text[i]!) &&
				!(text[i] === "-" && text[i + 1] === "-") &&
				!(text[i] === "/" && text[i + 1] === "*")
			)
				i++;
			toks.push({ k: "o", v: text.slice(s, i), s, e: i });
		} else {
			i++;
			toks.push({ k: "o", v: c, s, e: i });
		}
	}
	return { toks, inside };
}

// ───────────────────────────── structure ─────────────────────────────

/** Words that start a query inside parentheses. */
const QUERY_START = new Set(["select", "with", "values", "table"]);
/** Words that cannot be an alias right after a FROM item (keywords that end it). */
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
/** After these, an expression (and so a column) may follow. */
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

type ParenKind =
	/** A column list of the DML target: `INSERT INTO t (…)`, `ON CONFLICT (…)`. */
	| "target"
	/** `JOIN … USING (…)`. */
	| "using"
	/** Column names of a CTE or alias: `WITH c(a, b)`, `AS x(a, b)`. */
	| "names"
	| "values"
	| "expr";

interface Item {
	name: string;
	readonly rel: RelRef | null;
	columns: string[] | null;
}

interface Level {
	readonly parent: Level | null;
	readonly items: Item[];
	readonly ctes: Item[];
	/** Output names of the select list (or RETURNING); null until one is read. */
	outputs: string[] | null;
	/** The INSERT / UPDATE / DELETE / MERGE target. */
	target: Item | null;
}

/** The state at a token, before it is read. */
interface At {
	readonly level: Level;
	readonly clause: string;
	readonly paren: ParenKind | null;
	/** For `(`: the kind of parenthesis it opens (`query` for a subquery). */
	opens?: ParenKind | "query";
	/** A relation name may follow this token. */
	relNext?: boolean;
}

function structure(toks: readonly Tok[]): { at: At[]; used: RelRef[] } {
	const at: At[] = [];
	const used: RelRef[] = [];
	const word = (i: number): string | null =>
		toks[i]?.k === "w" ? toks[i]!.v : null;
	const is = (i: number, v: string): boolean =>
		toks[i]?.k === "o" && toks[i]!.v === v;
	const named = (t: Tok | undefined): boolean =>
		!!t && (t.k === "q" || (t.k === "w" && !NOT_ALIAS.has(t.v)));

	/** Reads one query level from `i` up to its closing `)` (not consumed) or the end. */
	const level = (
		i: number,
		parent: Level | null,
	): { level: Level; i: number } => {
		const first: Level = {
			parent,
			items: [],
			ctes: [],
			outputs: null,
			target: null,
		};
		let lv = first;
		let clause = "";
		const parens: { kind: ParenKind; item: Item | null }[] = [];
		let expectRel = false;
		/** The next relation read becomes the DML target. */
		let targetNext = false;
		/** The last FROM item, while its alias may follow. */
		let after: Item | null = null;
		let aliased = false;
		/** In `WITH`: the next word names a CTE. */
		let cteNext = false;
		let cte: Item | null = null;
		/** Depth-0 tokens of the current select-list item. */
		let out: Tok[] | null = null;

		const endOutput = (): void => {
			if (!out) return;
			const name = outputName(out);
			if (name !== null) lv.outputs!.push(name);
			out = null;
		};
		const visibleCte = (name: string): Item | undefined => {
			for (let l: Level | null = lv; l; l = l.parent) {
				const c = l.ctes.find((x) => x.name === name);
				if (c) return c;
			}
			return undefined;
		};
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
				if (QUERY_START.has(word(i + 1) ?? "")) {
					here.opens = "query";
					const inner = level(i + 1, lv);
					if (expectRel && depth0) {
						addItem({ name: "", rel: null, columns: inner.level.outputs });
					} else if (clause === "with" && cte && depth0) {
						cte.columns ??= inner.level.outputs;
						cte = null;
					} else if (after) after = null;
					i = inner.i;
					if (i < toks.length)
						at[i] = { level: lv, clause, paren: parens.at(-1)?.kind ?? null };
					if (out && depth0) out.push(t, { k: "o", v: ")", s: 0, e: 0 });
					continue;
				}
				const prev = word(i - 1);
				let kind: ParenKind = "expr";
				let item: Item | null = null;
				if (depth0 && after) {
					kind =
						after === lv.target && (clause === "into" || clause === "insert")
							? "target"
							: "names";
					item = after;
					after = null;
				} else if (depth0 && clause === "with" && cte) {
					kind = "names";
					item = cte;
				} else if (prev === "insert" || prev === "conflict") kind = "target";
				else if (prev === "using" && clause === "using") kind = "using";
				else if (
					prev === "values" ||
					(clause === "values" && depth0 && is(i - 1, ","))
				)
					kind = "values";
				here.opens = kind;
				if (kind === "names" && item) item.columns = [];
				parens.push({ kind, item });
				if (depth0 && out) out.push(t);
				continue;
			}
			if (is(i, ")")) {
				if (depth0) {
					endOutput();
					return { level: first, i };
				}
				const p = parens.pop()!;
				if (parens.length === 0) {
					if (out) out.push(t);
					// `FROM f(x) AS y`: the alias may follow a function call
					if (p.kind === "expr" && clause === "from-call") {
						clause = "from";
						after = lv.items.at(-1) ?? null;
						aliased = false;
					}
				}
				continue;
			}
			if (!depth0) {
				const p = parens.at(-1)!;
				if (p.kind === "names" && p.item && (t.k === "w" || t.k === "q"))
					p.item.columns!.push(t.v);
				continue;
			}

			// ── depth 0 of this level ──
			if (after) {
				if (w === "as") continue;
				if (!aliased && named(t) && !is(i + 1, ".")) {
					after.name = t.v;
					aliased = true;
					continue;
				}
				after = null;
			}
			if (
				expectRel &&
				(t.k === "w" || t.k === "q" || t.k === "x") &&
				!(w && NOT_ALIAS.has(w) && w !== "only" && w !== "lateral")
			) {
				if (w === "only" || w === "lateral") {
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
					at[i + 1] = { ...here, relNext: false };
					at[i + 2] = here;
					ref = { schema: t.v, name: toks[i + 2]!.v };
					i += 2;
				}
				if (is(i + 1, "(") && clause !== "into") {
					// a set-returning function
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
				if (out) endOutput(), (out = []);
				if (clause === "from") here.relNext = expectRel = true;
				else if (clause === "with") cteNext = true;
				continue;
			}
			if (t.k === "o" && t.v === ";") {
				endOutput();
				lv = { parent, items: [], ctes: [], outputs: null, target: null };
				clause = "";
				continue;
			}
			if (
				clause === "with" &&
				cteNext &&
				(t.k === "w" || t.k === "q") &&
				w !== "recursive"
			) {
				cte = { name: t.v, rel: null, columns: null };
				lv.ctes.push(cte);
				cteNext = false;
				continue;
			}
			if (w === null) {
				if (out) out.push(t);
				continue;
			}
			switch (w) {
				case "with":
					if (clause === "" || clause === "with") {
						clause = "with";
						cteNext = true;
					}
					break;
				case "select":
					endOutput();
					clause = "select";
					if (lv.outputs === null) {
						lv.outputs = [];
						out = [];
					}
					break;
				case "returning":
					endOutput();
					clause = "returning";
					if (lv.outputs === null) {
						lv.outputs = [];
						out = [];
					}
					break;
				case "from":
					endOutput();
					if (clause === "delete") targetNext = !lv.target;
					clause = "from";
					here.relNext = expectRel = true;
					break;
				case "join":
					clause = "from";
					here.relNext = expectRel = true;
					break;
				case "into":
					if (clause === "insert" || clause === "merge" || clause === "")
						targetNext = !lv.target;
					endOutput();
					clause = "into";
					here.relNext = expectRel = true;
					break;
				case "update":
					if (lv.target) clause = "update";
					else {
						clause = "update";
						targetNext = true;
						here.relNext = expectRel = true;
					}
					break;
				case "table":
					if (clause === "" || clause === "with") {
						clause = "from";
						here.relNext = expectRel = true;
					}
					break;
				case "using":
					if (
						clause === "into" ||
						(clause === "from" &&
							lv.target !== null &&
							lv.items.length === 1 &&
							lv.items[0] === lv.target)
					) {
						// DELETE FROM t USING …, MERGE INTO t USING …
						clause = "from";
						here.relNext = expectRel = true;
					} else clause = "using";
					break;
				case "conflict":
					clause = "conflict";
					// `excluded` names the row proposed for insertion
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
					// the next branch has its own FROM items; the first branch's outputs name the columns
					const outputs = first.outputs;
					lv = { parent, items: [], ctes: lv.ctes, outputs, target: null };
					clause = "";
					break;
				}
				case "on":
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
				case "do":
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

	let i = 0;
	while (i < toks.length) {
		// a stray `)` at the top: keep reading after it in a new level
		const r = level(i, null);
		i = r.i + 1;
		if (r.i < toks.length)
			at[r.i] = { level: r.level, clause: "", paren: null };
	}
	return { at, used };
}

/** The column name Postgres gives a select-list item, when the scan can tell. */
function outputName(toks: readonly Tok[]): string | null {
	const last = toks.at(-1);
	if (!last) return null;
	const named = last.k === "q" || (last.k === "w" && !NOT_ALIAS.has(last.v));
	if (named && toks.length === 1) return last.v;
	const before = toks.at(-2);
	if (named && before?.k === "w" && before.v === "as") return last.v;
	if (named && before?.k === "o" && before.v === ".") return last.v;
	// `expr alias`
	if (
		named &&
		before &&
		(before.k === "w" ||
			before.k === "q" ||
			before.k === "n" ||
			before.k === "s" ||
			before.k === "p" ||
			(before.k === "o" && before.v === ")"))
	)
		return last.v;
	// `f(…)`
	const head = toks[0]!;
	if (
		head.k === "w" &&
		toks[1]?.k === "o" &&
		toks[1].v === "(" &&
		last.k === "o" &&
		last.v === ")" &&
		toks.length === 3
	)
		return head.v;
	return null;
}

// ───────────────────────────── the cursor ─────────────────────────────

/** What may be typed at `offset` of `text`. */
export function contextAt(text: string, offset: number): Context {
	const { toks, inside } = lex(text, offset);
	// the name being typed ends at the cursor
	let from = offset;
	let j = toks.length - 1;
	while (j >= 0 && toks[j]!.s >= offset) j--;
	const cur = toks[j];
	if (cur && cur.k === "w" && cur.e >= offset) {
		from = cur.s;
		j--;
	} else if (cur && cur.e > offset) return { expect: NONE, from };
	if (inside || j < 0) return { expect: NONE, from };
	const { at, used } = structure(toks);
	return { expect: expectAfter(toks, at, used, j), from };
}

function expectAfter(
	toks: readonly Tok[],
	at: readonly At[],
	used: readonly RelRef[],
	j: number,
): Expect {
	const t = toks[j]!;
	const a = at[j];
	if (!a) return NONE;
	const scope = (): Expect => {
		const sources: ScopeItem[] = [];
		for (let l: Level | null = a.level; l; l = l.parent)
			sources.push(...l.items);
		if (!sources.length && a.level.target) sources.push(a.level.target);
		return {
			kind: "column",
			sources,
			aliases: [
				...new Set(
					sources
						.map((s) => s.name)
						.filter((n) => n !== "" && n !== "excluded"),
				),
			],
		};
	};
	const target = (): Expect =>
		a.level.target
			? { kind: "column", sources: [a.level.target], aliases: [] }
			: NONE;
	const ctes = (): Cte[] => {
		const all: Cte[] = [];
		for (let l: Level | null = a.level; l; l = l.parent) all.push(...l.ctes);
		return all;
	};
	const relation = (schema: string | null): Expect => ({
		kind: "relation",
		schema,
		ctes: schema === null ? ctes() : [],
		used,
	});

	// `alias.` / `schema.` / `schema.table.`
	if (t.k === "o" && t.v === ".") {
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
		if (k >= 0 && at[k]?.relNext)
			return q.length === 1 ? relation(q[0]!) : NONE;
		return qualified(a.level, q);
	}
	if (a.relNext) return relation(null);
	if (t.k === "o" && t.v === "(") {
		const opens = a.opens;
		return opens === "target"
			? target()
			: opens === "expr" || opens === "using"
				? scope()
				: NONE;
	}
	if (t.k === "o" && t.v === ",") {
		if (a.paren === "target") return target();
		if (a.paren === "expr" || a.paren === "using") return scope();
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
		if (t.v === "set") return target();
		return BEFORE_EXPR.has(t.v) ? scope() : NONE;
	}
	if (
		t.k === "o" &&
		t.v !== ")" &&
		t.v !== "::" &&
		t.v !== ";" &&
		t.v !== "]"
	) {
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

/** Columns after `q.`: the FROM item named `q` (innermost first), else the relation `q`. */
function qualified(level: Level, q: readonly string[]): Expect {
	if (q.length === 1) {
		for (let l: Level | null = level; l; l = l.parent) {
			const item = l.items.find((x) => x.name === q[0]);
			if (item) return { kind: "column", sources: [item], aliases: [] };
		}
		for (let l: Level | null = level; l; l = l.parent) {
			const c = l.ctes.find((x) => x.name === q[0]);
			if (c) return { kind: "column", sources: [c], aliases: [] };
		}
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
