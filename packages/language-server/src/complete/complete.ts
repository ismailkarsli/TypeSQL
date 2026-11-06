import type { CallExpression, LineAndCharacter, Node } from "typescript/ast";
import type { Checker, DocumentIdentifier, Program } from "typescript/async";
import {
	calleeOf,
	type EditorKinds,
	isCall,
	isSqlLiteral,
	sqlTypeOf,
	targetOf,
	textOf,
} from "../call.js";
import { DIALECTS, type DialectFacts, quoteName } from "../sql/dialect.js";
import { type Context, contextAt, type RelRef } from "./scan.js";
import { type Schema, schemaOf } from "./schema.js";

export interface CompletionItem {
	readonly label: string;
	readonly kind: "table" | "view" | "namespace" | "cte" | "column" | "alias";
	readonly detail: string;
	readonly insertText: string;
	readonly sortText: string;
}

const MAX_ITEMS = 1000;

async function completions(
	schema: Schema,
	ctx: Context,
	d: DialectFacts,
): Promise<CompletionItem[]> {
	const same = (name: string): string =>
		d.foldsCase ? name.toLowerCase() : name;
	const e = ctx.expect;
	const items: CompletionItem[] = [];
	const add = (
		label: string,
		kind: CompletionItem["kind"],
		detail: string,
		sort: string,
	): void => {
		if (items.length < MAX_ITEMS)
			items.push({
				label,
				kind,
				detail,
				insertText: quoteName(label, d),
				sortText: sort,
			});
	};
	if (e.kind === "relation") {
		e.ctes.forEach((c, i) => {
			add(c.name, "cte", "WITH query", `0${pad(i)}`);
		});
		const used = new Set(
			e.used
				.filter(
					(r) =>
						(r.schema ?? null) === e.schema ||
						(r.schema === null &&
							e.schema !== null &&
							d.defaultSchemas.includes(e.schema)),
				)
				.map((r) => same(r.name)),
		);
		const rels = await schema.relations(e.schema);
		rels.forEach((r, i) => {
			add(
				r.name,
				r.view ? "view" : "table",
				r.view ? "view" : "table",
				`${used.has(same(r.name)) ? 1 : 2}${pad(i)}`,
			);
		});
		if (e.schema === null)
			schema.namespaces.forEach((ns, i) => {
				add(ns, "namespace", "schema", `3${pad(i)}`);
			});
		return dedupe(items);
	}
	if (e.kind === "column") {
		const many = e.sources.length > 1;
		const lists = await Promise.all(
			e.sources.map(async (s) => {
				if (s.columns)
					return s.columns.map((name) => ({
						name,
						detail: many ? `${s.name}.${name}` : "",
					}));
				const cols = s.rel ? await schema.columns(s.rel) : null;
				return (cols ?? []).map((c) => {
					const type = `${c.type}${c.nullable ? " | null" : ""}`;
					return {
						name: c.name,
						detail: many ? `${s.name}.${c.name}: ${type}` : type,
					};
				});
			}),
		);
		lists.forEach((cols, i) => {
			cols.forEach((c, k) => {
				add(c.name, "column", c.detail, `${pad(i)}${pad(k)}`);
			});
		});
		e.aliases.forEach((a, i) => {
			const s = e.sources.find((x) => x.name === a);
			add(a, "alias", s?.rel ? relName(s.rel) : "", `9${pad(i)}`);
		});
		return dedupe(items);
	}
	return items;
}

interface Range {
	readonly start: LineAndCharacter;
	readonly end: LineAndCharacter;
}

export interface Completions {
	readonly items: readonly CompletionItem[];
	/** The text the items replace: the name typed so far. */
	readonly replaceRange: Range;
	/** The SQL literal's text, which TypeScript's own items replace. */
	readonly literalRange: Range;
}

export async function completionsAt(
	program: Program,
	checker: Checker,
	kinds: EditorKinds,
	document: DocumentIdentifier,
	at: number | LineAndCharacter,
	isCorePath: (path: string) => boolean,
): Promise<Completions | null> {
	const file = await program.getSourceFile(document);
	if (!file) return null;
	const offset =
		typeof at === "number"
			? at
			: file.getPositionOfLineAndCharacter(at.line, at.character);
	const call = callAt(file, offset, kinds);
	if (!call) return null;
	const literal = call.arguments[0]!;
	const sql = textOf(file, literal, kinds);
	if (
		offset < sql.start ||
		offset > sql.end ||
		sql.holes.some(([s, e]) => offset > s && offset < e)
	)
		return null;
	const callee = calleeOf(call, kinds);
	const t = await checker.getTypeAtLocation(callee.node);
	const entry = await sqlTypeOf(t, callee.method, isCorePath);
	const target = entry && (await targetOf(checker, t, entry));
	if (!target) return null;
	const d = DIALECTS[target.dialect];

	const ctx = contextAt(sql.text, offset - sql.start, d);
	const lc = (o: number): LineAndCharacter =>
		file.getLineAndCharacterOfPosition(o);
	let from = sql.start + ctx.from;
	// A quoted name typed in a "…" string, or a `…` name in a template literal,
	// starts with its escaping backslash.
	if (from > sql.start && file.text[from - 1] === "\\") from--;
	const ranges = {
		replaceRange: { start: lc(from), end: lc(offset) },
		literalRange: { start: lc(sql.start), end: lc(sql.end) },
	};
	if (ctx.expect.kind === "none") return { items: [], ...ranges };
	const items = await completions(
		await schemaOf(checker, target.db, d),
		ctx,
		d,
	);
	const quote = file.text[literal.getStart(file)]!;
	return {
		items: items.map((i) => ({
			...i,
			insertText: escapeFor(quote, i.insertText),
		})),
		...ranges,
	};
}

/** The innermost call around `offset` whose first argument is a string. */
function callAt(
	file: Node,
	offset: number,
	kinds: EditorKinds,
): CallExpression | null {
	let found: CallExpression | null = null;
	const visit = (n: Node): void => {
		if (offset < n.pos || offset > n.end) return;
		if (isCall(n, kinds) && isSqlLiteral(n.arguments[0], kinds)) found = n;
		n.forEachChild(visit);
	};
	visit(file);
	return found;
}

/** Escape inserted SQL for the TypeScript string literal it goes into. */
function escapeFor(quote: string, text: string): string {
	const s = text.replaceAll("\\", "\\\\");
	if (quote === "`") return s.replaceAll("`", "\\`").replaceAll("${", "\\${");
	return s.replaceAll(quote, `\\${quote}`);
}

const pad = (n: number): string => String(n).padStart(4, "0");
const relName = (r: RelRef): string =>
	r.schema === null ? r.name : `${r.schema}.${r.name}`;

function dedupe(items: CompletionItem[]): CompletionItem[] {
	const seen = new Set<string>();
	return items.filter((i) => !seen.has(i.label) && !!seen.add(i.label));
}
