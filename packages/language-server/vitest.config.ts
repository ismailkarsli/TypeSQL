import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "language-server",
		include: ["test/**/*.test.ts"],
	},
});
