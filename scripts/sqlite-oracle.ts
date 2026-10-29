#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--update");
if (unknown.length) {
	console.error(
		`unknown option ${unknown.join(", ")}\nusage: pnpm test:sqlite [--update]`,
	);
	process.exit(2);
}

const r = spawnSync(
	join(root, "node_modules/.bin/vitest"),
	[
		"run",
		"--config",
		"packages/core/vitest.config.ts",
		"--mode",
		"sqlite",
		"--silent=false",
	],
	{
		cwd: root,
		stdio: "inherit",
		env: {
			...process.env,
			...(args.includes("--update") ? { TYPESQL_ORACLE_UPDATE: "1" } : {}),
		},
	},
);
process.exit(r.status ?? 1);
