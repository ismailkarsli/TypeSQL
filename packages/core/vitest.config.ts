import {
	defineConfig,
	type TestProjectInlineConfiguration,
} from "vitest/config";
import type { InlineConfig } from "vitest/node";

const typecheck = {
	enabled: true,
	checker: "tsrs",
	include: ["test/**/*.test-d.ts"],
	tsconfig: "./tsconfig.json",
};

export const projects = [
	{
		root: import.meta.dirname,
		test: {
			name: "core",
			include: ["test/**/*.test.ts"],
			exclude: ["test/cache/**"],
			typecheck: { ...typecheck, exclude: ["test/cache/**"] },
		},
	},
	// Cache fixtures augment QueryCache and need their own TypeScript program.
	{
		root: import.meta.dirname,
		test: {
			name: "core-cache",
			include: ["test/cache/**/*.test.ts"],
			globalSetup: ["test/cache/stale/setup.ts"],
			typecheck: {
				...typecheck,
				include: ["test/cache/**/*.test-d.ts"],
				tsconfig: "./test/cache/tsconfig.json",
			},
		},
	},
	// Run the same type assertions with a generated cache as well as the engine.
	{
		root: import.meta.dirname,
		test: {
			name: "core-types-cached",
			include: [],
			globalSetup: ["test/cache/equiv/setup.ts"],
			typecheck: {
				...typecheck,
				include: ["test/types/**/*.test-d.ts"],
				tsconfig: "./test/cache/equiv/tsconfig.json",
			},
		},
	},
] satisfies TestProjectInlineConfiguration[];

// These suites run separately through their existing commands, using --mode.
const oracleProjects = ["oracle", "fuzz", "pg-ast"].map((name) => ({
	root: import.meta.dirname,
	test: {
		name,
		include: [`test/${name}/**/*.${name === "fuzz" ? "fuzz" : "oracle"}.ts`],
		testTimeout: 0,
		hookTimeout: 0,
	},
}));

const reporters: NonNullable<InlineConfig["reporters"]> =
	process.env.GITHUB_ACTIONS === "true"
		? ["default", ["github-actions", { jobSummary: { enabled: false } }]]
		: ["default"];

// batches.ts retries when its TypeScript process dies during a batch.
const onUnhandledError: NonNullable<InlineConfig["onUnhandledError"]> = (
	error,
) =>
	!/EPIPE|ERR_STREAM_DESTROYED|write after a stream was destroyed/.test(
		`${(error as { code?: string }).code ?? ""} ${error.message}`,
	);

export default defineConfig(({ mode }) => ({
	root: import.meta.dirname,
	test: {
		reporters,
		projects: oracleProjects.some((project) => project.test.name === mode)
			? oracleProjects.filter((project) => project.test.name === mode)
			: projects,
		...(["oracle", "fuzz"].includes(mode) ? { onUnhandledError } : {}),
	},
}));
