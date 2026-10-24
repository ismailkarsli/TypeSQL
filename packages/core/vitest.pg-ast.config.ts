import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "pg-ast",
		root: import.meta.dirname,
		include: ["test/pg-ast/**/*.oracle.ts"],
		testTimeout: 0,
		hookTimeout: 0,
	},
});
