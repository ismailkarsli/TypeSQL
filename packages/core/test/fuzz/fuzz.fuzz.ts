import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Database } from "../conformance/db.js";
import {
	compareBaseline,
	type Entries,
	hashOf,
	missingIssues,
	preview,
	readBaseline,
	showEntries,
	withIssues,
	writeBaseline,
} from "../oracle/baseline.js";
import { NEEDS_ISSUE } from "../oracle/kinds.js";
import { acquireOracleServer } from "../oracle/server.js";
import { fuzz, type Property } from "./run.js";

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
		expect(
			report.failures
				.map((f) => `[${f.property}] ${f.sql}\n    ${f.detail}`)
				.join("\n"),
		).toBe("");
		return;
	}
	const baseline = readBaseline(baselinePath, "failing");
	const current = withIssues(entries, baseline?.entries ?? {}, NEEDS_ISSUE);
	if (process.env["TYPESQL_FUZZ_UPDATE"] === "1") {
		writeBaseline(baselinePath, { seed, runs }, "failing", current);
		console.log(`Wrote ${relative(root, baselinePath)}`);
		return;
	}
	const failures: string[] = [];
	if (!baseline || !existsSync(baselinePath))
		failures.push(
			`No baseline. Run \`pnpm fuzz --update\` to create ${relative(root, baselinePath)}.`,
		);
	else {
		const { added, fixed } = compareBaseline(current, baseline.entries);
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
		const noIssue = missingIssues(baseline.entries, NEEDS_ISSUE);
		if (noIssue.length)
			failures.push(
				`${noIssue.length} unsound entr(y/ies) without an issue:\n${show(noIssue)}`,
			);
	}
	expect(failures.join("\n\n")).toBe("");
});
