#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const bench = join(root, "packages/bench");
const firstVersion = "0.7.1";
const { version: currentVersion } = JSON.parse(
	readFileSync(join(root, "packages/core/package.json"), "utf8"),
) as { version: string };
const runsArg = process.argv.indexOf("--runs");
const runs = runsArg === -1 ? 3 : Number(process.argv[runsArg + 1]);
if (!Number.isSafeInteger(runs) || runs < 1) {
	throw new Error("--runs must be a positive integer");
}
const git = (...args: string[]) =>
	execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const compare = (a: string, b: string) =>
	a.localeCompare(b, "en", { numeric: true });
const versions = git("tag", "--list", "@typesql/core@*")
	.split("\n")
	.flatMap((tag) => /^@typesql\/core@(\d+\.\d+\.\d+)$/.exec(tag)?.[1] ?? [])
	.filter(
		(v) => compare(v, firstVersion) >= 0 && compare(v, currentVersion) <= 0,
	)
	.sort(compare);
if (versions[0] !== firstVersion) {
	throw new Error(
		"Release tags are missing; fetch the full history and tags first",
	);
}

function measure(version: string, ref?: string) {
	const directory = mkdtempSync(join(tmpdir(), "typesql-bench-"));
	try {
		console.log(
			`\nBenchmarking ${ref ?? "working tree"} (${version}, ${runs} checks per variant)`,
		);
		if (process.env.GITHUB_STEP_SUMMARY) {
			appendFileSync(
				process.env.GITHUB_STEP_SUMMARY,
				`\n## Core ${version}${ref ? "" : " (current)"}\n\n`,
			);
		}
		const core = join(directory, "packages/core");
		const target = join(directory, "packages/bench");
		mkdirSync(core, { recursive: true });
		mkdirSync(join(target, "node_modules/@typesql"), { recursive: true });
		if (ref) {
			const archive = execFileSync(
				"git",
				[
					"archive",
					ref,
					"packages/core/src",
					"packages/core/package.json",
					"packages/core/tsconfig.build.json",
				],
				{ cwd: root, maxBuffer: 32 * 1024 * 1024 },
			);
			execFileSync("tar", ["-x", "-C", directory], { input: archive });
		} else {
			for (const file of ["src", "package.json", "tsconfig.build.json"]) {
				cpSync(join(root, "packages/core", file), join(core, file), {
					recursive: true,
				});
			}
		}
		const manifest = JSON.parse(
			readFileSync(join(core, "package.json"), "utf8"),
		);
		if (manifest.version !== version)
			throw new Error(`Version mismatch for ${ref}`);
		writeFileSync(join(directory, "package.json"), '{"type":"module"}\n');
		const config = JSON.parse(
			readFileSync(join(root, "tsconfig.base.json"), "utf8"),
		);
		config.compilerOptions.noUnusedLocals = false;
		config.compilerOptions.noUnusedParameters = false;
		writeFileSync(
			join(directory, "tsconfig.base.json"),
			JSON.stringify(config),
		);
		for (const file of ["src", "run.ts", "tsconfig.json", "thresholds.json"]) {
			cpSync(join(bench, file), join(target, file), { recursive: true });
		}
		symlinkSync(
			join(root, "node_modules"),
			join(directory, "node_modules"),
			"dir",
		);
		symlinkSync(core, join(target, "node_modules/@typesql/core"), "dir");
		const run = (command: string, args: string[]) =>
			execFileSync(command, args, {
				cwd: directory,
				stdio: "inherit",
				env: { ...process.env, TYPESQL_CACHE: "off" },
			});
		run(join(root, "node_modules/.bin/tsrs"), [
			"-p",
			join(core, "tsconfig.build.json"),
		]);
		run(process.execPath, [
			join(target, "run.ts"),
			"--runs",
			String(runs),
			...(ref ? ["--no-thresholds"] : []),
		]);
		return {
			version,
			ref: ref ?? "HEAD",
			sha: git("rev-parse", `${ref ?? "HEAD"}^{commit}`),
			benchmark: JSON.parse(readFileSync(join(target, "results.json"), "utf8")),
			runtime: JSON.parse(
				readFileSync(join(target, "runtime-results.json"), "utf8"),
			),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const releases = versions.map((v) => measure(v, `@typesql/core@${v}`));
const current = measure(currentVersion);
const write = (file: string, value: unknown) =>
	writeFileSync(join(bench, file), `${JSON.stringify(value, null, "\t")}\n`);
write("results.json", current.benchmark);
write("runtime-results.json", current.runtime);
write("history-results.json", {
	measuredAt: current.benchmark.measuredAt,
	environment: current.benchmark.environment,
	compilerVersions: current.benchmark.compilerVersions,
	workload: current.benchmark.workload,
	runs,
	releases,
});
