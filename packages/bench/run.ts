#!/usr/bin/env node
// Measures the immutable case1 application with tsrs and tsc against source, built,
// warm-cache and stale-cache variants, plus an uncached parallel-source variant.
// Writes results.json and enforces thresholds.json.
// --calibrate sets 30% instantiation headroom and 2x check time (minimum 1.5 seconds).
// --compiler tsrs or --compiler tsc measures only that compiler.
// --target-500ms enforces the workspace-machine goal for the parallel uncached variant.
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as Job from "../core/src/cache/job.ts";
import { fixture, loadWorkload, shardWorkload, source } from "./workload.ts";

interface Variant {
	name: string;
	files: string[];
	config?: Record<string, unknown>;
	/** Generate a type cache for the variant from these files (`files[1]` is the cache file). */
	cache?: { from: string[] };
}

interface TscError {
	file: string;
	line: number;
	code: string;
	message: string;
}

interface Result {
	name: string;
	file: string;
	files: string[];
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
}

interface Threshold {
	instantiations: number;
	checkTimeSec: number;
	maxErrors: number;
}

interface CacheThreshold {
	cachedRatio: number;
	staleRatio: number;
}

/** thresholds.json: one entry per variant, and `cache` for the type cache's costs. */
type Thresholds = { [variant: string]: Threshold } & { cache?: CacheThreshold };

type Compiler = "tsrs" | "tsc";
const here = dirname(fileURLToPath(import.meta.url));
const compilerArg = process.argv.indexOf("--compiler");
const onlyCompiler =
	compilerArg === -1 ? undefined : process.argv[compilerArg + 1];
if (
	onlyCompiler !== undefined &&
	onlyCompiler !== "tsc" &&
	onlyCompiler !== "tsrs"
) {
	console.error(`unknown --compiler ${onlyCompiler}: use tsc or tsrs`);
	process.exit(2);
}
const compilers: Compiler[] = onlyCompiler ? [onlyCompiler] : ["tsrs", "tsc"];
const target500ms = process.argv.includes("--target-500ms");
const core = join(here, "../core");
const dist = { extends: "./tsconfig.json", compilerOptions: { paths: {} } };
const cached = {
	extends: "./tsconfig.json",
	compilerOptions: { paths: {} },
	contentMappers: [{ package: "@typesql/core", extensions: [".typesqlcache"] }],
};
// The fixture stays intact. Each generated module contains the same shared setup and one
// third of its SQL calls; together they check every call exactly once without a type cache.
const shardFiles = shardWorkload(3).map((text, index) => {
	const file = `cache/case1-shard-${index}.ts`;
	mkdirSync(join(here, "cache"), { recursive: true });
	writeFileSync(join(here, file), text);
	return file;
});
const variants: Variant[] = [
	{ name: "case1", files: [fixture] },
	{
		name: "case1p",
		config: {
			extends: "./tsconfig.json",
			// Shared inputs are intentionally present in every generated module.
			compilerOptions: { noUnusedLocals: false },
		},
		files: shardFiles,
	},
	{ name: "case1d", config: dist, files: [fixture] },
	{
		name: "case1c",
		config: cached,
		files: [fixture, "cache/case1.typesqlcache"],
		cache: { from: [fixture] },
	},
	{
		name: "case1s",
		config: cached,
		files: [fixture, "cache/case1s.typesqlcache"],
		cache: { from: ["cache/case1s-schema.ts"] },
	},
];
const workload = { file: fixture, statements: loadWorkload().statements };
const calibrate = process.argv.includes("--calibrate");
if (calibrate && onlyCompiler !== undefined) {
	console.error("--calibrate measures both compilers: drop --compiler");
	process.exit(2);
}
const thresholdsPath = join(here, "thresholds.json");

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
	// Copy the fixture and change the enum registry every cache entry depends on.
	// The application fixture itself is never written.
	const staleSource = source.replace(
		"$types: {",
		'$types: { __bench_stale: "stale";',
	);
	if (staleSource === source)
		throw new Error("case1 has no enum registry to invalidate");
	writeFileSync(join(here, "cache/case1s-schema.ts"), staleSource);
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

function measure(variant: Variant, compiler: Compiler): Result {
	const { name } = variant;
	const bin = join(here, "../../node_modules/.bin", compiler);
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
		const proc = spawnSync(bin, args, {
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
			variant.files.some((entry) =>
				e.file.replaceAll("\\", "/").endsWith(entry),
			),
		);
		const result: Result = {
			name,
			file,
			files: variant.files,
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
		return result;
	} finally {
		unlinkSync(configPath);
	}
}

const byCompiler = Object.fromEntries(
	compilers.map((c) => [c, variants.map((v) => measure(v, c))]),
) as Record<Compiler, Result[]>;
const primaryCompiler: Compiler = compilers[0]!;
const results = byCompiler[primaryCompiler];

/** Whole-application averages, including schema and reusable-fragment checking. */
function throughput(list: Result[]): {
	instantiationsPerQuery: number;
	checkMsPerQuery: number;
	queriesPerSec: number;
} | null {
	const result = list.find((r) => r.name === "case1d");
	if (!result?.checkTimeSec || result.instantiations == null) return null;
	return {
		instantiationsPerQuery: Math.round(
			result.instantiations / workload.statements,
		),
		checkMsPerQuery: Number(
			((result.checkTimeSec * 1000) / workload.statements).toFixed(2),
		),
		queriesPerSec: Math.round(workload.statements / result.checkTimeSec),
	};
}
const throughputByCompiler = Object.fromEntries(
	compilers.map((c) => [c, throughput(byCompiler[c])]),
) as Record<Compiler, ReturnType<typeof throughput>>;
const perQuery = throughputByCompiler[primaryCompiler];

/** Compare the same application's warm and stale caches with its uncached build. */
function cacheCost(list: Result[]): CacheThreshold | null {
	const get = (name: string) =>
		list.find((r) => r.name === name)?.instantiations;
	const [warm, stale, uncached] = ["case1c", "case1s", "case1d"].map(get);
	if (warm == null || stale == null || !uncached) return null;
	return {
		cachedRatio: Number((warm / uncached).toFixed(3)),
		staleRatio: Number((stale / uncached).toFixed(3)),
	};
}
const cache = cacheCost(results);
writeFileSync(
	join(here, "results.json"),
	JSON.stringify(
		{
			measuredAt: new Date().toISOString(),
			workload,
			environment: {
				node: process.version,
				cpu: cpus()[0]?.model,
				cpus: cpus().length,
			},
			compilerVersions: Object.fromEntries(
				compilers.map((c) => [
					c,
					JSON.parse(
						readFileSync(
							join(
								here,
								"../../node_modules",
								c === "tsc" ? "typescript" : "tsrs",
								"package.json",
							),
							"utf8",
						),
					).version,
				]),
			),
			compiler: onlyCompiler ?? compilers,
			throughput: onlyCompiler ? perQuery : throughputByCompiler,
			cache,
			results: onlyCompiler ? results : byCompiler,
		},
		null,
		2,
	) + "\n",
);

if (
	Object.values(byCompiler)
		.flat()
		.some(
			(r) =>
				r.exitCode !== 0 || r.instantiations == null || r.checkTimeSec == null,
		) &&
	calibrate
) {
	console.error("Cannot calibrate unsuccessful compiler runs");
	process.exit(1);
}
if (calibrate) {
	const thresholds: Thresholds = {};
	for (const [index, r] of results.entries()) {
		const measured = compilers.map((c) => byCompiler[c][index]!);
		thresholds[r.name] = {
			// instantiation counts are deterministic: 30% headroom; check time is noisy: 2x (min 1.5 s)
			instantiations: Math.ceil(
				Math.max(...measured.map((r) => r.instantiations ?? 0)) * 1.3,
			),
			checkTimeSec: Math.max(
				1.5,
				Number(
					(Math.max(...measured.map((r) => r.checkTimeSec ?? 0)) * 2).toFixed(
						2,
					),
				),
			),
			maxErrors: 0,
		};
	}
	if (cache)
		thresholds.cache = {
			cachedRatio: Math.min(
				1,
				Number(
					(
						Math.max(
							...compilers.map(
								(c) => cacheCost(byCompiler[c])?.cachedRatio ?? 1,
							),
						) * 1.3
					).toFixed(3),
				),
			),
			staleRatio: 1.05,
		};
	writeFileSync(thresholdsPath, JSON.stringify(thresholds) + "\n");
	console.log(
		`wrote thresholds.json (30% instantiation headroom, 2x check time)`,
	);
}

const thresholds: Thresholds = existsSync(thresholdsPath)
	? (JSON.parse(readFileSync(thresholdsPath, "utf8")) as Thresholds)
	: {};
const failures: { name: string; problems: string[] }[] = [];
const rows = results.map((r, idx) => {
	const t = thresholds[r.name];
	const problems: string[] = [];
	for (const c of compilers) {
		const rc = byCompiler[c][idx]!;
		const tag = compilers.length > 1 ? ` (${c})` : "";
		if (rc.exitCode !== 0)
			problems.push(`compiler${tag} exited with ${rc.exitCode}`);
		if (
			target500ms &&
			r.name === "case1p" &&
			c === "tsrs" &&
			(rc.checkTimeSec == null || rc.checkTimeSec >= 0.5)
		)
			problems.push(`uncached parallel check time${tag} must be < 0.5s`);
		if (t) {
			if (rc.instantiations == null || rc.instantiations > t.instantiations)
				problems.push(`instantiations${tag} > ${t.instantiations}`);
			if (rc.checkTimeSec == null || rc.checkTimeSec > t.checkTimeSec)
				problems.push(`check time${tag} > ${t.checkTimeSec}s`);
			if (rc.errorCount > (t.maxErrors ?? 0))
				problems.push(`${rc.errorCount} error(s) in file${tag}`);
			if (rc.otherErrorCount > 0)
				problems.push(
					`${rc.otherErrorCount} error(s) outside the file${tag} (core does not compile?)`,
				);
		}
	}
	if (problems.length) failures.push({ name: r.name, problems });
	if (compilers.length === 1) {
		return {
			variant: r.name,
			file: r.name === "case1p" ? "3 generated modules" : r.file,
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
	}
	const tsrsRes = byCompiler.tsrs[idx]!;
	const tscRes = byCompiler.tsc[idx]!;
	return {
		variant: r.name,
		file: r.name === "case1p" ? "3 generated modules" : r.file,
		instantiations: tsrsRes.instantiations ?? "?",
		types: tsrsRes.types ?? "?",
		"tsrs check s": tsrsRes.checkTimeSec ?? "?",
		"tsc check s": tscRes.checkTimeSec ?? "?",
		"tsrs total s": tsrsRes.totalTimeSec ?? "?",
		"tsc total s": tscRes.totalTimeSec ?? "?",
		"tsrs MB": tsrsRes.memoryMB,
		"tsc MB": tscRes.memoryMB,
		errors: tsrsRes.otherErrorCount
			? `${tsrsRes.errorCount}+${tsrsRes.otherErrorCount}`
			: tsrsRes.errorCount,
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
for (const c of compilers) {
	const cache = cacheCost(byCompiler[c]);
	if (!cache) continue;
	console.log(
		`\ntype cache (${c}): warm cache ${cache.cachedRatio}x no cache, stale cache ${cache.staleRatio}x no cache`,
	);
	const t = thresholds.cache;
	const problems: string[] = [];
	if (t && cache.cachedRatio > t.cachedRatio)
		problems.push(`warm cache costs more than ${t.cachedRatio}x no cache`);
	if (t && cache.staleRatio > t.staleRatio)
		problems.push(`stale cache costs more than ${t.staleRatio}x no cache`);
	if (problems.length) failures.push({ name: `cache (${c})`, problems });
}
for (const c of compilers) {
	const pq = throughputByCompiler[c];
	if (pq) {
		const label = compilers.length > 1 ? ` (${c})` : "";
		console.log(
			`\napplication average (${workload.statements} statements)${label}: ${pq.queriesPerSec} queries/s of check time, ${pq.checkMsPerQuery} ms and ${pq.instantiationsPerQuery} instantiations per query`,
		);
	}
}
if (process.env.GITHUB_STEP_SUMMARY) {
	const both = compilers.length > 1;
	const md = [
		`### ${failures.length ? "❌" : "✅"} Compile-time bench${onlyCompiler ? ` (${onlyCompiler})` : ""}`,
		"",
		`Workload: \`${workload.file}\` (${workload.statements} statements). Per-query figures are whole-application averages.`,
		"",
		...failures.map((f) => `- ${f.name}: ${f.problems.join(", ")}`),
		...(failures.length ? [""] : []),
		both
			? "| variant | instantiations | check s (`tsrs`) | check s (`tsc`) | status |"
			: "| variant | instantiations | check s | status |",
		both ? "|---|---:|---:|---:|---|" : "|---|---:|---:|---|",
		...rows.map((r) =>
			both
				? `| ${r.variant} | ${r.instantiations} | ${(r as Record<string, unknown>)["tsrs check s"]} | ${(r as Record<string, unknown>)["tsc check s"]} | ${r.status} |`
				: `| ${r.variant} | ${r.instantiations} | ${(r as Record<string, unknown>)["check s"]} | ${r.status} |`,
		),
		"",
		...compilers
			.map((c) => {
				const pq = throughputByCompiler[c];
				if (!pq) return "";
				const label = both ? ` (${c})` : "";
				return `Throughput${label}: **${pq.queriesPerSec} queries/s** of check time (${pq.checkMsPerQuery} ms, ${pq.instantiationsPerQuery} instantiations per query).`;
			})
			.filter(Boolean),
		cache
			? `Type cache: warm cache ${cache.cachedRatio}x no cache; stale cache ${cache.staleRatio}x no cache.`
			: "",
	];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
}
for (const c of compilers)
	for (const r of byCompiler[c])
		for (const e of r.errors)
			console.log(
				`  [${r.name}${compilers.length > 1 ? `/${c}` : ""}] ${e.file}:${e.line} ${e.code} ${e.message.slice(0, 140)}`,
			);

if (failures.length) {
	console.error(`\nthreshold violations:`);
	for (const f of failures)
		console.error(`  ${f.name}: ${f.problems.join(", ")}`);
	process.exit(1);
}
console.log("\nall files within thresholds");
