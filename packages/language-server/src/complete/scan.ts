export interface RelRef {
	readonly schema: string | null;
	readonly name: string;
}

export interface ScopeItem {
	readonly name: string;
	readonly rel: RelRef | null;
	readonly columns: readonly string[] | null;
}

export interface Cte {
	readonly name: string;
	readonly columns: readonly string[] | null;
}

export type Expect =
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

const WORD = /[A-Za-z_\u0080-￿][A-Za-z0-9_$\u0080-￿]*/y;
const LINE_COMMENT = /--[^\n\r]*/y;
const COMMENT_MARK = /\/\*|\*\//g;
const STRING = /(?:([eE])|[bBxXnN]|[uU]&)?'/y;
const STRING_REST = /[^']*'?/y;
const ESCAPE_STRING_REST = /(?:[^'\\]|\\.|'')*'?/sy;
const QUOTED = /(?:[uU]&)?"((?:[^"]|"")*)"?/y;
const DOLLAR_TAG = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;
const NUMBER =
	/(?:[0-9]|[.$][0-9])[0-9._]*(?:[eE][-+])?[A-Za-z0-9_$\u0080-￿]*/y;
const NAMED_PARAM = /:[A-Za-z_][A-Za-z0-9_$\u0080-￿]*/y;
const SLOT = /\{[A-Za-z_][A-Za-z0-9_]*\}/y;
const PUNCTUATION = /::|./sy;
const OPERATOR = /(?:(?!--|\/\*)[+\-*/<>=~!@#%^&|`?])+/y;

export const fold = (s: string): string =>
	s.replace(/[A-Z]/g, (m) => m.toLowerCase());

function lex(text: string, offset: number): { toks: Tok[]; inside: boolean } {
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
		if (take(LINE_COMMENT)) {
			comment(s, true);
			continue;
		}
		if (text.startsWith("/*", i)) {
			let depth = 0;
			COMMENT_MARK.lastIndex = i;
			for (let c = COMMENT_MARK.exec(text); c; c = COMMENT_MARK.exec(text)) {
				depth += c[0] === "/*" ? 1 : -1;
				if (depth === 0) break;
			}
			i = depth === 0 ? COMMENT_MARK.lastIndex : n;
			comment(s, depth > 0);
			continue;
		}
		if (value()) {
			push("v", s);
			continue;
		}
		const quoted = take(QUOTED);
		if (quoted) {
			push("q", s, quoted[1]!.replaceAll('""', '"'));
			continue;
		}
		if (take(SLOT)) push("x", s);
		else if (take(WORD)) push("w", s, fold(text.slice(s, i)));
		else {
			if (!take(OPERATOR)) take(PUNCTUATION);
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

function structure(toks: readonly Tok[]): { at: At[]; used: RelRef[] } {
	const at: At[] = [];
	const used: RelRef[] = [];
	const word = (i: number): string | null =>
		toks[i]?.k === "w" ? toks[i]!.v : null;
	const is = (i: number, v: string): boolean =>
		toks[i]?.k === "o" && toks[i]!.v === v;
	const named = (t: Tok | undefined): boolean =>
		!!t && (t.k === "q" || (t.k === "w" && !NOT_ALIAS.has(t.v)));

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
				if (out) endOutput(), (out = []);
				if (clause === "from") here.relNext = expectRel = true;
				else cteNext = true;
				continue;
			}
			if (t.k === "o" && t.v === ";") {
				out = null;
				lv = { parent, items: [], ctes: [], outputs: null, target: null };
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
				case "join":
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
	if (last.k === "q" || (last.k === "w" && !NOT_ALIAS.has(last.v))) {
		const before = toks.at(-2);
		if (!before || before.k !== "o" || before.v === ")" || before.v === ".")
			return last.v;
	}
	const head = toks[0]!;
	if (toks.length === 3 && head.k === "w" && toks[1]!.v === "(") return head.v;
	return null;
}

export function contextAt(text: string, offset: number): Context {
	const { toks, inside } = lex(text, offset);
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
	if (t.v === ")") return NONE;
	const a = at[j]!;
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
		if (t.v === "set") return target();
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
