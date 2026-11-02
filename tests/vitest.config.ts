import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { defineConfig } from "vitest/config";

process.env.UPDATE_SNAPSHOT = "none";
const root = import.meta.dirname;
const discovery = join(root, ".vitest");
rmSync(discovery, { recursive: true, force: true });
mkdirSync(discovery, { recursive: true });
for (const name of readdirSync(join(root, "scenarios")).sort()) {
	writeFileSync(
		join(discovery, `${name}.test.ts`),
		`import { consumer } from '../consumer.test.ts';\nconsumer(${JSON.stringify(name)});\n`,
	);
}
export default defineConfig({
	root,
	test: {
		allowOnly: false,
		include: [".vitest/*.test.ts"],
		exclude: [],
		globalSetup: ["./support/setup.ts"],
		testTimeout: 300_000,
		hookTimeout: 300_000,
		maxWorkers: 4,
		snapshotFormat: { escapeString: false },
		resolveSnapshotPath: (path: string) =>
			join(root, "scenarios", basename(path, ".test.ts"), "expected.snap"),
	},
});
