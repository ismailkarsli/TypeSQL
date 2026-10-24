// Keeps `CacheVersion` (packages/core/src/engine/cache.ts) equal to a hash of the sources that
// decide what the type checker computes, so a type cache entry made by another version of the
// engine is never used. `--check` (CI) fails instead of writing when it is out of date.
//
//   node scripts/cache-version.ts [--check]
//
// Hashed: every .ts file under packages/core/src except src/cache/ (the content mapper and its
// job, which run in Node), src/editor/ (editor completions, which run in Node) and src/runtime/
// (runtime code), with the CacheVersion line blanked.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "../packages/core/src");
const target = join(root, "engine/cache.ts");
const line = /^export type CacheVersion = "[^"]*";$/m;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return p === join(root, "cache") || p === join(root, "editor") || p === join(root, "runtime") ? [] : files(p);
    return e.name.endsWith(".ts") ? [p] : [];
  });
}

const hash = createHash("sha256");
for (const f of files(root).sort()) {
  hash.update(relative(root, f).replaceAll("\\", "/") + "\0");
  hash.update(readFileSync(f, "utf8").replaceAll("\r\n", "\n").replace(line, "") + "\0");
}
const version = hash.digest("hex").slice(0, 12);

const text = readFileSync(target, "utf8");
const current = line.exec(text)?.[0];
if (!current) throw new Error(`no CacheVersion line in ${target}`);
const wanted = `export type CacheVersion = "${version}";`;
if (current === wanted) {
  console.log(`cache-version: ${version} (up to date)`);
} else if (process.argv.includes("--check")) {
  console.error(`cache-version: CacheVersion is out of date; run \`pnpm cache-version\` (want ${version})`);
  process.exit(1);
} else {
  writeFileSync(target, text.replace(line, wanted));
  console.log(`cache-version: wrote ${version}`);
}
