import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { parseCache, stringifyCache } from "../../src/cache/format.js";
import { generate } from "../../src/cache/job.js";
import { engineVersion } from "../../src/cache/mapper.js";
import { startLsp } from "./lsp.js";
import { queries, SCHEMA, tempProject, tsconfig, type TempProject } from "./project.js";

let p: TempProject;
beforeAll(() => {
  p = tempProject({ "tsconfig.json": tsconfig(), "src/db.ts": SCHEMA, "src/queries.ts": queries(10), "src/generated/queries.typesqlcache": "{}\n" });
});
afterAll(() => p.remove());

const until = async <T>(what: string, f: () => T | undefined, ms = 60_000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = f();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
};

test("the language server starts the mapper, serves the cache, and picks up what the job writes", async () => {
  const cacheFile = join(p.dir, "src/generated/queries.typesqlcache");
  // an existing cache with one entry changed on purpose, to see that it is served
  await generate({ configFile: join(p.dir, "tsconfig.json"), cacheFile, engine: engineVersion(), isCorePath: (f) => f.startsWith(join(p.corePackage, "dist")) });
  const file = parseCache(readFileSync(cacheFile, "utf8"))!;
  const group = Object.values(file.groups)[0]!;
  const key = "SELECT name, count(*) AS n FROM users WHERE id > 0 GROUP BY name";
  const entry = group.entries[key]!;
  (group.entries as Record<string, unknown>)[key] = { ...entry, c: entry.c!.map((c) => ({ ...c, q: c.q.replace("n: string", 'n: "from the cache"') })) };
  writeFileSync(cacheFile, stringifyCache(file));

  // a statement the cache does not have yet: the job adds it
  p.write("src/queries.ts", p.read("src/queries.ts") + `export const added = sql("SELECT title FROM posts WHERE author_id = $1", 1);\n`);
  const log = join(p.dir, "mapper.log");
  const lsp = startLsp(p.dir, { TYPESQL_CACHE_LOG: log, TYPESQL_CACHE_DELAY: "0" });
  try {
    await lsp.request("initialize", { processId: process.pid, rootUri: lsp.uri("."), capabilities: { textDocument: { diagnostic: {}, hover: {} } }, initializationOptions: { runExternalCode: true } });
    lsp.notify("initialized", {});
    const uri = lsp.uri("src/queries.ts");
    const text = p.read("src/queries.ts");
    lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text } });
    const diag = (await lsp.request("textDocument/diagnostic", { textDocument: { uri } })).result as { items: unknown[] };
    expect(diag.items).toEqual([]);
    // hover over q0: the entry from the cache file
    const line = text.split("\n").findIndex((l) => l.startsWith("export const q0 "));
    const hover = (await lsp.request("textDocument/hover", { textDocument: { uri }, position: { line, character: 14 } })).result as { contents: { value: string } };
    expect(hover.contents.value).toContain('n: "from the cache"');

    // the job computes the new statement and rewrites the file
    await until("the job's write", () => (readFileSync(cacheFile, "utf8").includes("SELECT title FROM posts WHERE author_id = $1") ? true : undefined));
    lsp.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: lsp.uri("src/generated/queries.typesqlcache"), type: 2 }] });
    const after = (await lsp.request("textDocument/diagnostic", { textDocument: { uri } })).result as { items: unknown[] };
    expect(after.items).toEqual([]);
    const transforms = () => readFileSync(log, "utf8").split("\n").filter((l) => l.includes("] transform "));
    await until("a second transform", () => (transforms().length >= 2 ? true : undefined));
    // the second one carries the new entry
    const sizes = transforms().map((l) => Number(/\((\d+) characters\)/.exec(l)![1]));
    expect(sizes.at(-1)!).toBeGreaterThan(sizes[0]!);

    // an edit on disk: the job's watcher runs another pass
    p.write("src/queries.ts", p.read("src/queries.ts") + `export const edited = sql("SELECT email FROM users WHERE name = $1", "x");\n`);
    await until("the pass after an edit", () => (readFileSync(cacheFile, "utf8").includes("SELECT email FROM users WHERE name = $1") ? true : undefined));

    // one mapper process did all of it
    const lines = readFileSync(log, "utf8").trim().split("\n");
    const pids = new Set(lines.map((l) => /\[(\d+)\]/.exec(l)?.[1]));
    expect(pids.size).toBe(1);
    expect(lines.filter((l) => l.includes("] initialize"))).toHaveLength(1);
    // the cached entry was kept (its dependencies did not change), the new one computed
    expect(lines.some((l) => /pass: \d+ statements, \d+ computed, \d+ kept/.test(l))).toBe(true);
  } finally {
    await lsp.close();
  }
}, 120_000);

test("CI=1 or TYPESQL_CACHE=off: the mapper serves the file but starts no job", async () => {
  for (const env of [{ CI: "1" }, { CI: "", TYPESQL_CACHE: "off" }]) {
    const log = join(p.dir, `mapper-${Object.keys(env).join("-")}.log`);
    const before = readFileSync(join(p.dir, "src/generated/queries.typesqlcache"), "utf8");
    p.write("src/queries.ts", p.read("src/queries.ts") + `export const more${Object.keys(env).length} = sql("SELECT id FROM posts WHERE title = $1", "x");\n`);
    const lsp = startLsp(p.dir, { ...env, TYPESQL_CACHE_LOG: log, TYPESQL_CACHE_DELAY: "0" });
    try {
      await lsp.request("initialize", { processId: process.pid, rootUri: lsp.uri("."), capabilities: { textDocument: { diagnostic: {} } }, initializationOptions: { runExternalCode: true } });
      lsp.notify("initialized", {});
      const uri = lsp.uri("src/queries.ts");
      lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text: p.read("src/queries.ts") } });
      await lsp.request("textDocument/diagnostic", { textDocument: { uri } });
      await new Promise((r) => setTimeout(r, 2000));
      const lines = readFileSync(log, "utf8");
      expect(lines).toContain("generation off");
      expect(lines).toContain("] transform ");
      expect(lines).not.toContain("job for");
      expect(readFileSync(join(p.dir, "src/generated/queries.typesqlcache"), "utf8")).toBe(before);
    } finally {
      await lsp.close();
    }
  }
}, 120_000);

test("hover text is the same with and without the cache", async () => {
  const cacheFile = join(p.dir, "src/generated/queries.typesqlcache");
  writeFileSync(cacheFile, "{}\n");
  await generate({ configFile: join(p.dir, "tsconfig.json"), cacheFile, engine: engineVersion(), isCorePath: (f) => f.startsWith(join(p.corePackage, "dist")) });
  p.write("tsconfig.nocache.json", JSON.stringify({ extends: "./tsconfig.json", contentMappers: null }));
  const hovers = async (config: string | null): Promise<string[]> => {
    if (config) p.write("tsconfig.json", p.read(config));
    const lsp = startLsp(p.dir, { TYPESQL_CACHE: "off" });
    try {
      await lsp.request("initialize", { processId: process.pid, rootUri: lsp.uri("."), capabilities: { textDocument: { hover: {} } }, initializationOptions: { runExternalCode: true } });
      lsp.notify("initialized", {});
      const uri = lsp.uri("src/queries.ts");
      const text = p.read("src/queries.ts");
      lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text } });
      const lines = text.split("\n").map((l, i) => [l, i] as const).filter(([l]) => /^export const \w+ = sql\(/.test(l));
      const out: string[] = [];
      for (const [, line] of lines) out.push(((await lsp.request("textDocument/hover", { textDocument: { uri }, position: { line, character: 14 } })).result as { contents: { value: string } }).contents.value);
      return out;
    } finally {
      await lsp.close();
    }
  };
  const main = p.read("tsconfig.json");
  const warm = await hovers(null);
  const cold = await hovers("tsconfig.nocache.json");
  p.write("tsconfig.json", main);
  expect(warm.length).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < warm.length; i++) if (warm[i] !== cold[i]) console.log(`WARM: ${warm[i]}\nCOLD: ${cold[i]}`);
  expect(warm).toEqual(cold);
}, 120_000);
