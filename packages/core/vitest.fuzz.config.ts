import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "fuzz",
		root: import.meta.dirname,
		include: ["test/fuzz/**/*.fuzz.ts"],
		testTimeout: 0,
		hookTimeout: 0,
		// the TypeScript process dying under a batch: test/oracle/batches.ts retries on a new one
		onUnhandledError: (error) =>
			!/EPIPE|ERR_STREAM_DESTROYED|write after a stream was destroyed/.test(
				`${(error as { code?: string }).code ?? ""} ${error.message}`,
			),
	},
});
