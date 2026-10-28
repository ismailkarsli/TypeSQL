// Save CI measurements for VitePress and render GitHub's README from the same data.
// --refresh replaces the current version's history entry when rerunning benchmarks on demand.
// --refresh-all replaces the entire history with releases measured together by bench/history.ts.
import { readFileSync, writeFileSync } from "node:fs";

const historyPath = "packages/bench/history.json";
interface HistoryEntry {
	case1: {
		statements: number;
		checkTimeSec: number;
		cachedCheckTimeSec: number;
	};
}
let history: Record<string, HistoryEntry> = JSON.parse(
	readFileSync(historyPath, "utf8"),
);
const { version } = JSON.parse(
	readFileSync("packages/core/package.json", "utf8"),
);
const measurements = JSON.parse(
	readFileSync("packages/bench/results.json", "utf8"),
);
const {
	results,
	throughput,
	cache,
	workload,
	measuredAt,
	environment,
	compilerVersions,
} = measurements;

interface HistoryBenchmark {
	workload: { file: string; statements: number };
	results: Record<
		string,
		{
			name: string;
			exitCode: number | null;
			checkTimeSec: number | null;
			instantiations: number | null;
			errorCount: number;
			otherErrorCount: number;
		}[]
	>;
}
function entryFor(data: HistoryBenchmark): HistoryEntry {
	if (
		data.workload?.file !== "src/case1.ts" ||
		!(data.workload.statements > 0)
	) {
		throw new Error("Missing case1 application benchmark metadata");
	}
	for (const compiler of ["tsrs", "tsc"]) {
		for (const name of [
			"case1",
			"case1 cached",
			"case1 stale",
			"case1 source",
		]) {
			const result = data.results[compiler]?.find((r) => r.name === name);
			if (
				result?.exitCode !== 0 ||
				result.checkTimeSec == null ||
				result.checkTimeSec <= 0 ||
				!Number.isFinite(result.checkTimeSec) ||
				result.instantiations == null ||
				result.instantiations <= 0 ||
				!Number.isFinite(result.instantiations) ||
				result.errorCount !== 0 ||
				result.otherErrorCount !== 0
			) {
				throw new Error(
					`Missing successful ${compiler} ${name} benchmark result`,
				);
			}
		}
	}
	const get = (name: string) => {
		const time = data.results.tsrs?.find((r) => r.name === name)?.checkTimeSec;
		if (time == null) throw new Error(`Missing tsrs ${name} check time`);
		return time;
	};
	return {
		case1: {
			statements: data.workload.statements,
			checkTimeSec: get("case1"),
			cachedCheckTimeSec: get("case1 cached"),
		},
	};
}
const entry = entryFor(measurements);
if (process.argv.includes("--refresh-all")) {
	const all = JSON.parse(
		readFileSync("packages/bench/history-results.json", "utf8"),
	);
	for (const key of [
		"measuredAt",
		"environment",
		"compilerVersions",
		"workload",
		"runs",
	]) {
		if (JSON.stringify(all[key]) !== JSON.stringify(measurements[key])) {
			throw new Error(
				`History and current benchmarks must come from the same run (${key})`,
			);
		}
	}
	if (!Array.isArray(all.releases) || all.releases.length === 0) {
		throw new Error("Missing historical benchmark results");
	}
	history = {};
	for (const release of all.releases) {
		for (const key of ["environment", "compilerVersions", "workload", "runs"]) {
			if (JSON.stringify(release.benchmark[key]) !== JSON.stringify(all[key])) {
				throw new Error(
					`Incompatible history benchmark for ${release.version} (${key})`,
				);
			}
		}
		if (history[release.version])
			throw new Error(`Duplicate history version ${release.version}`);
		history[release.version] = entryFor(release.benchmark);
	}
	history[version] = entry;
} else if (process.argv.includes("--refresh")) history[version] = entry;
else history[version] ??= entry;

const runtime = JSON.parse(
	readFileSync("packages/bench/runtime-results.json", "utf8"),
);
if (
	runtime.workload?.file !== workload.file ||
	runtime.workload?.statements !== workload.statements ||
	!Number.isFinite(runtime.microsecondsPerQuery) ||
	runtime.microsecondsPerQuery <= 0
) {
	throw new Error("Runtime measurements must use the same case1 workload");
}
const compact = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumSignificantDigits: 3,
});
const bench = {
	date: measuredAt.slice(0, 10),
	version,
	workload,
	environment,
	compilers: compilerVersions,
	throughput,
	cache,
	instantiationsPerQuery: compact.format(
		throughput.tsrs.instantiationsPerQuery,
	),
	speedup: Number(
		(throughput.tsc.checkMsPerQuery / throughput.tsrs.checkMsPerQuery).toFixed(
			1,
		),
	),
	rows: Object.fromEntries(
		results.tsrs.map(
			(r: { name: string; instantiations: number; checkTimeSec: number }) => [
				r.name,
				{
					instantiations: compact.format(r.instantiations),
					tsrs: r.checkTimeSec,
					tsc: results.tsc.find((t: { name: string }) => t.name === r.name)
						.checkTimeSec,
				},
			],
		),
	),
	runtime: {
		microsecondsPerQuery: runtime.microsecondsPerQuery.toFixed(2),
		millisecondsPerWorkload: runtime.millisecondsPerWorkload.toFixed(2),
	},
};
const summary = [
	"<!-- performance-summary:start -->",
	`The [real-world application workload](packages/bench/src/case1.ts) contains ${workload.statements} statements and reusable SQL fragments. Average check time per statement, including schema and fragment checking: ${throughput.tsc.checkMsPerQuery} ms with \`tsc\` and ${throughput.tsrs.checkMsPerQuery} ms with [tsrs](https://github.com/oxc-project/tsrs).`,
	"",
	"| Application workload | `tsc` | tsrs |",
	"|---|---|---|",
	`| \`case1\` | ${bench.rows.case1.tsc} s | ${bench.rows.case1.tsrs} s |`,
	`| [\`case1 cached\`](https://typesql.karsli.net/guide/performance#type-cache) | ${bench.rows["case1 cached"].tsc} s | ${bench.rows["case1 cached"].tsrs} s |`,
	"<!-- performance-summary:end -->",
].join("\n");
const releases = Object.entries(history).sort(([a], [b]) =>
	a.localeCompare(b, "en", { numeric: true }),
);
const chart = [
	"<!-- performance-history:start -->",
	"Lines: 🔵 Uncached · 🟢 Cached. tsrs check time for the case1 application workload, remeasured for all versions in one CI job.",
	"",
	"```mermaid",
	'%%{init: {"themeVariables": {"xyChart": {"plotColorPalette": "#2563eb,#16a34a"}}}}%%',
	"xychart-beta",
	'    title "tsrs - real-world case1"',
	`    x-axis "Core version" [${releases.map(([v]) => JSON.stringify(v)).join(", ")}]`,
	`    y-axis "Check time (seconds, lower is faster)" 0 --> ${Math.ceil(Math.max(...releases.flatMap(([, times]) => [times.case1.checkTimeSec, times.case1.cachedCheckTimeSec])) * 11) / 10}`,
	`    line [${releases.map(([, times]) => times.case1.checkTimeSec).join(", ")}]`,
	`    line [${releases.map(([, times]) => times.case1.cachedCheckTimeSec).join(", ")}]`,
	"```",
	"<!-- performance-history:end -->",
].join("\n");
const readme = readFileSync("README.md", "utf8")
	.replace(
		/<!-- performance-summary:start -->[\s\S]*?<!-- performance-summary:end -->/,
		summary,
	)
	.replace(
		/<!-- performance-history:start -->[\s\S]*?<!-- performance-history:end -->/,
		chart,
	);
writeFileSync(historyPath, `${JSON.stringify(history, null, "\t")}\n`);
writeFileSync(
	"packages/docs/.vitepress/benchmarks.json",
	`${JSON.stringify(bench, null, "\t")}\n`,
);
writeFileSync("README.md", readme);
