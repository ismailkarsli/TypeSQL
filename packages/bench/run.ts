#!/usr/bin/env node
// Measures `tsc --noEmit --extendedDiagnostics` per generated file, writes results.json, prints
// a table plus the per-query throughput (also to the GitHub job summary when
// GITHUB_STEP_SUMMARY is set) and exits 1 when a file exceeds thresholds.json. `--calibrate` rewrites
// thresholds.json from the measured numbers x2 (check time gets a 1.5 s floor: for sub-second
// files the fixed cost of loading lib.d.ts + core and CPU contention dominate, and instantiation
// counts are the deterministic signal) before checking.
//
// Variants: the sources against core's sources (q1 … maxlen), the same files against the built
// package with skipLibCheck, as an application compiles them (…d), with a type cache generated
// for the file and served by the content mapper (…c), and with a cache generated for another
// schema, every entry stale (q500s). The cached variants need `pnpm --filter @typesql/core build`.
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as Job from "../core/src/cache/job.ts";

interface Variant {
	name: string;
	files: string[];
	config?: typeof dist | typeof cached;
	/** Generate a type cache for the variant from these files (`files[1]` is the cache file). */
	cache?: { from: string[] };
}

interface TscError {
	file: string;
	line: number;
	code: string;
	message: string;
}

interface Probe {
	name: string;
	bytes: number;
	ok: boolean;
}

interface Result {
	name: string;
	file: string;
	instantiations: number | null;
	types: number | null;
	checkTimeSec: number | null;
	totalTimeSec: number | null;
	wallTimeSec: number;
	memoryMB: number;
	/** Errors reported in the measured file itself (a probe or query that failed to infer). */
	errorCount: number;
	/** Errors anywhere else in the program, e.g. TypeSQL itself not compiling. */
	otherErrorCount: number;
	errors: TscError[];
	exitCode: number | null;
	probes?: Probe[];
}

interface Threshold {
	instantiations: number;
	checkTimeSec: number;
	maxErrors: number;
	minOkBytes?: number;
}

interface CacheThreshold {
	instantiationsPerHit: number;
	staleRatio: number;
}

/** thresholds.json: one entry per variant, and `cache` for the type cache's costs. */
type Thresholds = { [variant: string]: Threshold } & { cache?: CacheThreshold };

const here = dirname(fileURLToPath(import.meta.url));
const tsc = join(here, "../../node_modules/.bin/tsc");
const core = join(here, "../core");
const dist = { extends: "./tsconfig.json", compilerOptions: { paths: {} } };
const cached = {
	extends: "./tsconfig.json",
	compilerOptions: { paths: {} },
	contentMappers: [{ package: "@typesql/core", extensions: [".typesqlcache"] }],
};
const variants: Variant[] = [
	{ name: "q1", files: ["src/q1.ts"] },
	{ name: "q50", files: ["src/q50.ts"] },
	{ name: "q500", files: ["src/q500.ts"] },
	{ name: "mixed50", files: ["src/mixed50.ts"] },
	{ name: "maxlen", files: ["src/maxlen.ts"] },
	{ name: "q1d", config: dist, files: ["src/q1.ts"] },
	{ name: "q50d", config: dist, files: ["src/q50.ts"] },
	{ name: "q500d", config: dist, files: ["src/q500.ts"] },
	{
		name: "q50c",
		config: cached,
		files: ["src/q50.ts", "cache/q50.typesqlcache"],
		cache: { from: ["src/q50.ts"] },
	},
	{
		name: "q500c",
		config: cached,
		files: ["src/q500.ts", "cache/q500.typesqlcache"],
		cache: { from: ["src/q500.ts"] },
	},
	{
		name: "q500s",
		config: cached,
		files: ["src/q500.ts", "cache/q500s.typesqlcache"],
		cache: { from: ["cache/q500s-schema.ts"] },
	},
];
const names = variants.map((v) => v.name);
const calibrate = process.argv.includes("--calibrate");
const thresholdsPath = join(here, "thresholds.json");

for (const name of ["q1", "q50", "q500", "mixed50", "maxlen"]) {
	if (!existsSync(join(here, "src", `${name}.ts`))) {
		console.error(`missing src/${name}.ts — run \`node gen.ts\` first`);
		process.exit(2);
	}
}

/** Generate the type caches of the cached variants with the job from the built package. */
async function generateCaches(): Promise<void> {
	const job = join(core, "dist/cache/job.js");
	if (!existsSync(job)) {
		console.error(
			"the cached variants need the built package: run `pnpm --filter @typesql/core build` first",
		);
		process.exit(2);
	}
	const { generate } = (await import(pathToFileURL(job).href)) as typeof Job;
	const engine = /export type CacheVersion = "([^"]*)"/.exec(
		readFileSync(join(core, "dist/engine/cache.d.ts"), "utf8"),
	)![1]!;
	mkdirSync(join(here, "cache"), { recursive: true });
	// the stale variant's schema: q500's with an enum registry, which every entry depends on
	writeFileSync(
		join(here, "cache/q500s-schema.ts"),
		readFileSync(join(here, "src/q500.ts"), "utf8").replace(
			"interface DB {",
			'interface DB {\n  $types: { mood: "happy" | "sad" };',
		),
	);
	for (const v of variants.filter((v) => v.cache)) {
		const cacheFile = join(here, v.files[1]!);
		writeFileSync(cacheFile, "{}\n");
		const configFile = join(here, `tsconfig.gen-${v.name}.json`);
		writeFileSync(
			configFile,
			JSON.stringify({
				...dist,
				include: [],
				files: [...v.cache!.from, "cache/__typesql_probe__.ts"],
			}),
		);
		try {
			const r = await generate({
				configFile,
				cacheFile,
				engine,
				isCorePath: (p) => p.startsWith(join(core, "dist") + "/"),
			});
			console.log(
				`cache for ${v.name}: ${r.computed} entries in ${(r.ms / 1000).toFixed(1)} s`,
			);
		} finally {
			unlinkSync(configFile);
		}
	}
}
await generateCaches();

function measure(variant: Variant): Result {
	const { name } = variant;
	const configPath = join(here, `tsconfig.${name}.json`);
	writeFileSync(
		configPath,
		JSON.stringify(
			{
				...(variant.config ?? { extends: "./tsconfig.json" }),
				include: [],
				files: variant.files,
			},
			null,
			2,
		),
	);
	try {
		const started = performance.now();
		const args = [
			"--noEmit",
			"--extendedDiagnostics",
			"-p",
			configPath,
			...(variant.cache ? ["--runExternalCode"] : []),
		];
		const proc = spawnSync(tsc, args, {
			cwd: here,
			encoding: "utf8",
			env: { ...process.env, TYPESQL_CACHE: "off" },
		});
		const wallTimeSec = (performance.now() - started) / 1000;
		const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
		const num = (label: string): number | null => {
			const m = out.match(new RegExp(`^${label}:\\s+([\\d.]+)`, "m"));
			return m ? Number(m[1]) : null;
		};
		const errors = [
			...out.matchAll(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/gm),
		].map(
			(m): TscError => ({
				file: m[1]!,
				line: Number(m[2]),
				code: m[4]!,
				message: m[5]!,
			}),
		);
		const file = variant.files[0]!;
		const inFile = errors.filter((e) =>
			e.file.replaceAll("\\", "/").endsWith(file),
		);
		const result: Result = {
			name,
			file,
			instantiations: num("Instantiations"),
			types: num("Types"),
			checkTimeSec: num("Check time"),
			totalTimeSec: num("Total time"),
			wallTimeSec: Number(wallTimeSec.toFixed(3)),
			memoryMB: Math.round((num("Memory used") ?? 0) / 1024),
			errorCount: inFile.length,
			otherErrorCount: errors.length - inFile.length,
			errors,
			exitCode: proc.status,
		};
		if (name === "maxlen") result.probes = probes(inFile);
		return result;
	} finally {
		unlinkSync(configPath);
	}
}

/** Map error lines in src/maxlen.ts back to the `export const lenNk = sql(...)` probe on that line. */
function probes(errors: TscError[]): Probe[] {
	const lines = readFileSync(join(here, "src", "maxlen.ts"), "utf8").split(
		"\n",
	);
	const found: Probe[] = [];
	lines.forEach((line, index) => {
		const m = line.match(/^export const (\w+) = sql\(.*\); \/\/ (\d+) bytes$/);
		if (m)
			found.push({
				name: m[1]!,
				bytes: Number(m[2]),
				ok: !errors.some((e) => e.line === index + 1),
			});
	});
	return found;
}

const results = variants.map(measure);

/**
 * Marginal cost of one query: q500 minus q1 (which is mostly loading lib.d.ts and core), per
 * query. `queriesPerSec` is the check-time throughput an app with many typed queries sees.
 */
function throughput(): {
	instantiationsPerQuery: number;
	checkMsPerQuery: number;
	queriesPerSec: number;
} | null {
	const q1 = results.find((r) => r.name === "q1");
	const q500 = results.find((r) => r.name === "q500");
	if (
		!q1?.checkTimeSec ||
		!q500?.checkTimeSec ||
		q1.instantiations == null ||
		q500.instantiations == null
	)
		return null;
	const seconds = Math.max(q500.checkTimeSec - q1.checkTimeSec, 0.001);
	return {
		instantiationsPerQuery: Math.round(
			(q500.instantiations - q1.instantiations) / 499,
		),
		checkMsPerQuery: Number(((seconds * 1000) / 499).toFixed(2)),
		queriesPerSec: Math.round(499 / seconds),
	};
}
const perQuery = throughput();

/**
 * Cost of a cache hit, q500c - q50c per query, and of a stale cache against no cache (q500s /
 * q500d): a stale entry must cost what the analysis costs, plus its lookup.
 */
function cacheCost(): CacheThreshold | null {
	const get = (n: string): number | null | undefined =>
		results.find((r) => r.name === n)?.instantiations;
	const [c50, c500, s500, d500] = ["q50c", "q500c", "q500s", "q500d"].map(get);
	if ([c50, c500, s500, d500].some((x) => x == null)) return null;
	return {
		instantiationsPerHit: Math.round((c500! - c50!) / 450),
		staleRatio: Number((s500! / d500!).toFixed(3)),
	};
}
const cache = cacheCost();
writeFileSync(
	join(here, "results.json"),
	JSON.stringify(
		{
			measuredAt: new Date().toISOString(),
			throughput: perQuery,
			cache,
			results,
		},
		null,
		2,
	) + "\n",
);

if (calibrate) {
	const thresholds: Thresholds = {};
	for (const r of results) {
		thresholds[r.name] = {
			// instantiation counts are deterministic: 30% headroom; check time is noisy: 2x (min 1.5 s)
			instantiations: Math.ceil((r.instantiations ?? 0) * 1.3),
			checkTimeSec: Math.max(
				1.5,
				Number(((r.checkTimeSec ?? 0) * 2).toFixed(2)),
			),
			maxErrors: 0,
		};
		if (r.probes) {
			thresholds[r.name]!.maxErrors = r.probes.filter((p) => !p.ok).length;
			thresholds[r.name]!.minOkBytes = Math.max(
				0,
				...r.probes.filter((p) => p.ok).map((p) => p.bytes),
			);
		}
	}
	// a hit must stay under 250 instantiations (the design target); a stale cache must cost what no cache does
	if (cache)
		thresholds.cache = {
			instantiationsPerHit: Math.min(
				250,
				Math.ceil(cache.instantiationsPerHit * 1.3),
			),
			staleRatio: 1.05,
		};
	writeFileSync(thresholdsPath, JSON.stringify(thresholds) + "\n");
	console.log(`wrote thresholds.json (measured x2)`);
}

const thresholds: Thresholds = existsSync(thresholdsPath)
	? (JSON.parse(readFileSync(thresholdsPath, "utf8")) as Thresholds)
	: {};
const failures: { name: string; problems: string[] }[] = [];
const rows = results.map((r) => {
	const t = thresholds[r.name];
	const problems: string[] = [];
	if (t) {
		if (r.instantiations == null || r.instantiations > t.instantiations)
			problems.push(`instantiations > ${t.instantiations}`);
		if (r.checkTimeSec == null || r.checkTimeSec > t.checkTimeSec)
			problems.push(`check time > ${t.checkTimeSec}s`);
		if (r.errorCount > (t.maxErrors ?? 0))
			problems.push(`${r.errorCount} error(s) in file`);
		if (r.otherErrorCount > 0)
			problems.push(
				`${r.otherErrorCount} error(s) outside the file (core does not compile?)`,
			);
		if (t.minOkBytes != null) {
			const maxOk = Math.max(
				0,
				...(r.probes ?? []).filter((p) => p.ok).map((p) => p.bytes),
			);
			if (maxOk < t.minOkBytes)
				problems.push(`max OK statement ${maxOk} B < ${t.minOkBytes} B`);
		}
	}
	if (problems.length) failures.push({ name: r.name, problems });
	return {
		variant: r.name,
		file: r.file,
		instantiations: r.instantiations ?? "?",
		types: r.types ?? "?",
		"check s": r.checkTimeSec ?? "?",
		"total s": r.totalTimeSec ?? "?",
		"mem MB": r.memoryMB,
		errors: r.otherErrorCount
			? `${r.errorCount}+${r.otherErrorCount}`
			: r.errorCount,
		status: problems.length ? "FAIL" : t ? "ok" : "no threshold",
	};
});

function table(objects: Record<string, unknown>[]): void {
	const keys = Object.keys(objects[0]!);
	const width = keys.map((k) =>
		Math.max(k.length, ...objects.map((o) => String(o[k]).length)),
	);
	const line = (vals: unknown[]): string =>
		vals.map((v, i) => String(v).padEnd(width[i]!)).join("  ");
	console.log(line(keys));
	console.log(width.map((w) => "-".repeat(w)).join("  "));
	for (const o of objects) console.log(line(keys.map((k) => o[k])));
}
table(rows);
if (cache) {
	console.log(
		`\ntype cache: ${cache.instantiationsPerHit} instantiations per hit (q500c - q50c), stale cache ${cache.staleRatio}x no cache (q500s / q500d)`,
	);
	const t = thresholds.cache;
	const problems: string[] = [];
	if (t && cache.instantiationsPerHit > t.instantiationsPerHit)
		problems.push(`instantiations per hit > ${t.instantiationsPerHit}`);
	if (t && cache.staleRatio > t.staleRatio)
		problems.push(`stale cache costs more than ${t.staleRatio}x no cache`);
	if (problems.length) failures.push({ name: "cache", problems });
}
if (perQuery) {
	console.log(
		`\nthroughput (q500 - q1): ${perQuery.queriesPerSec} queries/s of check time, ${perQuery.checkMsPerQuery} ms and ${perQuery.instantiationsPerQuery} instantiations per query`,
	);
}
if (process.env.GITHUB_STEP_SUMMARY) {
	const md = [
		`### ${failures.length ? "❌" : "✅"} Compile-time bench`,
		"",
		...failures.map((f) => `- ${f.name}: ${f.problems.join(", ")}`),
		...(failures.length ? [""] : []),
		"| variant | instantiations | check s | status |",
		"|---|---:|---:|---|",
		...rows.map(
			(r) =>
				`| ${r.variant} | ${r.instantiations} | ${r["check s"]} | ${r.status} |`,
		),
		"",
		perQuery
			? `Throughput: **${perQuery.queriesPerSec} queries/s** of check time (${perQuery.checkMsPerQuery} ms, ${perQuery.instantiationsPerQuery} instantiations per query).`
			: "",
		cache
			? `Type cache: ${cache.instantiationsPerHit} instantiations per hit; a stale cache costs ${cache.staleRatio}x no cache.`
			: "",
	];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
}
const maxlen = results.find((r) => r.probes);
if (maxlen)
	console.log(
		`\nmaxlen probes: ${maxlen.probes!.map((p) => `${p.name}=${p.bytes}B:${p.ok ? "ok" : "FAIL"}`).join("  ")}`,
	);
for (const r of results)
	for (const e of r.errors)
		console.log(
			`  [${r.name}] ${e.file}:${e.line} ${e.code} ${e.message.slice(0, 140)}`,
		);

if (failures.length) {
	console.error(`\nthreshold violations:`);
	for (const f of failures)
		console.error(`  ${f.name}: ${f.problems.join(", ")}`);
	process.exit(1);
}
console.log("\nall files within thresholds");
