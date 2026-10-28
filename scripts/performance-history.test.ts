import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function measurement(time = 1) {
	const results = ["case1", "case1d", "case1c", "case1s"].map((name) => ({
		name,
		exitCode: 0,
		checkTimeSec: name === "case1c" ? time / 4 : time,
		instantiations: 1000,
		errorCount: 0,
		otherErrorCount: 0,
	}));
	return {
		measuredAt: "2026-10-28T00:00:00.000Z",
		workload: { file: "src/case1.ts", statements: 379 },
		environment: { node: "v26.8.1", cpu: "test CPU", cpus: 4 },
		compilerVersions: { tsrs: "test tsrs", tsc: "test tsc" },
		runs: 3,
		results: { tsrs: results, tsc: structuredClone(results) },
		throughput: {
			tsrs: { instantiationsPerQuery: 3, checkMsPerQuery: 2.64 },
			tsc: { checkMsPerQuery: 2.64 },
		},
		cache: { cachedRatio: 0.25, staleRatio: 1 },
	};
}

function fixture(version = "0.7.5") {
	const directory = mkdtempSync(join(tmpdir(), "typesql-history-test-"));
	directories.push(directory);
	const write = (file: string, value: unknown) => {
		writeFileSync(join(directory, file), JSON.stringify(value));
	};
	for (const dir of [
		"packages/core",
		"packages/bench",
		"packages/docs/.vitepress",
	]) {
		mkdirSync(join(directory, dir), { recursive: true });
	}
	const old = {
		case1: { statements: 379, checkTimeSec: 99, cachedCheckTimeSec: 98 },
	};
	const current = measurement();
	const all = {
		measuredAt: current.measuredAt,
		environment: structuredClone(current.environment),
		compilerVersions: structuredClone(current.compilerVersions),
		workload: structuredClone(current.workload),
		runs: current.runs,
		releases: ["0.7.1", "0.7.2", "0.7.3", "0.7.4", "0.7.5"].map((v) => ({
			version: v,
			ref: `@typesql/core@${v}`,
			sha: "test revision",
			benchmark: measurement(2),
		})),
	};
	write("packages/core/package.json", { version });
	write("packages/bench/history.json", {
		"0.6.0": old,
		"0.7.1": old,
		"0.7.5": old,
	});
	write("packages/bench/results.json", current);
	write("packages/bench/runtime-results.json", {
		workload: current.workload,
		microsecondsPerQuery: 3,
		millisecondsPerWorkload: 1.14,
	});
	writeFileSync(
		join(directory, "README.md"),
		[
			"Introduction",
			"<!-- performance-summary:start -->old<!-- performance-summary:end -->",
			"<!-- performance-history:start -->old<!-- performance-history:end -->",
		].join("\n"),
	);
	const run = (...args: string[]) => {
		write("packages/bench/history-results.json", all);
		return execFileSync(
			process.execPath,
			[join(import.meta.dirname, "performance-history.ts"), ...args],
			{ cwd: directory, stdio: "pipe" },
		);
	};
	const read = (file: string) => readFileSync(join(directory, file), "utf8");
	return { all, run, read };
}

test("replaces the complete history and renders consistent chart and docs numbers", () => {
	const { run, read } = fixture();
	run("--refresh-all");
	const history = JSON.parse(read("packages/bench/history.json"));
	expect(Object.keys(history)).toEqual([
		"0.7.1",
		"0.7.2",
		"0.7.3",
		"0.7.4",
		"0.7.5",
	]);
	expect(history["0.7.1"].case1.checkTimeSec).toBe(2);
	expect(history["0.7.5"].case1.checkTimeSec).toBe(1);
	expect(read("README.md")).toContain("line [2, 2, 2, 2, 1]");
	expect(read("README.md")).toContain("line [0.5, 0.5, 0.5, 0.5, 0.25]");
	expect(read("README.md")).toContain("Introduction");
	expect(
		JSON.parse(read("packages/docs/.vitepress/benchmarks.json")).rows.case1d
			.tsrs,
	).toBe(1);
	const first = read("packages/bench/history.json");
	run("--refresh-all");
	expect(read("packages/bench/history.json")).toBe(first);
});

test("a release version bump retains the previous release's measured point", () => {
	const { run, read } = fixture("0.7.6");
	run("--refresh-all");
	const history = JSON.parse(read("packages/bench/history.json"));
	expect(history["0.7.5"].case1.checkTimeSec).toBe(2);
	expect(history["0.7.6"].case1.checkTimeSec).toBe(1);
});

test.each([
	"stale run",
	"different CPU",
	"different compiler",
	"different workload",
	"different repetitions",
	"failed check",
	"missing variant",
	"duplicate version",
	"no releases",
])("rejects %s without replacing the published files", (problem) => {
	const { all, run, read } = fixture();
	const release = all.releases[0]!;
	if (problem === "stale run") all.measuredAt = "2020-01-01T00:00:00.000Z";
	if (problem === "different CPU")
		release.benchmark.environment.cpu = "other CPU";
	if (problem === "different compiler")
		release.benchmark.compilerVersions.tsrs = "other compiler";
	if (problem === "different workload")
		release.benchmark.workload.statements = 1;
	if (problem === "different repetitions") release.benchmark.runs = 1;
	if (problem === "failed check")
		release.benchmark.results.tsc[0]!.exitCode = 2;
	if (problem === "missing variant") release.benchmark.results.tsrs.pop();
	if (problem === "duplicate version")
		all.releases.push(structuredClone(release));
	if (problem === "no releases") all.releases = [];
	const before = [read("README.md"), read("packages/bench/history.json")];
	expect(() => run("--refresh-all")).toThrow();
	expect([read("README.md"), read("packages/bench/history.json")]).toEqual(
		before,
	);
});

test("the existing renderer modes retain their history behavior", () => {
	const { run, read } = fixture();
	run();
	expect(
		JSON.parse(read("packages/bench/history.json"))["0.7.5"].case1.checkTimeSec,
	).toBe(99);
	run("--refresh");
	const history = JSON.parse(read("packages/bench/history.json"));
	expect(history["0.7.5"].case1.checkTimeSec).toBe(1);
	expect(history["0.7.1"].case1.checkTimeSec).toBe(99);
});
