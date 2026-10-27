// Save the release CI measurements for VitePress and render GitHub's README from the same data.
import { readFileSync, writeFileSync } from "node:fs";

const historyPath = "packages/bench/history.json";
interface HistoryEntry {
	case1: {
		statements: number;
		checkTimeSec: number;
		cachedCheckTimeSec: number;
	};
}
const history: Record<string, HistoryEntry> = JSON.parse(
	readFileSync(historyPath, "utf8"),
);
const { version } = JSON.parse(
	readFileSync("packages/core/package.json", "utf8"),
);
const {
	results,
	throughput,
	cache,
	workload,
	measuredAt,
	environment,
	compilerVersions,
} = JSON.parse(readFileSync("packages/bench/results.json", "utf8"));
if (workload?.file !== "src/case1.ts" || !(workload.statements > 0)) {
	throw new Error("Missing case1 application benchmark metadata");
}
for (const compiler of ["tsrs", "tsc"]) {
	for (const name of ["case1", "case1d", "case1c", "case1s"]) {
		const result = results[compiler]?.find(
			(r: { name: string }) => r.name === name,
		);
		if (
			result?.exitCode !== 0 ||
			!Number.isFinite(result.checkTimeSec) ||
			result.checkTimeSec <= 0
		) {
			throw new Error(
				`Missing successful ${compiler} ${name} benchmark result`,
			);
		}
	}
}
const timings = results.tsrs.find((r: { name: string }) => r.name === "case1d");
const cachedTimings = results.tsrs.find(
	(r: { name: string }) => r.name === "case1c",
);
history[version] ??= {
	case1: {
		statements: workload.statements,
		checkTimeSec: timings.checkTimeSec,
		cachedCheckTimeSec: cachedTimings.checkTimeSec,
	},
};

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
	`| ${workload.statements} statements | ${bench.rows.case1d.tsc} s | ${bench.rows.case1d.tsrs} s |`,
	`| with the [type cache](https://typesql.karsli.net/guide/performance#type-cache) | ${bench.rows.case1c.tsc} s | ${bench.rows.case1c.tsrs} s |`,
	"<!-- performance-summary:end -->",
].join("\n");
const releases = Object.entries(history).sort(([a], [b]) =>
	a.localeCompare(b, "en", { numeric: true }),
);
const chart = [
	"<!-- performance-history:start -->",
	"Lines: 🔵 Uncached · 🟢 Cached. tsrs check time for the case1 application workload.",
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
