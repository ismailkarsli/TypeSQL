// TypeScript Playground links for the files in packages/docs/playground/. A Markdown line that
// links to the Playground carries a `playground:<name>` marker (an HTML comment, or a YAML comment
// in frontmatter), and its link opens packages/docs/playground/<name>.ts.
//
//   node scripts/playground.mjs          rewrite the links from the current sources
//   node scripts/playground.mjs --check  fail when a link is stale, or when a source compiles
//                                        differently than it says: lines ending in `// error …`
//                                        must fail, every other line must compile
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import lz from "lz-string";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "packages/docs/playground");
const check = process.argv.includes("--check");

const sources = new Map(
  readdirSync(sourceDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [basename(f, ".ts"), readFileSync(join(sourceDir, f), "utf8")]),
);

/** The Playground's latest stable TypeScript; types come from the published packages on npm. */
const playgroundUrl = (code) => `https://www.typescriptlang.org/play/#code/${lz.compressToEncodedURIComponent(code)}`;

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? markdownFiles(path) : e.name.endsWith(".md") ? [path] : [];
  });
}
const docs = [join(root, "README.md"), ...markdownFiles(join(root, "packages"))].filter((f) => !f.endsWith("CHANGELOG.md"));

const LINK = /https:\/\/www\.typescriptlang\.org\/play\/[^\s)"'<>]*/g;
const MARKER = /playground:([\w-]+)/;
const problems = [];
const used = new Set();

for (const file of docs) {
  const before = readFileSync(file, "utf8");
  const after = before
    .split("\n")
    .map((line, i) => {
      const name = line.match(MARKER)?.[1];
      if (!name) return line;
      const where = `${relative(root, file)}:${i + 1}`;
      const code = sources.get(name);
      if (code === undefined) {
        problems.push(`${where}: no packages/docs/playground/${name}.ts`);
        return line;
      }
      if (line.search(LINK) === -1) problems.push(`${where}: marker playground:${name} without a Playground link`);
      used.add(name);
      return line.replace(LINK, playgroundUrl(code));
    })
    .join("\n");
  if (after === before) continue;
  if (check) problems.push(`${relative(root, file)}: stale Playground link (run \`pnpm playground\`)`);
  else {
    writeFileSync(file, after);
    console.log(`updated ${relative(root, file)}`);
  }
}
for (const name of sources.keys()) {
  if (!used.has(name)) problems.push(`packages/docs/playground/${name}.ts: not linked from any Markdown file`);
}

if (check) {
  const tsc = spawnSync(join(root, "node_modules/.bin/tsc"), ["-p", join(sourceDir, "tsconfig.json"), "--pretty", "false"], {
    cwd: root,
    encoding: "utf8",
  });
  const failing = new Set();
  for (const m of tsc.stdout.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+: .*)$/gm)) {
    const [, path, line, message] = m;
    const name = basename(path, ".ts");
    failing.add(`${name}:${line}`);
    if (!/\/\/ error\b/.test(sources.get(name)?.split("\n")[Number(line) - 1] ?? "")) {
      problems.push(`${path}:${line}: unexpected ${message}`);
    }
  }
  for (const [name, code] of sources) {
    code.split("\n").forEach((line, i) => {
      if (/\/\/ error\b/.test(line) && !failing.has(`${name}:${i + 1}`)) {
        problems.push(`packages/docs/playground/${name}.ts:${i + 1}: marked \`// error\` but compiles`);
      }
    });
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
if (check) console.log(`${sources.size} Playground sources compile as marked; links are up to date`);
