import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "core",
		include: ["test/**/*.test.ts"],
		exclude: ["test/cache/**"],
		typecheck: {
			enabled: true,
			include: ["test/**/*.test-d.ts"],
			exclude: ["test/cache/**"],
			tsconfig: "./tsconfig.json",
		},
	},
});
