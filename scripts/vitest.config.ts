import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "scripts",
		include: ["**/*.test.ts"],
		exclude: ["**/node_modules/**"],
	},
});
