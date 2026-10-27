// Save the release CI measurements for VitePress and render GitHub's README from the same data.
import { readFileSync, writeFileSync } from "node:fs";

const historyPath = "packages/bench/history.json";
const history: Record<string, { q1: number; q50: number; q500: number }> =
	JSON.parse(readFileSync(historyPath, "utf8"));
const { version } = JSON.parse(
	readFileSync("packages/core/package.json", "utf8"),
);
const {
	results,
	throughput,
	cache,
	measuredAt,
	environment,
	compilerVersions,
} = JSON.parse(readFileSync("packages/bench/results.json", "utf8"));
const checkTime = (queries: number): number => {
	const result = results.tsrs.find(
		(r: { name: string }) => r.name === `q${queries}d`,
	);
	if (
		result?.exitCode !== 0 ||
		!Number.isFinite(result.checkTimeSec) ||
		result.checkTimeSec <= 0
	)
		throw new Error(
			`Missing successful uncached tsrs ${queries}-query benchmark result`,
		);
	return result.checkTimeSec;
};
const timings = { q1: checkTime(1), q50: checkTime(50), q500: checkTime(500) };
history[version] ??= timings;

const runtime = JSON.parse(
	readFileSync("packages/bench/runtime-results.json", "utf8"),
);
const compact = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumSignificantDigits: 3,
});
const bench = {
	date: measuredAt.slice(0, 10),
	version,
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
		positional: runtime["positional $1"].toFixed(2),
		named: runtime["named :email"].toFixed(2),
		inline: runtime["inline sql.param"].toFixed(2),
		fragment: runtime["fragment {slot}"].toFixed(2),
	},
};
const summary = [
	"<!-- performance-summary:start -->",
	`A query costs about ${throughput.tsc.checkMsPerQuery} ms of check time with \`tsc\` and about ${throughput.tsrs.checkMsPerQuery} ms with [tsrs](https://github.com/oxc-project/tsrs), a Rust port of TypeScript 7. A file of 500 queries:`,
	"",
	"| | `tsc` | tsrs |",
	"|---|---|---|",
	`| 500 queries | ${bench.rows.q500d.tsc} s | ${bench.rows.q500d.tsrs} s |`,
	`| with the [type cache](https://typesql.karsli.net/guide/performance#type-cache) | ${bench.rows.q500c.tsc} s | ${bench.rows.q500c.tsrs} s |`,
	"<!-- performance-summary:end -->",
].join("\n");

const releases = Object.entries(history).sort(([a], [b]) =>
	a.localeCompare(b, "en", { numeric: true }),
);
const chart = [
	"<!-- performance-history:start -->",
	"Lines: 🟢 50 queries · 🔴 500 queries.",
	"",
	"```mermaid",
	'%%{init: {"themeVariables": {"xyChart": {"plotColorPalette": "#16a34a,#dc2626"}}}}%%',
	"xychart-beta",
	'    title "Uncached tsrs - 50 and 500 queries"',
	`    x-axis "Core version" [${releases.map(([v]) => JSON.stringify(v)).join(", ")}]`,
	`    y-axis "Check time (seconds, lower is faster)" 0 --> ${Math.ceil(Math.max(...releases.flatMap(([, times]) => [times.q50, times.q500])) * 11) / 10}`,
	...(["q50", "q500"] as const).map(
		(name) =>
			`    line [${releases.map(([, times]) => times[name]).join(", ")}]`,
	),
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
