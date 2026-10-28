import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
	compareBaseline,
	type Entries,
	hashOf,
	preview,
	readBaseline,
	showEntries,
	writeBaseline,
} from "../oracle/baseline.js";
import type { Database } from "../oracle/db.js";
import { baselineProblems, counts, jobSummary } from "../oracle/job-summary.js";
import { readDb } from "../oracle/schema.js";
import { acquireOracleServer } from "../oracle/server.js";
import { Fuzzer, fuzz, type Property } from "./run.js";

const CI_SEED = 1;
const CI_RUNS = 2000;
const seed = Number(process.env["TYPESQL_FUZZ_SEED"] ?? CI_SEED);
const replayFile = process.env["TYPESQL_FUZZ_REPLAY"];
const runs = replayFile
	? 0
	: Number(process.env["TYPESQL_FUZZ_RUNS"] ?? CI_RUNS);
const isCiRun = !replayFile && seed === CI_SEED && runs === CI_RUNS;
const root = join(import.meta.dirname, "../../../..");
const baselinePath = join(import.meta.dirname, "baseline.json");

let server: Database | null = null;
beforeAll(async () => {
	server = await acquireOracleServer();
});
afterAll(async () => {
	await server?.close();
});

const kindOf = (p: Property): string =>
	p === "nulls" || p === "types" ? "unsound" : p;

test("fuzz: view-oracle candidates can use contrib types and TABLESAMPLE methods", async (ctx) => {
	if (!server) return ctx.skip("TYPESQL_ORACLE=skip");
	const db = readDb({
		t: { table: { value: { t: "citext", n: false, d: false } } },
	});
	const sqls = [
		"SELECT value FROM t",
		"SELECT value FROM t TABLESAMPLE SYSTEM_ROWS(1)",
		"SELECT value FROM t TABLESAMPLE SYSTEM_TIME(1)",
	];
	const fuzzer = new Fuzzer(server.url);
	try {
		const results = await fuzzer.checkCandidates(
			sqls.map((sql) => ({ sql, source: "extensions", db })),
			() => {},
		);
		expect(results.map((r) => r.checked.failures)).toEqual([[], [], []]);
	} finally {
		await fuzzer.close();
	}
});

test("fuzz: generated statements against Postgres", async (ctx) => {
	if (!server) return ctx.skip("TYPESQL_ORACLE=skip");
	const replay = replayFile
		? replayFile.endsWith(".sql")
			? [
					{
						sql: readFileSync(replayFile, "utf8").replace(/;\s*$/, "").trim(),
						key: replayFile,
					},
				]
			: (JSON.parse(readFileSync(replayFile, "utf8")) as {
					sql: string;
					key: string;
				}[])
		: [];
	const report = await fuzz(server.url, {
		seed,
		runs,
		shrink: Number(process.env["TYPESQL_FUZZ_SHRINK"] ?? 5),
		replay,
		log: (m) => console.log(m),
	});
	const ratio = report.nullRatio.nullable
		? ((100 * report.nullRatio.nulled) / report.nullRatio.nullable).toFixed(0)
		: "–";
	console.log(
		`fuzz: ${report.checked} statements, ${report.failing} failing ${JSON.stringify(report.counts)}; nullable output columns that returned a NULL: ${report.nullRatio.nulled}/${report.nullRatio.nullable} (${ratio}%); ${(report.ms / 1000).toFixed(0)} s`,
	);
	for (const r of report.replayed)
		console.log(
			`replayed ${r.key}: ${r.failing ? `still fails (${r.detail})` : "passes"}`,
		);
	if (process.env["TYPESQL_FUZZ_REPORT"])
		writeFileSync(
			process.env["TYPESQL_FUZZ_REPORT"],
			`${JSON.stringify(report)}\n`,
		);
	const line = `seed ${seed}: ${report.checked} statements · failing ${report.failing}${report.failing ? ` (${counts(report.counts, [])})` : ""} · nullable columns that returned a NULL ${report.nullRatio.nulled}/${report.nullRatio.nullable}`;
	if (replayFile) return;

	const entries: Entries = {};
	for (const f of report.failingStatements) {
		const group = f.source.startsWith("corpus/") ? f.source : `seed ${seed}`;
		entries[group] ??= [];
		entries[group].push({
			kind: kindOf(f.property),
			hash: hashOf(f.sql),
			property: f.property,
			detail: f.detail.slice(0, 300),
			sql: preview(f.sql),
		});
	}
	if (!isCiRun) {
		jobSummary(
			"fuzz",
			line,
			report.failing ? [`${report.failing} failing statement(s)`] : [],
		);
		expect(
			report.failures
				.map((f) => `[${f.property}] ${f.sql}\n    ${f.detail}`)
				.join("\n"),
		).toBe("");
		return;
	}
	const baseline = readBaseline(baselinePath, "failing");
	if (process.env["TYPESQL_FUZZ_UPDATE"] === "1") {
		writeBaseline(baselinePath, { seed, runs }, "failing", entries);
		console.log(`Wrote ${relative(root, baselinePath)}`);
		jobSummary("fuzz", line);
		return;
	}
	const failures: string[] = [];
	const problems: string[] = [];
	if (!baseline || !existsSync(baselinePath)) {
		problems.push("no baseline: run `pnpm fuzz --update`");
		failures.push(
			`No baseline. Run \`pnpm fuzz --update\` to create ${relative(root, baselinePath)}.`,
		);
	} else {
		const { added, fixed } = compareBaseline(entries, baseline.entries);
		problems.push(
			...baselineProblems(
				added,
				fixed,
				"pnpm fuzz --update",
				"failing statement(s)",
			),
		);
		const show = (l: Parameters<typeof showEntries>[0]) =>
			showEntries(
				l,
				(e) =>
					`  ${e.group}  [${String(e["property"])}]  ${String(e.sql)}\n      ${String(e.detail)}`,
			);
		if (added.length)
			failures.push(
				`${added.length} new failing statement(s):\n${show(added)}`,
			);
		if (fixed.length)
			failures.push(
				`${fixed.length} statement(s) in the baseline no longer fail (nice). Run \`pnpm fuzz --update\`:\n${show(fixed)}`,
			);
	}
	jobSummary("fuzz", line, problems);
	expect(failures.join("\n\n")).toBe("");
});
