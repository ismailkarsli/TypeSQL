#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const shardAt = args.indexOf("--shard");
const shard = shardAt >= 0 ? args.splice(shardAt, 2)[1] : null;
if (shard !== null && !/^\d+\/\d+$/.test(shard ?? "")) {
	console.error("--shard takes <i>/<n>, e.g. --shard 2/4");
	process.exit(2);
}
const flags = new Set(args.filter((a) => a.startsWith("--")));
const unknown = [...flags].filter(
	(f) => !["--regress", "--views", "--update"].includes(f),
);
if (unknown.length) {
	console.error(
		`unknown option ${unknown.join(", ")}\nusage: pnpm test:oracle [--regress] [--views] [--shard i/n] [--update] [test …]`,
	);
	process.exit(2);
}
// a shard of the replay (CI runs them in parallel) leaves our type tests and the catalog to another job
const parts = shard ? [] : ["types", "functions"];
if (flags.has("--regress")) parts.push("regress", "ddl");
if (flags.has("--views")) parts.push("views");
const tests = args.filter((a) => !a.startsWith("--"));

const r = spawnSync(
	join(root, "node_modules/.bin/vitest"),
	[
		"run",
		"--config",
		"packages/core/vitest.config.ts",
		"--mode",
		"oracle",
		"--silent=false",
	],
	{
		cwd: root,
		stdio: "inherit",
		env: {
			...process.env,
			TYPESQL_ORACLE_PARTS: parts.join(","),
			TYPESQL_ORACLE_TESTS: tests.join(","),
			...(shard ? { TYPESQL_ORACLE_SHARD: shard } : {}),
			...(flags.has("--update") ? { TYPESQL_ORACLE_UPDATE: "1" } : {}),
		},
	},
);
process.exit(r.status ?? 1);
