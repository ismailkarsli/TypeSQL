#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { coverageFiles, root } from "./coverage-files.ts";

const KEYS = ["lines", "branches", "functions", "statements"] as const;
type Key = (typeof KEYS)[number];
/** Uncovered lines, branches, functions and statements of a file. */
type Uncovered = Partial<Record<Key, number>>;
const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--no-run" && a !== "--reset");
if (unknown.length) {
	console.error(
		`Unknown argument: ${unknown.join(" ")}\nUsage: pnpm coverage:ratchet [--no-run] [--reset]`,
	);
	process.exit(2);
}
const reset = args.includes("--reset");
const thresholdsFile = join(root, "coverage-thresholds.json");
const summaryFile = join(root, "coverage", "coverage-summary.json");

if (!args.includes("--no-run")) {
	// DB suites required: a skipped suite would make the measured numbers meaningless.
	const run = spawnSync("pnpm", ["exec", "vitest", "run", "--coverage"], {
		cwd: root,
		stdio: "inherit",
		env: {
			...process.env,
			TYPESQL_COVERAGE_RATCHET: "1",
			TYPESQL_REQUIRE_DB: "1",
		},
	});
	if (run.status !== 0) {
		console.error(
			"coverage:ratchet: the test run failed; thresholds unchanged.",
		);
		process.exit(1);
	}
}
if (!existsSync(summaryFile)) {
	console.error(
		`coverage:ratchet: ${relative(root, summaryFile)} not found; run without --no-run.`,
	);
	process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryFile, "utf8")) as Record<
	string,
	Record<Key, { total: number; covered: number }>
>;
const measured = new Map<string, Record<Key, number>>();
for (const [file, s] of Object.entries(summary)) {
	if (file === "total") continue;
	measured.set(
		relative(root, file).replaceAll("\\", "/"),
		Object.fromEntries(
			KEYS.map((k) => [k, s[k].total - s[k].covered]),
		) as Record<Key, number>,
	);
}

const current = JSON.parse(readFileSync(thresholdsFile, "utf8")) as {
	uncovered: Record<string, Uncovered>;
};
const before = current.uncovered;
const after: Record<string, Uncovered> = {};
const changes: string[] = [];
for (const file of coverageFiles()) {
	const m = measured.get(file);
	if (!m) {
		console.error(
			`coverage:ratchet: no coverage for ${file}; is it in the coverage include list?`,
		);
		process.exit(1);
	}
	const old = before[file] ?? {};
	const next: Uncovered = {};
	for (const k of KEYS) {
		const value = reset ? m[k] : Math.min(old[k] ?? 0, m[k]);
		if (value !== (old[k] ?? 0))
			changes.push(`${file} ${k}: ${old[k] ?? 0} -> ${value}`);
		if (value > 0) next[k] = value;
	}
	if (Object.keys(next).length) after[file] = next;
}
for (const file of Object.keys(before))
	if (!(file in after) && !coverageFiles().includes(file))
		changes.push(`${file}: removed (file gone)`);

writeFileSync(
	thresholdsFile,
	`${JSON.stringify({ ...current, uncovered: after })}\n`,
);
console.log(
	changes.length
		? `coverage:ratchet: ${changes.length} change(s):\n  ${changes.join("\n  ")}`
		: "coverage:ratchet: no change.",
);
