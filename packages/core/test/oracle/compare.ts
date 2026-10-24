import type { Analysis, AnalysisType } from "../../src/cache/evaluate.js";
import type { Disagreement, SkipReason } from "./kinds.js";
import { isRejection, type ServerError } from "./replay.js";

export type Ours =
	| { readonly analysis: Analysis }
	| { readonly error: string }
	| { readonly crash: string };

export interface Observed {
	readonly columns: readonly { readonly name: string; readonly type: string }[];
	readonly params: readonly string[];
	readonly rows: readonly (readonly unknown[])[];
	readonly runs: number;
	readonly runErrors: readonly ServerError[];
}

export type Server =
	| { readonly observed: Observed }
	| { readonly error: ServerError };

export type Verdict =
	| { readonly disagreements: readonly Disagreement[] }
	| { readonly skip: SkipReason };

export function normalizeOurs(type: string): string {
	if (type === "null") return "text";
	let t = type.replace(/\(\s*\d+(\s*,\s*\d+)?\s*\)/g, "");
	const arr = /^_(.+)$/.exec(t);
	if (arr) t = `${arr[1]}[]`;
	const dot = t.indexOf(".");
	if (dot > 0 && !t.startsWith("pg_catalog.")) t = t.slice(dot + 1);
	if (t.startsWith("pg_catalog.")) t = t.slice("pg_catalog.".length);
	return t;
}

/** Server errors that mean the statement needs state it does not create (a cursor, a prepared statement, a portal). */
const NEEDS_CONTEXT = new Set(["34000", "26000", "3D000", "42P03", "25P01"]);

export function compareStatement(ours: Ours, server: Server): Verdict {
	if ("crash" in ours)
		return { disagreements: [{ kind: "crash", detail: ours.crash }] };
	if ("error" in server) {
		if ("error" in ours) return { disagreements: [] };
		if (NEEDS_CONTEXT.has(server.error.code)) return { skip: "needs-context" };
		if (
			/cannot insert multiple commands into a prepared statement/.test(
				server.error.message,
			)
		)
			return { skip: "multi-statement" };
		// a constant that is not valid input for its type (`int4 '0x'`): the data, not the statement's meaning
		if (server.error.code.startsWith("22")) return { skip: "invalid-input" };
		if (isRejection(server.error))
			return {
				disagreements: [
					{
						kind: "accepts",
						detail: `server: ${server.error.code} ${server.error.message}`,
					},
				],
			};
		return { skip: "server-error" };
	}
	if ("error" in ours) {
		// rejected when it runs over the seeded rows (a NOT NULL column left out, a JSON key that is NULL): both reject it
		if (server.observed.runErrors.length) return { disagreements: [] };
		// a NOT NULL violation the seeded rows never reach (a MERGE whose rows all match)
		if (/violates not-null constraint/.test(ours.error))
			return { skip: "data-dependent" };
		return {
			disagreements: [{ kind: "rejects", detail: `ours: ${ours.error}` }],
		};
	}
	return { disagreements: compareShapes(ours.analysis, server.observed) };
}

export function compareShapes(a: Analysis, o: Observed): Disagreement[] {
	const out: Disagreement[] = [];
	const ourCols = a.cols;
	const theirs = o.columns;
	if (ourCols.some((c) => c.star)) out.push(...compareByName(a, o));
	else if (ourCols.length === theirs.length) {
		ourCols.forEach((c, i) => {
			const t = theirs[i]!;
			if (c.name !== t.name)
				out.push({
					kind: "unsound",
					detail: `column ${i + 1}: name ${JSON.stringify(c.name)}, server ${JSON.stringify(t.name)}`,
				});
			const ot = typeName(c);
			if (ot !== t.type)
				out.push({
					kind: "unsound",
					detail: `column ${i + 1} ${JSON.stringify(t.name)}: type ${ot}, server ${t.type}`,
				});
		});
	} else {
		out.push({
			kind: "unsound",
			detail: `columns: ${ourCols.map((c) => `${c.name} ${typeName(c)}`).join(", ") || "none"}; server ${theirs.map((c) => `${c.name} ${c.type}`).join(", ") || "none"}`,
		});
	}
	if (!ourCols.some((c) => c.star) && ourCols.length === theirs.length) {
		const seen = new Set<number>();
		for (const row of o.rows) {
			ourCols.forEach((c, i) => {
				if (!c.nullable && row[i] === null) seen.add(i);
			});
		}
		for (const i of [...seen].sort((x, y) => x - y))
			out.push({
				kind: "unsound",
				detail: `column ${i + 1} ${JSON.stringify(ourCols[i]!.name)}: typed non-null, the server returned NULL`,
			});
	}
	const n = Math.max(a.max, o.params.length);
	for (let k = 1; k <= n; k++) {
		const ours = a.params[k];
		const theirs = o.params[k - 1];
		if (!ours || theirs === undefined) {
			out.push({
				kind: "unsound",
				detail: `$${k}: ${ours ? typeName(ours) : "absent"}, server ${theirs ?? "absent"}`,
			});
			continue;
		}
		const ot = typeName(ours);
		if (ot !== theirs)
			out.push({
				kind: "unsound",
				detail: `$${k}: type ${ot}, server ${theirs}`,
			});
	}
	return out;
}

const typeName = (t: AnalysisType): string => normalizeOurs(t.type);

/** An object type's key order is not the statement's: compare by name, duplicates collapsed as the drivers do (the last column wins). */
function compareByName(a: Analysis, o: Observed): Disagreement[] {
	const out: Disagreement[] = [];
	const ours = new Map(a.cols.map((c) => [c.name, c]));
	const theirs = new Map<string, { type: string; at: number }>();
	o.columns.forEach((c, at) => {
		theirs.set(c.name, { type: c.type, at });
	});
	const missing = [...theirs.keys()].filter((n) => !ours.has(n));
	const extra = [...ours.keys()].filter((n) => !theirs.has(n));
	if (missing.length || extra.length)
		out.push({
			kind: "unsound",
			detail: `columns by name: ${extra.length ? `ours only ${extra.join(", ")}` : ""}${missing.length && extra.length ? "; " : ""}${missing.length ? `server only ${missing.join(", ")}` : ""}`,
		});
	for (const [name, c] of ours) {
		const t = theirs.get(name);
		if (!t) continue;
		if (typeName(c) !== t.type)
			out.push({
				kind: "unsound",
				detail: `column ${JSON.stringify(name)}: type ${typeName(c)}, server ${t.type}`,
			});
		if (!c.nullable && o.rows.some((r) => r[t.at] === null))
			out.push({
				kind: "unsound",
				detail: `column ${JSON.stringify(name)}: typed non-null, the server returned NULL`,
			});
	}
	return out;
}
