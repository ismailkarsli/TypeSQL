#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const unknown = flags.filter((f) => f !== "--update");
if (unknown.length) {
  console.error(`unknown option ${unknown.join(", ")}\nusage: pnpm test:pg-ast [--update] [test …]`);
  process.exit(2);
}
const tests = args.filter((a) => !a.startsWith("--"));

const r = spawnSync(join(root, "node_modules/.bin/vitest"), ["run", "--config", "packages/core/vitest.pg-ast.config.ts", "--silent=false"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    TYPESQL_PG_AST_TESTS: tests.join(","),
    ...(flags.includes("--update") ? { TYPESQL_PG_AST_UPDATE: "1" } : {}),
  },
});
process.exit(r.status ?? 1);
