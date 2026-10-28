import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "pg-ast",
		reporters:
			process.env.GITHUB_ACTIONS === "true"
				? ["default", ["github-actions", { jobSummary: { enabled: false } }]]
				: ["default"],
		root: import.meta.dirname,
		include: ["test/pg-ast/**/*.oracle.ts"],
		testTimeout: 0,
		hookTimeout: 0,
	},
});
