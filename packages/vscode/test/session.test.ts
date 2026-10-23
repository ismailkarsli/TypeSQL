/** `Session` against `tsc --lsp`, connected the way the TypeScript 7 extension 1.0 allows. */
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startLsp, type Lsp } from "../../core/test/cache/lsp.js";
import { SCHEMA, tempProject, tsconfig, type TempProject } from "../../core/test/cache/project.js";
import { Session, typescriptModules } from "../src/session.js";

let p: TempProject;
let lsp: Lsp;
let session: Session;
const logs: string[] = [];

beforeAll(async () => {
  p = tempProject({ "tsconfig.json": tsconfig(), "src/db.ts": SCHEMA });
  lsp = startLsp(p.dir, { TYPESQL_CACHE: "off" });
  await lsp.request("initialize", { processId: process.pid, rootUri: lsp.uri("."), capabilities: {}, initializationOptions: {} });
  lsp.notify("initialized", {});
  session = new Session(
    {
      pipe: async () => ((await lsp.request("custom/initializeAPISession", {})).result as { pipe: string }).pipe,
      modules: (fileName) => [() => typescriptModules(fileName)],
    },
    (m) => logs.push(m),
  );
}, 60_000);

afterAll(async () => {
  await session?.close();
  await lsp?.close();
  p?.remove();
});

const position = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};
const split = (marked: string) => ({ text: marked.replace("|", ""), offset: marked.indexOf("|") });

test("completions through the server's snapshot, with the project's own @typesql/core", async () => {
  const { text, offset } = split(`import { sql } from "./db.js";\nsql("SELECT u.| FROM users u");\n`);
  const uri = lsp.uri("src/a.ts");
  lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text } });
  await lsp.request("textDocument/completion", { textDocument: { uri }, position: position(text, offset) });
  const r = await session.complete(uri, position(text, offset), text);
  expect(r?.items.map((i) => i.label)).toEqual(["id", "email", "name"]);
  expect(logs).toContain(`loading ${join(p.corePackage, "dist/editor/index.js")}`);
});

test("the editor's text when the server has not seen the latest edit", async () => {
  const uri = lsp.uri("src/b.ts");
  const first = `import { sql } from "./db.js";\nsql("SELECT 1");\n`;
  lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text: first } });
  await lsp.request("textDocument/completion", { textDocument: { uri }, position: { line: 0, character: 0 } });
  // typed in the editor, not sent to the server yet
  const { text, offset } = split(`import { sql } from "./db.js";\nsql("SELECT p.| FROM posts p");\n`);
  const started = performance.now();
  const r = await session.complete(uri, position(text, offset), text);
  console.log(`overlay request: ${(performance.now() - started).toFixed(1)} ms`);
  expect(r?.items.map((i) => i.label)).toEqual(["id", "author_id", "title"]);
  expect(r?.replaceRange.start).toEqual(position(text, offset));
});

test("outside a statement literal, and for files without @typesql/core", async () => {
  const uri = lsp.uri("src/c.ts");
  const text = `const s = "SELECT * FROM ";\n`;
  lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text } });
  expect(await session.complete(uri, { line: 0, character: 25 }, text)).toBeNull();
  expect(await session.complete("untitled:Untitled-1", { line: 0, character: 0 }, "")).toBeNull();
});

test("a TypeScript 7.0 server: one log line saying what to install, then no requests", async () => {
  let snapshots = 0;
  const api = {
    fromLSPConnection: async () => ({
      getCurrentLanguageServerSnapshot: async () => {
        snapshots++;
        throw new Error('api: invalid request: unknown API method "getCurrentLanguageServerSnapshot"');
      },
      close: async () => {},
    }),
  };
  const log: string[] = [];
  const s = new Session({ pipe: async () => "pipe", modules: () => [async () => ({ API: api as never, SyntaxKind: {}, dir: "/ts", version: "7.0.2" })] }, (m) => log.push(m));
  const uri = lsp.uri("src/a.ts");
  expect(await s.complete(uri, { line: 1, character: 14 })).toBeNull();
  expect(await s.complete(uri, { line: 1, character: 14 })).toBeNull();
  expect(snapshots).toBe(1);
  expect(log.filter((l) => l.includes("TypeScript 7.0"))).toHaveLength(1);
  expect(log.find((l) => l.includes("TypeScript 7.0"))).toContain("TypeScript 7 Nightly");
});

test("an API client that does not match the server is skipped for the next one", async () => {
  const mismatched = {
    fromLSPConnection: async () => ({
      getCurrentLanguageServerSnapshot: async () => {
        throw new Error("api: client error: project  not found");
      },
      close: async () => {},
    }),
  };
  const log: string[] = [];
  const pipe = async () => ((await lsp.request("custom/initializeAPISession", {})).result as { pipe: string }).pipe;
  const s = new Session(
    {
      pipe,
      modules: (fileName) => [async () => ({ API: mismatched as never, SyntaxKind: {}, dir: "/other/typescript", version: "7.1.0-dev" }), () => typescriptModules(fileName)],
    },
    (m) => log.push(m),
  );
  const { text, offset } = split(`import { sql } from "./db.js";\nsql("SELECT u.| FROM users u");\n`);
  const r = await s.complete(lsp.uri("src/a.ts"), position(text, offset), text);
  expect(r?.items.map((i) => i.label)).toEqual(["id", "email", "name"]);
  expect(log.find((l) => l.startsWith("API session open"))).toMatch(/client: typescript 7\.1\.0-beta at /);
  await s.close();
});

test("no matching client: logged once with what was tried, then no requests", async () => {
  let opened = 0;
  const mismatched = {
    fromLSPConnection: async () => {
      opened++;
      return {
        getCurrentLanguageServerSnapshot: async () => {
          throw new Error("api: client error: project  not found");
        },
        close: async () => {},
      };
    },
  };
  const log: string[] = [];
  const s = new Session({ pipe: async () => "pipe", modules: () => [async () => ({ API: mismatched as never, SyntaxKind: {}, dir: "/other/typescript", version: "7.1.0-dev" })] }, (m) => log.push(m));
  const uri = lsp.uri("src/a.ts");
  expect(await s.complete(uri, { line: 1, character: 14 })).toBeNull();
  expect(await s.complete(uri, { line: 1, character: 14 })).toBeNull();
  expect(opened).toBe(1);
  expect(log.filter((l) => l.startsWith("no TypeScript API client matches"))).toEqual([
    "no TypeScript API client matches the language server; completions are off until it restarts. Tried:\n  typescript 7.1.0-dev at /other/typescript: api: client error: project  not found",
  ]);
});
