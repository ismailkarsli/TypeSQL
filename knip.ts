import { readFileSync } from "node:fs";
import type { KnipConfig } from "knip";
import { releasedPackages } from "./tools/packages.ts";

interface Manifest {
	exports?: Record<string, { default: string }>;
	bin?: Record<string, string>;
}

/** A published package's entry points are the sources of its exports and bins. */
function entries(dir: string): string[] {
	const manifest: Manifest = JSON.parse(
		readFileSync(`${dir}/package.json`, "utf8"),
	);
	return [
		...Object.values(manifest.exports ?? {}).map((e) => e.default),
		...Object.values(manifest.bin ?? {}),
	].map(
		(file) => `${file.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts")}!`,
	);
}

const npm = releasedPackages().filter((p) => p.registry === "npm");

export default {
	ignoreBinaries: ["change", "vsce", "ovsx"],
	ignoreWorkspaces: ["tests/scenarios/*"],
	ignoreIssues: {
		"pnpm-workspace.yaml": ["catalog"],
		"packages/cli/package.json": ["optionalPeerDependencies"],
		"packages/drizzle/src/pg-type.ts": ["duplicates"],
	},
	workspaces: {
		".": {
			entry: ["tools/*.ts"],
			project: ["tools/**/*.ts"],
		},
		...Object.fromEntries(
			npm.map(({ dir }) => [
				dir,
				{ entry: entries(dir), project: ["src/**/*.ts!"] },
			]),
		),
		"packages/core": {
			entry: [...entries("packages/core"), "examples/*.ts"],
			project: ["src/**/*.ts!", "examples/**/*.ts"],
		},
		"packages/vscode": {
			project: ["src/**/*.{ts,mts}!", "scripts/*.mts"],
			ignoreDependencies: ["ovsx"],
		},
		"packages/bench": {
			entry: ["src/case1.ts!"],
			project: ["*.ts", "src/**/*.ts!"],
		},
		"packages/docs": {
			entry: ["*.paths.ts", "cloudflare.config.ts", "wrangler.config.ts"],
			project: ["*.ts", ".vitepress/**/*.{ts,mts,vue}"],
		},
		tests: {
			entry: [
				"support/scenario.ts",
				"support/observe.ts",
				"support/runtime.ts",
			],
		},
	},
} satisfies KnipConfig;
