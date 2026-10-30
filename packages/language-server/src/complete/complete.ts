import type { LineAndCharacter } from "typescript/ast";
import type { Checker, DocumentIdentifier, Program } from "typescript/async";
import { type Dialect, type EditorKinds, sqlCallAt } from "./call.js";
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

export async function completions(
	schema: Schema,
	ctx: Context,
	dialect: Dialect = "postgres",
): Promise<CompletionItem[]> {
	const same = (name: string): string =>
		dialect === "sqlite" ? name.toLowerCase() : name;
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
				insertText: quoteIdent(label, dialect),
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
						(e.schema === "public" && r.schema === null),
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

export interface Range<T> {
	readonly start: T;
	readonly end: T;
}

export interface Completions {
	readonly items: readonly CompletionItem[];
	readonly replace: Range<number>;
	readonly replaceRange: Range<LineAndCharacter>;
	readonly literal: Range<number>;
	readonly literalRange: Range<LineAndCharacter>;
}

export async function completionsAt(
	program: Program,
	checker: Checker,
	kinds: EditorKinds,
	document: DocumentIdentifier,
	at: number | LineAndCharacter,
	isCorePath: (path: string) => boolean,
): Promise<Completions | null> {
	const call = await sqlCallAt(
		program,
		checker,
		kinds,
		document,
		at,
		isCorePath,
	);
	if (!call) return null;
	const ctx = contextAt(call.text, call.offset - call.start);
	const lc = (o: number): LineAndCharacter =>
		call.file.getLineAndCharacterOfPosition(o);
	let from = call.start + ctx.from;
	// A quoted name typed in a "…" string starts with its escaping backslash.
	if (from > call.start && call.file.text[from - 1] === "\\") from--;
	const replace = { start: from, end: call.offset };
	const literal = { start: call.start, end: call.end };
	const ranges = {
		replace,
		replaceRange: { start: lc(replace.start), end: lc(replace.end) },
		literal,
		literalRange: { start: lc(literal.start), end: lc(literal.end) },
	};
	if (ctx.expect.kind === "none") return { items: [], ...ranges };
	const items = await completions(
		await schemaOf(checker, call.db, call.dialect === "sqlite"),
		ctx,
		call.dialect,
	);
	return {
		items: items.map((i) => ({
			...i,
			insertText: escapeFor(call.quote, i.insertText),
		})),
		...ranges,
	};
}

/** Escape inserted SQL for the TypeScript string literal it goes into. */
export function escapeFor(quote: string, text: string): string {
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

const RESERVED = new Set([
	"all",
	"analyse",
	"analyze",
	"and",
	"any",
	"array",
	"as",
	"asc",
	"asymmetric",
	"authorization",
	"binary",
	"both",
	"case",
	"cast",
	"check",
	"collate",
	"collation",
	"column",
	"concurrently",
	"constraint",
	"create",
	"cross",
	"current_catalog",
	"current_date",
	"current_role",
	"current_schema",
	"current_time",
	"current_timestamp",
	"current_user",
	"default",
	"deferrable",
	"desc",
	"distinct",
	"do",
	"else",
	"end",
	"except",
	"false",
	"fetch",
	"for",
	"foreign",
	"freeze",
	"from",
	"full",
	"grant",
	"group",
	"having",
	"ilike",
	"in",
	"initially",
	"inner",
	"intersect",
	"into",
	"is",
	"isnull",
	"join",
	"lateral",
	"leading",
	"left",
	"like",
	"limit",
	"localtime",
	"localtimestamp",
	"natural",
	"not",
	"notnull",
	"null",
	"offset",
	"on",
	"only",
	"or",
	"order",
	"outer",
	"overlaps",
	"placing",
	"primary",
	"references",
	"returning",
	"right",
	"select",
	"session_user",
	"similar",
	"some",
	"symmetric",
	"system_user",
	"table",
	"tablesample",
	"then",
	"to",
	"trailing",
	"true",
	"union",
	"unique",
	"user",
	"using",
	"variadic",
	"verbose",
	"when",
	"where",
	"window",
	"with",
]);

export function quoteIdent(
	name: string,
	dialect: Dialect = "postgres",
): string {
	const bare =
		dialect === "sqlite"
			? /^[A-Za-z_][A-Za-z0-9_$]*$/.test(name) &&
				!SQLITE_RESERVED.has(name.toLowerCase())
			: /^[a-z_][a-z0-9_$]*$/.test(name) && !RESERVED.has(name);
	return bare ? name : `"${name.replaceAll('"', '""')}"`;
}

const SQLITE_RESERVED = new Set(
	"add all alter and as autoincrement between case check collate commit constraint create default deferrable delete distinct drop else escape except exists foreign from group having in index insert intersect into is isnull join limit not nothing notnull null on or order primary references returning select set table then to transaction union unique update using values when where cross full inner left natural outer right".split(
		" ",
	),
);
