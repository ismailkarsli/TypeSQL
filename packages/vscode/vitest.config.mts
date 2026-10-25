import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// as tsconfig.json's `paths` and the esbuild bundle: the language server's sources
		alias: {
			"@typesql/language-server": fileURLToPath(
				new URL("../language-server/src/index.ts", import.meta.url),
			),
		},
	},
	test: {
		name: "vscode",
		include: ["test/**/*.test.ts"],
	},
});
