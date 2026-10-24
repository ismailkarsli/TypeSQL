import { createHash } from "node:crypto";
import { matchesGlob } from "node:path";
import { MUTATORS, oneLine, type Range } from "./sites.ts";

export interface Position {
	line: number;
	column: number;
}

export interface Shard {
	index: number;
	count: number;
}

export interface Marker {
	mutators: string[] | null;
	reason: string;
}

export type SiteFilter = (file: string, lines: Iterable<number>) => boolean;

export interface KillMap {
	version: 1;
	updated: string | null;
	commit: string | null;
	// mutant id -> the test file that killed it last
	sites: Record<string, string>;
}

export interface MutantResult {
	id: string;
	file: string;
	line: number;
	column: number;
	mutator: string;
	scope?: string;
	description: string;
	original: string;
	mutated: string;
	status: Status;
	killedBy?: string;
}

export type Summary = Record<Status, number> & {
	total: number;
	score: number | null;
};

export interface Report<M extends MutantResult = MutantResult> {
	version: 1;
	tool?: "type-mutate";
	commit?: string | null;
	base?: string | null;
	mode: "full" | "changed" | "filtered";
	shard: Shard | null;
	project?: string;
	startedAt?: string;
	durationMs: number;
	files: string[];
	tests?: string[];
	summary: Summary;
	mutants: M[];
	// merged reports: all shards of a full run
	complete?: boolean;
}

export function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i++)
		if (text.charCodeAt(i) === 10) starts.push(i + 1);
	return starts;
}

export function position(starts: readonly number[], offset: number): Position {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid]! <= offset) lo = mid;
		else hi = mid - 1;
	}
	return { line: lo + 1, column: offset - starts[lo]! + 1 };
}

export function anchorLines(
	starts: readonly number[],
	anchors: readonly Range[],
): Set<number> {
	const lines = new Set<number>();
	for (const a of anchors) {
		const from = position(starts, a.start).line;
		const to = position(starts, Math.max(a.start, a.end - 1)).line;
		for (let l = from; l <= to; l++) lines.add(l);
	}
	return lines;
}

// Ids hash the edit, not its position, so edits elsewhere in the file keep them (and the kill map) stable.
export function assignIds(
	file: string,
	mutants: readonly {
		mutator: string;
		scope?: string | undefined;
		original: string;
		text: string;
	}[],
): string[] {
	const counts = new Map<string, number>();
	return mutants.map((m) => {
		const hash = createHash("sha1")
			.update(`${m.original}\0${m.text}`)
			.digest("hex")
			.slice(0, 10);
		const base = `${file}#${m.mutator}#${m.scope ?? "-"}#${hash}`;
		const n = counts.get(base) ?? 0;
		counts.set(base, n + 1);
		return n ? `${base}#${n}` : base;
	});
}

// A pure deletion marks the lines on both sides of the gap.
export function parseDiff(diff: string): Map<string, Set<number>> {
	const out = new Map<string, Set<number>>();
	let file: string | undefined;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ ")) {
			const p = line.slice(4).trim();
			file = p === "/dev/null" ? undefined : p.replace(/^b\//, "");
			if (file && !out.has(file)) out.set(file, new Set());
			continue;
		}
		const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (!h || !file) continue;
		const start = Number(h[1]);
		const count = h[2] === undefined ? 1 : Number(h[2]);
		const lines = out.get(file)!;
		if (count === 0) {
			lines.add(start);
			lines.add(start + 1);
		} else for (let l = start; l < start + count; l++) lines.add(l);
	}
	return out;
}

const MARKER =
	/\/\/\s*type-mutate:\s*equivalent\b([^–—]*?)\s*(?:–|—|\s-+)\s*(\S.*)$/;

export function equivalenceMarkers(text: string): Map<number, Marker> {
	const out = new Map<number, Marker>();
	text.split("\n").forEach((l, i) => {
		const m = MARKER.exec(l);
		if (!m) return;
		const names = m[1]!.split(/[\s,]+/).filter(Boolean);
		const unknown = names.filter((n) => !MUTATORS.includes(n));
		if (unknown.length) return;
		out.set(i + 1, {
			mutators: names.length ? names : null,
			reason: m[2]!.trim(),
		});
	});
	return out;
}

export function equivalence(
	markers: Map<number, Marker>,
	lines: Iterable<number>,
	mutator: string,
): string | undefined {
	for (const l of lines) {
		const mk = markers.get(l);
		if (mk && (!mk.mutators || mk.mutators.includes(mutator))) return mk.reason;
	}
	return undefined;
}

export function matchesFile(
	file: string,
	patterns: readonly string[],
): boolean {
	return patterns.some((p) =>
		/[*?{[]/.test(p)
			? matchesGlob(file, p)
			: file === p || file.endsWith(`/${p}`),
	);
}

export function parseSites(spec: string): SiteFilter {
	const entries = spec
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => {
			const m = /^(.*):(\d+)(?:-(\d+))?$/.exec(s);
			if (!m)
				throw new Error(
					`--sites: expected <file>:<line>[-<line>], got ${JSON.stringify(s)}`,
				);
			return { file: m[1]!, from: Number(m[2]), to: Number(m[3] ?? m[2]) };
		});
	return (file, lines) =>
		entries.some(
			(e) =>
				matchesFile(file, [e.file]) &&
				[...lines].some((l) => l >= e.from && l <= e.to),
		);
}

export function parseShard(spec?: string): Shard {
	const m = /^(\d+)\/(\d+)$/.exec(spec ?? "");
	if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2]))
		throw new Error(
			`--shard: expected i/n with 1 <= i <= n, got ${JSON.stringify(spec)}`,
		);
	return { index: Number(m[1]), count: Number(m[2]) };
}

// Every `count`-th mutant, so each shard gets every file and mutator.
export const inShard = (i: number, shard: Shard | null): boolean =>
	!shard || i % shard.count === shard.index - 1;

export function emptyKillMap(): KillMap {
	return { version: 1, updated: null, commit: null, sites: {} };
}

export function readKillMap(text: string): KillMap {
	try {
		const v = JSON.parse(text) as Partial<KillMap> | null;
		if (v && v.version === 1 && v.sites && typeof v.sites === "object")
			return v as KillMap;
	} catch {}
	return emptyKillMap();
}

export function updateKillMap(
	map: KillMap,
	mutants: readonly Pick<MutantResult, "id" | "status" | "killedBy">[],
	{
		commit,
		prune,
	}: { commit?: string | null | undefined; prune?: boolean | undefined } = {},
): KillMap {
	const sites: Record<string, string> = prune ? {} : { ...map.sites };
	for (const m of mutants) {
		if (m.status === "killed" && m.killedBy) sites[m.id] = m.killedBy;
		else delete sites[m.id];
	}
	return {
		version: 1,
		updated: new Date().toISOString(),
		commit: commit ?? map.commit,
		sites: Object.fromEntries(
			Object.entries(sites).sort(([a], [b]) => (a < b ? -1 : 1)),
		),
	};
}

export const idFile = (id: string): string => id.slice(0, id.indexOf("#"));

export class TestOrder {
	tests: readonly string[];
	index: Map<string, number>;
	sites: Record<string, string>;
	// kills per test, overall and per source file
	global: Map<string, number>;
	perFile: Map<string, Map<string, number>>;
	constructor(tests: readonly string[], killMap: KillMap) {
		this.tests = tests;
		this.index = new Map(tests.map((t, i) => [t, i]));
		this.sites = killMap.sites;
		this.global = new Map();
		this.perFile = new Map();
		for (const [id, test] of Object.entries(killMap.sites))
			if (this.index.has(test)) this.recordKill(idFile(id), test);
	}
	recordKill(file: string, test: string): void {
		this.global.set(test, (this.global.get(test) ?? 0) + 1);
		let m = this.perFile.get(file);
		if (!m) {
			m = new Map();
			this.perFile.set(file, m);
		}
		m.set(test, (m.get(test) ?? 0) + 1);
	}
	order(id: string, file: string): string[] {
		const local = this.perFile.get(file) ?? new Map<string, number>();
		const sorted = [...this.tests].sort(
			(a, b) =>
				(local.get(b) ?? 0) - (local.get(a) ?? 0) ||
				(this.global.get(b) ?? 0) - (this.global.get(a) ?? 0) ||
				this.index.get(a)! - this.index.get(b)!,
		);
		const first = this.sites[id];
		return first && this.index.has(first)
			? [first, ...sorted.filter((t) => t !== first)]
			: sorted;
	}
}

export function fallbackOrder(tests: readonly string[]): string[] {
	const rank = (t: string) =>
		t.endsWith(".test-d.ts") ? 0 : /\.test\.ts$/.test(t) ? 2 : 1;
	return [...tests].sort(
		(a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0),
	);
}

export const STATUSES = [
	"killed",
	"timeout",
	"survived",
	"equivalent",
	"invalid",
] as const;
export type Status = (typeof STATUSES)[number];

export function summarize(mutants: readonly { status: Status }[]): Summary {
	const s = Object.fromEntries(STATUSES.map((k) => [k, 0])) as Record<
		Status,
		number
	>;
	for (const m of mutants) s[m.status] = (s[m.status] ?? 0) + 1;
	const detected = s.killed + s.timeout;
	const valid = detected + s.survived;
	return {
		total: mutants.length,
		...s,
		score: valid ? Math.round((detected / valid) * 10000) / 100 : null,
	};
}

export function mergeReports(reports: readonly Report[]): Report {
	if (!reports.length) throw new Error("merge: no reports");
	const mutants = reports.flatMap((r) => r.mutants);
	const counts = new Set(reports.map((r) => r.shard?.count ?? 1));
	const indexes = new Set(reports.map((r) => r.shard?.index ?? 1));
	const count = [...counts][0];
	const complete =
		counts.size === 1 &&
		reports.every((r) => r.mode === "full") &&
		indexes.size === count &&
		reports.length === count;
	const first = reports[0]!;
	return {
		...first,
		shard: null,
		complete,
		durationMs: reports.reduce((a, r) => a + (r.durationMs ?? 0), 0),
		files: [...new Set(reports.flatMap((r) => r.files))].sort(),
		summary: summarize(mutants),
		mutants: mutants.sort((a, b) =>
			a.file < b.file
				? -1
				: a.file > b.file
					? 1
					: a.line - b.line || a.column - b.column,
		),
	};
}

export function markdownSummary(
	report: Report,
	{ maxSurvivors = 200 }: { maxSurvivors?: number } = {},
): string {
	const s = report.summary;
	const lines: string[] = [];
	const scope =
		report.mode === "changed"
			? ` (changed lines since \`${report.base?.slice(0, 12)}\`)`
			: report.shard
				? ` (shard ${report.shard.index}/${report.shard.count})`
				: "";
	lines.push(
		`### ${s.survived ? "❌" : "✅"} Type-level mutation testing${scope}`,
		"",
	);
	lines.push(
		`${s.total} mutants: ${s.killed} killed, ${s.timeout} timed out, **${s.survived} survived**, ${s.equivalent} marked equivalent, ${s.invalid} invalid (do not compile). Score: ${s.score ?? "–"}%.`,
		"",
	);
	const survivors = report.mutants.filter((m) => m.status === "survived");
	if (!survivors.length) return lines.join("\n") + "\n";
	const withSurvivors = new Set(survivors.map((m) => m.file));
	const byFile = new Map<string, MutantResult[]>();
	for (const m of report.mutants) {
		if (!withSurvivors.has(m.file)) continue;
		let f = byFile.get(m.file);
		if (!f) {
			f = [];
			byFile.set(m.file, f);
		}
		f.push(m);
	}
	lines.push(
		"| File | Mutants | Killed | Survived | Equivalent | Invalid | Score |",
		"|---|---:|---:|---:|---:|---:|---:|",
	);
	for (const [file, ms] of [...byFile].sort(([a], [b]) => (a < b ? -1 : 1))) {
		const f = summarize(ms);
		lines.push(
			`| \`${file}\` | ${f.total} | ${f.killed + f.timeout} | ${f.survived} | ${f.equivalent} | ${f.invalid} | ${f.score ?? "–"}% |`,
		);
	}
	lines.push("", "#### Survivors", "");
	for (const m of survivors.slice(0, maxSurvivors)) {
		const edit = `\`${oneLine(m.original, 80)}\` → \`${oneLine(m.mutated, 80) || "(removed)"}\``;
		lines.push(
			`- \`${m.file}:${m.line}:${m.column}\` **${m.mutator}**${m.scope && m.scope !== "-" ? ` in \`${m.scope}\`` : ""}: ${m.description.includes(edit) ? m.description : `${m.description}: ${edit}`}`,
		);
	}
	if (survivors.length > maxSurvivors)
		lines.push(
			`- … and ${survivors.length - maxSurvivors} more (see the report)`,
		);
	return lines.join("\n") + "\n";
}
