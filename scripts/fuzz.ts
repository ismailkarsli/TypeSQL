#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const env: Record<string, string> = {};
const names: Record<string, string> = {
	"--seed": "TYPESQL_FUZZ_SEED",
	"--runs": "TYPESQL_FUZZ_RUNS",
	"--replay": "TYPESQL_FUZZ_REPLAY",
	"--report": "TYPESQL_FUZZ_REPORT",
	"--shrink": "TYPESQL_FUZZ_SHRINK",
};
for (let i = 0; i < args.length; i++) {
	const a = args[i]!;
	if (a === "--update") env.TYPESQL_FUZZ_UPDATE = "1";
	else if (a in names && args[i + 1] !== undefined)
		env[names[a]!] =
			a === "--replay" || a === "--report" ? resolve(args[++i]!) : args[++i]!;
	else {
		console.error(
			`unknown option ${a}\nusage: pnpm fuzz [--seed n] [--runs n] [--replay file] [--report file] [--shrink n] [--update]`,
		);
		process.exit(2);
	}
}
const r = spawnSync(
	join(root, "node_modules/.bin/vitest"),
	["run", "--config", "packages/core/vitest.fuzz.config.ts", "--silent=false"],
	{ cwd: root, stdio: "inherit", env: { ...process.env, ...env } },
);
process.exit(r.status ?? 1);
