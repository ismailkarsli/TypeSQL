import { defineConfig } from "vitest/config";

// Every Stryker worker runs its own vitest; the DB suites drop and recreate their tables, so each
// worker gets its own database (created by scripts/mutate-runtime.ts).
const worker = process.env.STRYKER_MUTATOR_WORKER;
const url = process.env.TYPESQL_PG_URL;
if (worker !== undefined && url) {
	const u = new URL(url);
	u.pathname = `/typesql_stryker_${worker}`;
	process.env.TYPESQL_PG_URL = u.href;
}

const runtimeOnly = { typecheck: { enabled: false } };

export default defineConfig({
	test: {
		projects: [
			...["core", "pg", "postgres", "kysely", "drizzle", "prisma"].map((p) => ({
				extends: `./packages/${p}/vitest.config.ts`,
				root: `./packages/${p}`,
				test: runtimeOnly,
			})),
			{
				extends: "./packages/vscode/vitest.config.mts",
				root: "./packages/vscode",
			},
			{
				extends: "./packages/core/vitest.cache.config.ts",
				root: "./packages/core",
				test: runtimeOnly,
			},
		],
	},
});
