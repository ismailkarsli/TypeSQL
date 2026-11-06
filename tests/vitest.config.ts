import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { defineConfig } from "vitest/config";
import { scenarios } from "./support/paths.ts";

const { tokens } = parseArgs({
	args: process.argv.slice(2),
	options: { update: { type: "boolean", short: "u" } },
	strict: false,
	allowPositionals: true,
	tokens: true,
});
if (
	process.env.CI &&
	tokens.some((t) => t.kind === "option" && t.name === "update")
)
	throw new Error("CI must never update scenario snapshots");
// Without --update, a missing snapshot fails instead of being written.
process.env.UPDATE_SNAPSHOT = "none";

const root = import.meta.dirname;
const discovery = join(root, ".vitest");
rmSync(discovery, { recursive: true, force: true });
mkdirSync(discovery, { recursive: true });
for (const entry of readdirSync(scenarios, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	writeFileSync(
		join(discovery, `${entry.name}.test.ts`),
		`import { scenario } from '../support/scenario.ts';\nscenario(${JSON.stringify(entry.name)});\n`,
	);
}
export default defineConfig({
	root,
	test: {
		allowOnly: false,
		include: [".vitest/*.test.ts"],
		exclude: [],
		globalSetup: ["./support/setup.ts"],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		maxWorkers: 4,
		isolate: false,
		snapshotFormat: { escapeString: false },
		resolveSnapshotPath: (path: string) =>
			join(scenarios, basename(path, ".test.ts"), "expected.snap"),
	},
});
