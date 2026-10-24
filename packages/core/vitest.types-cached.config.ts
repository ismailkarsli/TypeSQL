import { defineConfig } from "vitest/config";

// The type tests again, with a type cache generated from them (test/cache/equiv): every
// expectation must hold whether a result comes from the cache or is computed.
export default defineConfig({
	test: {
		name: "core-types-cached",
		include: [],
		globalSetup: ["test/cache/equiv/setup.ts"],
		typecheck: {
			enabled: true,
			include: ["test/types/**/*.test-d.ts"],
			tsconfig: "./test/cache/equiv/tsconfig.json",
		},
	},
});
