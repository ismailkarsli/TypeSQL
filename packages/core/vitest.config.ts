import {
	defineConfig,
	type TestProjectInlineConfiguration,
} from "vitest/config";
import type { InlineConfig } from "vitest/node";

// Only checks whose expected behavior comes from PostgreSQL run here.
const projects = ["oracle", "fuzz", "pg-ast"].map((name) => ({
	root: import.meta.dirname,
	test: {
		name,
		include: [`test/${name}/**/*.${name === "fuzz" ? "fuzz" : "oracle"}.ts`],
		testTimeout: 0,
		hookTimeout: 0,
	},
})) satisfies TestProjectInlineConfiguration[];

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
		projects: projects.some((project) => project.test.name === mode)
			? projects.filter((project) => project.test.name === mode)
			: projects,
		...(mode === "pg-ast" ? {} : { onUnhandledError }),
	},
}));
