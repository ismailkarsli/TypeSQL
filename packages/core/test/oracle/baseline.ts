/** test/pg-regress/run.ts loads this file through Node's type stripping: erasable syntax and Node built-ins only. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface BaselineEntry {
	readonly kind: string;
	readonly hash: string;
	readonly issue?: number | "pending";
	readonly [field: string]: unknown;
}

export type Entries = { [group: string]: BaselineEntry[] };

export interface Baseline {
	readonly pins: { readonly [key: string]: unknown };
	readonly entries: Entries;
}

export type Located = BaselineEntry & { readonly group: string };

export const keyOf = (group: string, e: BaselineEntry): string =>
	`${group} ${e.kind} ${e.hash}`;

export const hashOf = (text: string): string =>
	createHash("sha256").update(text).digest("hex").slice(0, 16);

export function preview(text: string, max = 120): string {
	const flat = text.replace(/\s+/g, " ");
	return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

export function readBaseline(
	path: string,
	entriesKey: string,
): Baseline | null {
	if (!existsSync(path)) return null;
	const json = JSON.parse(readFileSync(path, "utf8")) as {
		[key: string]: unknown;
	};
	const pins: { [key: string]: unknown } = {};
	for (const [k, v] of Object.entries(json)) if (k !== entriesKey) pins[k] = v;
	return { pins, entries: (json[entriesKey] ?? {}) as Entries };
}

export function minus(a: Entries, b: Entries): Located[] {
	const counts = new Map<string, number>();
	for (const [group, list] of Object.entries(b))
		for (const e of list)
			counts.set(keyOf(group, e), (counts.get(keyOf(group, e)) ?? 0) + 1);
	const left: Located[] = [];
	for (const [group, list] of Object.entries(a)) {
		for (const e of list) {
			const k = keyOf(group, e);
			const n = counts.get(k) ?? 0;
			if (n) counts.set(k, n - 1);
			else left.push({ group, ...e });
		}
	}
	return left;
}

export function compareBaseline(
	current: Entries,
	expected: Entries,
): { added: Located[]; fixed: Located[] } {
	return { added: minus(current, expected), fixed: minus(expected, current) };
}

export function scoped(
	entries: Entries,
	keep: (group: string) => boolean,
): Entries {
	return Object.fromEntries(Object.entries(entries).filter(([g]) => keep(g)));
}

export function missingIssues(
	entries: Entries,
	kinds: ReadonlySet<string>,
): Located[] {
	const out: Located[] = [];
	for (const [group, list] of Object.entries(entries)) {
		for (const e of list)
			if (
				kinds.has(e.kind) &&
				!(typeof e.issue === "number" || e.issue === "pending")
			)
				out.push({ group, ...e });
	}
	return out;
}

export function withIssues(
	current: Entries,
	previous: Entries,
	kinds: ReadonlySet<string>,
): Entries {
	const issues = new Map<string, (number | "pending")[]>();
	for (const [group, list] of Object.entries(previous)) {
		for (const e of list)
			if (e.issue !== undefined)
				(
					issues.get(keyOf(group, e)) ??
					issues.set(keyOf(group, e), []).get(keyOf(group, e))!
				).push(e.issue);
	}
	const out: Entries = {};
	for (const [group, list] of Object.entries(current)) {
		out[group] = list.map((e) => {
			if (!kinds.has(e.kind)) return e;
			const issue =
				issues.get(keyOf(group, e))?.shift() ?? e.issue ?? "pending";
			return { ...e, issue };
		});
	}
	return out;
}

export function sortedEntries(entries: Entries): Entries {
	return Object.fromEntries(
		Object.keys(entries)
			.filter((g) => entries[g]?.length)
			.sort()
			.map((g) => [g, entries[g]!]),
	);
}

/** On one line: the file is generated (read it with `jq`). */
export function writeBaseline(
	path: string,
	pins: { readonly [key: string]: unknown },
	entriesKey: string,
	entries: Entries,
): void {
	writeFileSync(
		path,
		`${JSON.stringify({ ...pins, [entriesKey]: sortedEntries(entries) })}\n`,
	);
}

export function showEntries(
	list: readonly Located[],
	describe: (e: Located) => string,
	limit = 50,
): string {
	const lines = list.slice(0, limit).map(describe);
	if (list.length > limit) lines.push(`  … and ${list.length - limit} more`);
	return lines.join("\n");
}
