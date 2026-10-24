#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { coverageFiles, root } from "./coverage-files.ts";
import { mergeReports, shardFiles } from "./stryker-shards.ts";

/** The parts of a Stryker mutation-testing report (mutation-testing-report-schema) read here. */
interface Position {
	line: number;
	column: number;
}
type MutantStatus =
	| "Killed"
	| "Survived"
	| "NoCoverage"
	| "CompileError"
	| "RuntimeError"
	| "Timeout"
	| "Ignored"
	| "Pending";
interface MutantResult {
	id: string;
	mutatorName: string;
	replacement: string;
	status: MutantStatus;
	location: { start: Position; end: Position };
}
interface MutationReport {
	schemaVersion: string;
	files: Record<
		string,
		{ language: string; source: string; mutants: MutantResult[] }
	>;
	testFiles?: Record<string, unknown>;
}
/** A mutant with its file (relative to the root) and that file's source. */
type Mutant = MutantResult & { file: string; source: string };

type Counts = ReturnType<typeof count>;
type Row = Counts & { score: number | null; coveredScore: number | null };
interface Shard {
	index: number;
	count: number;
}
/** reports/mutation/summary.json, as a --shard run writes it. */
interface ShardSummary {
	commit: string;
	seconds: number;
	shard: Shard;
	mutated: string[];
}

const reportDir = join(root, "reports", "mutation");
const incrementalFile = join(root, "reports", "stryker-incremental.json");
const usage =
	"Usage: pnpm mutate:runtime [--changed [--base <rev>]] [--shard <i>/<n>] [--incremental [--force]] [--concurrency <n>] [--no-run] [files…]\n" +
	"       pnpm mutate:runtime --merge <dir…>";

const args = process.argv.slice(2);
let changed = false;
let baseArg = process.env.BASE || "main";
let concurrency = 2;
let runStryker = true;
let shard: Shard | null = null;
let incremental = false;
let force = false;
let merge = false;
let mergedSeconds = 0;
const only: string[] = [];
for (let i = 0; i < args.length; i++) {
	const a = args[i]!;
	if (a === "--changed") changed = true;
	else if (a === "--base") baseArg = args[++i]!;
	else if (a === "--concurrency") concurrency = Number(args[++i]);
	else if (a === "--no-run") runStryker = false;
	else if (a === "--shard") {
		const m = /^(\d+)\/(\d+)$/.exec(args[++i] ?? "");
		if (!m || +m[1]! < 1 || +m[1]! > +m[2]!)
			fail(`--shard takes <i>/<n>, 1 <= i <= n\n${usage}`);
		shard = { index: +m[1]!, count: +m[2]! };
	} else if (a === "--incremental") incremental = true;
	else if (a === "--force") force = true;
	else if (a === "--merge") merge = true;
	else if (a === "--help" || a === "-h") {
		console.log(usage);
		process.exit(0);
	} else if (a.startsWith("-")) fail(`unknown option ${a}\n${usage}`);
	else only.push(a.replaceAll("\\", "/"));
}
if (!Number.isInteger(concurrency) || concurrency < 1)
	fail(`--concurrency must be a positive integer\n${usage}`);
if (changed && only.length) fail(`--changed takes no files\n${usage}`);
if (shard && (changed || only.length))
	fail(`--shard takes neither --changed nor files\n${usage}`);
if (force && !incremental) fail(`--force goes with --incremental\n${usage}`);
if (merge && (changed || shard || incremental || !only.length))
	fail(`--merge takes the shards' report directories only\n${usage}`);

const git = (...a: string[]) =>
	execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const runtime = new Set(coverageFiles());

const ranges = new Map<string, Array<[number, number]>>();
let mutate: string[];
if (merge) {
	mergeShards(only);
	runStryker = false;
	mutate = [...runtime];
} else if (changed) {
	let known = !/^0+$/.test(baseArg);
	try {
		if (known) git("rev-parse", "--verify", "--quiet", `${baseArg}^{commit}`);
	} catch {
		known = false;
	}
	if (!known) {
		console.log(
			`mutate:runtime: base ${baseArg} is not a known commit (new branch or force push); skipping.`,
		);
		process.exit(0);
	}
	const base = git("merge-base", baseArg, "HEAD").trim();
	for (const [file, lines] of changedLines(base))
		if (runtime.has(file) && lines.length) ranges.set(file, toRanges(lines));
	if (!ranges.size) {
		console.log(
			`mutate:runtime: no runtime source lines changed since ${base.slice(0, 7)}.`,
		);
		process.exit(0);
	}
	const unexplained = disabledWithoutReason();
	if (unexplained.length)
		fail(
			`a Stryker disable comment needs a reason (\`// Stryker disable next-line <mutator>: <reason>\`):\n  ${unexplained.join("\n  ")}`,
		);
	mutate = [...ranges].flatMap(([file, rs]) =>
		rs.map(([a, b]) => `${file}:${a}-${b}`),
	);
	console.log(
		`mutate:runtime: ${mutate.length} changed range(s) in ${ranges.size} file(s) since ${base.slice(0, 7)}:\n  ${mutate.join("\n  ")}`,
	);
} else {
	for (const f of only)
		if (!runtime.has(f))
			fail(`${f} is not a runtime source file (see scripts/coverage-files.ts)`);
	mutate = only.length
		? only
		: shard
			? shardFiles(
					[...runtime].map((f) => [f, statSync(join(root, f)).size]),
					shard,
				)
			: [...runtime];
	if (shard)
		console.log(
			`mutate:runtime: shard ${shard.index}/${shard.count}, ${mutate.length} file(s):\n  ${mutate.join("\n  ")}`,
		);
}

const started = Date.now();
if (runStryker) {
	const url = process.env.TYPESQL_PG_URL;
	if (!url)
		fail(
			"set TYPESQL_PG_URL: the DB suites need a Postgres server (a database per Stryker worker is created on it)",
		);
	await createWorkerDatabases(url, concurrency);
	rmSync(join(reportDir, "mutation.json"), { force: true });
	const more = incremental
		? [
				"--incremental",
				"--incrementalFile",
				relative(root, incrementalFile),
				...(force ? ["--force"] : []),
			]
		: [];
	if (incremental)
		console.log(
			`mutate:runtime: incremental${force ? " (forced)" : ""}, ${existsSync(incrementalFile) ? "from" : "no previous results at"} ${relative(root, incrementalFile)}`,
		);
	const run = spawnSync(
		"pnpm",
		[
			"exec",
			"stryker",
			"run",
			"stryker.config.ts",
			"--concurrency",
			String(concurrency),
			...more,
		],
		{
			cwd: root,
			stdio: "inherit",
			env: {
				...process.env,
				TYPESQL_MUTATE: mutate.join("\n"),
				TYPESQL_REQUIRE_DB: "1",
			},
		},
	);
	if (run.status !== 0)
		fail(
			`Stryker failed (exit ${run.status ?? run.signal}) after ${Math.round((Date.now() - started) / 1000)} s`,
		);
}
let seconds = Math.round((Date.now() - started) / 1000);
if (merge) seconds = mergedSeconds;
if (!existsSync(join(reportDir, "mutation.json")))
	fail(`no report at ${relative(root, reportDir)}/mutation.json`);

const report = JSON.parse(
	readFileSync(join(reportDir, "mutation.json"), "utf8"),
) as MutationReport;
// an incremental report also carries the previous results of the files this run did not mutate
const mutated = new Set(mutate.map((m) => m.replace(/:\d+(-\d+)?$/, "")));
const mutants = Object.entries(report.files).flatMap(([file, f]): Mutant[] => {
	const rel = relative(root, join(root, file)).replaceAll("\\", "/");
	return mutated.has(rel)
		? f.mutants.map((m) => ({ ...m, file: rel, source: f.source }))
		: [];
});

if (changed) {
	// Stryker mutates only mutants inside the ranges; keep that explicit in case it widens them.
	const inRange = mutants.filter((m) =>
		(ranges.get(m.file) ?? []).some(
			([a, b]) => m.location.start.line >= a && m.location.end.line <= b,
		),
	);
	const bad = inRange.filter(
		(m) => m.status === "Survived" || m.status === "NoCoverage",
	);
	const counts = count(inRange);
	console.log(
		`\nmutate:runtime --changed: ${inRange.length} mutant(s) on changed lines in ${seconds} s: ${fmtCounts(counts)}.`,
	);
	summary(
		`### Runtime mutation testing (changed lines)\n\n${inRange.length} mutants, ${fmtCounts(counts)}, ${seconds} s.\n${bad.length ? `\n${bad.map((m) => `- \`${m.file}:${m.location.start.line}\` ${m.status}: ${m.mutatorName} → \`${oneLine(m.replacement)}\``).join("\n")}\n` : ""}`,
	);
	if (bad.length) {
		console.error(
			`\n${bad.length} mutant(s) on changed lines were not killed by any test:\n`,
		);
		for (const m of bad)
			console.error(
				`  ${m.file}:${m.location.start.line}:${m.location.start.column} ${m.status} ${m.mutatorName}\n    ${oneLine(original(m))}\n    -> ${oneLine(m.replacement)}`,
			);
		console.error(
			"\nAdd a test that fails with the mutant in place. If the mutant cannot change behaviour (an equivalent mutant), put\n" +
				"  // Stryker disable next-line <mutator>: <reason>\non the line above it.",
		);
		process.exit(1);
	}
} else {
	const byPackage = new Map<string, Mutant[]>();
	const byFile = new Map<string, Mutant[]>();
	for (const m of mutants) {
		const pkg = m.file.split("/")[1]!;
		for (const [map, key] of [
			[byPackage, pkg],
			[byFile, m.file],
		] as const) {
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(m);
		}
	}
	const row = (ms: Mutant[]): Row => {
		const c = count(ms);
		return {
			...c,
			score: score(c),
			coveredScore: score({ ...c, noCoverage: 0 }),
		};
	};
	const result = {
		date: new Date().toISOString(),
		commit: git("rev-parse", "HEAD").trim(),
		seconds,
		...(shard ? { shard, mutated: mutate } : {}),
		...(merge ? { shards: only.length } : {}),
		total: row(mutants),
		packages: Object.fromEntries(
			[...byPackage].sort().map(([k, ms]) => [k, row(ms)]),
		),
		files: Object.fromEntries(
			[...byFile].sort().map(([k, ms]) => [k, row(ms)]),
		),
	};
	mkdirSync(reportDir, { recursive: true });
	writeFileSync(join(reportDir, "summary.json"), `${JSON.stringify(result)}\n`);
	const table = (title: string, entries: Array<[string, Row]>) =>
		`| ${title} | Score | Covered score | Killed | Timeout | Survived | No coverage | Ignored | Errors |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n` +
		entries
			.map(
				([k, r]) =>
					`| ${k} | ${pct(r.score)} | ${pct(r.coveredScore)} | ${r.killed} | ${r.timeout} | ${r.survived} | ${r.noCoverage} | ${r.ignored} | ${r.errors} |`,
			)
			.join("\n");
	const what = shard
		? `, shard ${shard.index}/${shard.count}`
		: merge
			? `, ${only.length} shards`
			: "";
	const md =
		`### Runtime mutation score (${result.commit.slice(0, 7)}${what}, ${Math.round(seconds / 60)} min)\n\n` +
		`${table("Package", [...Object.entries(result.packages), ["**total**", result.total]])}\n\n` +
		`<details><summary>Per file</summary>\n\n${table("File", Object.entries(result.files))}\n\n</details>\n`;
	writeFileSync(join(reportDir, "summary.md"), md);
	summary(md);
	console.log(
		`\n${md}\nmutate:runtime: reports in ${relative(root, reportDir)}/ (summary.json, summary.md, mutation.json, mutation.html).`,
	);
}

function mergeShards(dirs: string[]) {
	const shards = dirs.map((dir) => {
		const read = <T>(f: string): T | null =>
			existsSync(join(dir, f))
				? (JSON.parse(readFileSync(join(dir, f), "utf8")) as T)
				: null;
		const summary = read<ShardSummary>("mutation/summary.json");
		const report = read<MutationReport>("mutation/mutation.json");
		if (!summary?.shard || !report)
			fail(
				`${dir} is not a shard's reports/ directory (needs mutation/summary.json from --shard and mutation/mutation.json)`,
			);
		return {
			dir,
			summary,
			report,
			incremental: read<MutationReport>("stryker-incremental.json"),
		};
	});
	const count = shards[0]!.summary.shard.count;
	const indexes = shards
		.map((s) => s.summary.shard.index)
		.sort((a, b) => a - b);
	if (
		shards.some((s) => s.summary.shard.count !== count) ||
		indexes.join() !== Array.from({ length: count }, (_, i) => i + 1).join()
	)
		fail(
			`--merge needs the reports of shards 1..${count} once each, got ${indexes.join(", ")} of ${count}`,
		);
	if (new Set(shards.map((s) => s.summary.commit)).size > 1)
		fail("--merge: the shards ran on different commits");
	const owner = new Map(
		shards.flatMap((s) => s.summary.mutated.map((f) => [f, s])),
	);
	const missing = [...runtime].filter((f) => !owner.has(f));
	if (missing.length) fail(`--merge: no shard mutated ${missing.join(", ")}`);
	// -1, no shard, for a file none of them mutated
	const ownerOf = (file: string) =>
		shards.indexOf(
			owner.get(relative(root, join(root, file)).replaceAll("\\", "/"))!,
		);
	const combine = (
		pick: (s: (typeof shards)[number]) => MutationReport | null,
	) => {
		const reports = shards.map(pick);
		return reports.some((r) => !r)
			? null
			: mergeReports(reports as MutationReport[], ownerOf);
	};
	mkdirSync(reportDir, { recursive: true });
	writeFileSync(
		join(reportDir, "mutation.json"),
		JSON.stringify(combine((s) => s.report)),
	);
	const inc = combine((s) => s.incremental);
	if (inc) writeFileSync(incrementalFile, JSON.stringify(inc));
	else rmSync(incrementalFile, { force: true });
	mergedSeconds = Math.max(...shards.map((s) => s.summary.seconds));
	console.log(
		`mutate:runtime: merged ${count} shards${inc ? ", and their incremental results," : ""} into ${relative(root, reportDir)}/mutation.json`,
	);
}

function fail(message: string): never {
	console.error(`mutate:runtime: ${message}`);
	process.exit(1);
}

function changedLines(base: string) {
	const out = new Map<string, number[]>();
	let file: string | undefined;
	for (const line of git(
		"diff",
		"--unified=0",
		"--no-color",
		"--no-ext-diff",
		base,
		"--",
	).split("\n")) {
		if (line.startsWith("+++ ")) {
			file = line === "+++ /dev/null" ? undefined : line.slice(6);
			if (file !== undefined && !out.has(file)) out.set(file, []);
		} else if (file !== undefined && line.startsWith("@@")) {
			const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)!;
			const start = Number(m[1]);
			const n = m[2] === undefined ? 1 : Number(m[2]);
			for (let i = 0; i < n; i++) out.get(file)!.push(start + i);
		}
	}
	for (const file of git("ls-files", "--others", "--exclude-standard")
		.split("\n")
		.filter(Boolean)) {
		if (!runtime.has(file)) continue;
		const n = readFileSync(join(root, file), "utf8").split("\n").length;
		out.set(
			file,
			Array.from({ length: n }, (_, i) => i + 1),
		);
	}
	return out;
}

function toRanges(lines: number[]) {
	const sorted = [...new Set(lines)].sort((a, b) => a - b);
	const rs: Array<[number, number]> = [];
	for (const l of sorted) {
		const last = rs.at(-1);
		if (last && l === last[1] + 1) last[1] = l;
		else rs.push([l, l]);
	}
	return rs;
}

function disabledWithoutReason() {
	const found: string[] = [];
	for (const [file, rs] of ranges) {
		const text = readFileSync(join(root, file), "utf8").split("\n");
		for (const [a, b] of rs)
			for (let l = a; l <= b; l++) {
				const m = /Stryker disable\b[^:]*(:\s*\S)?/.exec(text[l - 1] ?? "");
				if (m && !m[1]) found.push(`${file}:${l}: ${text[l - 1]!.trim()}`);
			}
	}
	return found;
}

/** The part of `pg`'s Client used here. */
type PgClient = new (config: {
	connectionString: string;
}) => {
	connect(): Promise<void>;
	query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
	end(): Promise<void>;
};

async function createWorkerDatabases(url: string, n: number) {
	const { Client }: { Client: PgClient } = createRequire(
		join(root, "packages/core/package.json"),
	)("pg");
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		for (let i = 0; i < n; i++) {
			const name = `typesql_stryker_${i}`;
			const { rowCount } = await client.query(
				"SELECT 1 FROM pg_database WHERE datname = $1",
				[name],
			);
			if (!rowCount) await client.query(`CREATE DATABASE ${name}`);
		}
	} finally {
		await client.end();
	}
}

function count(ms: Mutant[]) {
	const c = {
		killed: 0,
		timeout: 0,
		survived: 0,
		noCoverage: 0,
		ignored: 0,
		errors: 0,
	};
	for (const m of ms) {
		if (m.status === "Killed") c.killed++;
		else if (m.status === "Timeout") c.timeout++;
		else if (m.status === "Survived") c.survived++;
		else if (m.status === "NoCoverage") c.noCoverage++;
		else if (m.status === "Ignored") c.ignored++;
		else c.errors++;
	}
	return c;
}

function score(c: Counts) {
	const valid = c.killed + c.timeout + c.survived + c.noCoverage;
	return valid ? ((c.killed + c.timeout) / valid) * 100 : null;
}

function pct(n: number | null) {
	return n === null ? "n/a" : `${n.toFixed(1)}%`;
}

function fmtCounts(c: Counts) {
	return `${c.killed} killed, ${c.timeout} timed out, ${c.survived} survived, ${c.noCoverage} without coverage, ${c.ignored} ignored`;
}

function oneLine(s: string) {
	return s.replace(/\s*\n\s*/g, " ").slice(0, 160);
}

function original(m: Mutant) {
	const lines = m.source.split("\n");
	const { start, end } = m.location;
	if (start.line === end.line)
		return lines[start.line - 1]!.slice(start.column - 1, end.column - 1);
	return [
		lines[start.line - 1]!.slice(start.column - 1),
		...lines.slice(start.line, end.line - 1),
		lines[end.line - 1]!.slice(0, end.column - 1),
	].join("\n");
}

function summary(md: string) {
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}
