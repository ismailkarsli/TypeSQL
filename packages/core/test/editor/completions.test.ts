/**
 * Completions through an API session on `tsc --lsp`, the way the VS Code extension gets them:
 * the server's own snapshot (with unsaved edits), the `DB` type of the call, the scanner.
 */
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { API } from "typescript/async";
import { SyntaxKind } from "typescript/ast";
import { completionsAt, editorKinds, type Completions } from "../../src/editor/index.js";
import { startLsp, type Lsp } from "../cache/lsp.js";
import { tempProject, tsconfig, type TempProject } from "../cache/project.js";

const packages = resolve(import.meta.dirname, "../../..");

const DB = `import { createSql, type Col, type Generated, type Nullable, type PgCatalog, type View } from "@typesql/core";
export interface DB extends PgCatalog {
  users: { id: Generated<"int4">; email: Col<"text">; display_name: Nullable<"text">; order: Col<"int4">; "Nick": Nullable<"text"> };
  posts: { id: Generated<"int8">; author_id: Col<"int4">; title: Col<"text"> };
  active_users: View<{ id: Col<"int4">; email: Col<"text"> }>;
  UserAccounts: { id: Col<"int4"> };
  auth: { sessions: { id: Col<"uuid">; user_id: Col<"int4"> }; audit: View<{ at: Col<"timestamptz"> }> };
  $types: { mood: "happy" | "sad" };
}
export const sql = createSql<DB>();
`;

const ADAPTERS = `import { createSql } from "@typesql/core";
import type { FromKysely } from "${packages}/kysely/src/from-kysely.js";
import type { DB as KyselyDB } from "${packages}/kysely/test/fixtures/kysely-codegen.js";
import type { FromDrizzle } from "${packages}/drizzle/src/from-drizzle.js";
import type * as drizzle from "${packages}/drizzle/test/fixtures/schema.js";
import type { DB as PrismaDB } from "${packages}/prisma/test/fixtures/typesql.js";
export const kysely = createSql<FromKysely<KyselyDB>>();
export const drizzleSql = createSql<FromDrizzle<typeof drizzle>>();
export const prisma = createSql<PrismaDB>();
`;

let p: TempProject;
let lsp: Lsp;
let api: API<true>;
const kinds = editorKinds(SyntaxKind as unknown as Record<string, number>);
let isCorePath: (path: string) => boolean;
const open = new Map<string, { version: number; text: string }>();

beforeAll(async () => {
  p = tempProject({ "tsconfig.json": tsconfig(), "src/db.ts": DB, "src/adapters.ts": ADAPTERS });
  const core = p.corePackage + sep;
  isCorePath = (path) => path.startsWith(core);
  lsp = startLsp(p.dir, { TYPESQL_CACHE: "off" });
  await lsp.request("initialize", { processId: process.pid, rootUri: lsp.uri("."), capabilities: {}, initializationOptions: {} });
  lsp.notify("initialized", {});
  const { pipe } = (await lsp.request("custom/initializeAPISession", {})).result as { pipe: string };
  const req = createRequire(join(p.dir, "tsconfig.json"));
  const { API: Api } = (await import(pathToFileURL(req.resolve("typescript/async")).href)) as { API: typeof API };
  api = await Api.fromLSPConnection({ pipe });
}, 60_000);

afterAll(async () => {
  await api?.close();
  await lsp?.close();
  p?.remove();
});

/** Open (or edit, unsaved) `file` with `marked` minus its `|`, and complete at the `|`. */
async function complete(file: string, marked: string): Promise<{ result: Completions | null; server: unknown; text: string }> {
  const offset = marked.indexOf("|");
  const text = marked.slice(0, offset) + marked.slice(offset + 1);
  const uri = lsp.uri(file);
  const prev = open.get(file);
  const version = (prev?.version ?? 0) + 1;
  open.set(file, { version, text });
  if (!prev) lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version, text } });
  else {
    const lines = prev.text.split("\n");
    const range = { start: { line: 0, character: 0 }, end: { line: lines.length - 1, character: lines.at(-1)!.length } };
    lsp.notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ range, text }] });
  }
  const before = text.slice(0, offset).split("\n");
  const position = { line: before.length - 1, character: before.at(-1)!.length };
  // the server sees the edit once it has handled a request after it; the middleware runs after this one
  const server = (await lsp.request("textDocument/completion", { textDocument: { uri }, position })).result;
  const snapshot = await api.getCurrentLanguageServerSnapshot();
  const project = await snapshot.getDefaultProjectForFile({ uri });
  if (!project) throw new Error(`no project for ${file}`);
  const result = await completionsAt(project.program, project.checker, kinds, { uri }, position, isCorePath);
  return { result, server, text };
}

/** `label: detail` of each item, in sort order. */
async function items(marked: string, file = "src/q.ts"): Promise<string[]> {
  const { result } = await complete(file, `import { sql } from "./db.js";\n${marked}\n`);
  if (!result) return ["(not in a sql literal)"];
  return [...result.items].sort((a, b) => (a.sortText < b.sortText ? -1 : a.sortText > b.sortText ? 1 : 0)).map((i) => `${i.insertText === i.label ? i.label : `${i.label} → ${i.insertText}`}: ${i.detail}`);
}

test("relations after FROM: the ones the statement uses first, then the rest and the namespaces", async () => {
  expect(await items(`sql("SELECT * FROM posts p JOIN |");`)).toEqual([
    "posts: table",
    "users: table",
    "active_users: view",
    "UserAccounts → \"UserAccounts\": table",
    "auth: schema",
    "pg_catalog: schema",
    "information_schema: schema",
  ]);
});

test("relations of a namespace", async () => {
  expect(await items(`sql("SELECT * FROM auth.|");`)).toEqual(["sessions: table", "audit: view"]);
  const catalog = await items(`sql("SELECT * FROM pg_catalog.|");`);
  expect(catalog).toContain("pg_class: view");
  expect(catalog.length).toBeGreaterThan(20);
});

test("columns of an alias, with their types; names that need quotes are quoted", async () => {
  expect(await items(`sql("SELECT u.| FROM users u");`)).toEqual([
    "id: int4",
    "email: text",
    "display_name: text | null",
    'order → "order": int4',
    'Nick → "Nick": text | null',
  ]);
  expect(await items(`sql("SELECT s.| FROM auth.sessions s");`)).toEqual(["id: uuid", "user_id: int4"]);
  expect(await items(`sql("SELECT a.| FROM active_users a");`)).toEqual(["id: int4", "email: text"]);
  // pg_catalog relations resolve unqualified, as in Postgres
  expect(await items(`sql("SELECT c.| FROM pg_class c");`)).toContain("relname: name");
});

test("bare columns of every FROM item, then the aliases", async () => {
  expect(await items(`sql("SELECT * FROM users u JOIN posts p ON p.author_id = u.id WHERE |");`)).toEqual([
    "id: u.id: int4",
    "email: u.email: text",
    "display_name: u.display_name: text | null",
    'order → "order": u.order: int4',
    'Nick → "Nick": u.Nick: text | null',
    "author_id: p.author_id: int4",
    "title: p.title: text",
    "u: users",
    "p: posts",
  ]);
});

test("a multi-line template literal with a parameter, in a transaction", async () => {
  expect(await items(`declare const db: import("@typesql/core").TransactionalSql<import("./db.js").DB, import("@typesql/core").DefaultTypeMap>;
db.transaction(async (tx) => tx(\`
  SELECT p.title
    FROM posts p
   WHERE p.id = \${sql.param(1n)}
     AND p.|
\`));`)).toEqual(["id: int8", "author_id: int4", "title: text"]);
});

test("sql.fragment and sql.as", async () => {
  expect(await items(`sql.fragment("WHERE users.|");`)).toContain("email: text");
  expect(await items(`sql.as<{ n: number }>("SELECT count(*) AS n FROM |");`)).toContain("users: table");
});

test("outside a statement literal, or where nothing fits", async () => {
  expect(await items(`const s = "SELECT * FROM |";`)).toEqual(["(not in a sql literal)"]);
  expect(await items(`sql(\`SELECT * FROM users WHERE id = \${sql.param(|)}\`);`)).toEqual(["(not in a sql literal)"]);
  expect(await items(`sql("SELECT * FROM users |");`)).toEqual([]);
  expect(await items(`sql("SELECT * FROM users WHERE email = 'a|'");`)).toEqual([]);
});

test("the replaced range is the name typed so far", async () => {
  const { result, text } = await complete("src/range.ts", `import { sql } from "./db.js";\nsql("SELECT * FROM us|");\n`);
  expect(text.slice(result!.replace.start, result!.replace.end)).toBe("us");
  expect(text.slice(result!.literal.start, result!.literal.end)).toBe("SELECT * FROM us");
  expect(result!.replaceRange).toEqual({ start: { line: 1, character: 19 }, end: { line: 1, character: 21 } });
  expect(result!.literalRange).toEqual({ start: { line: 1, character: 5 }, end: { line: 1, character: 21 } });
});

test("unsaved edits: a table added in the open buffer of the schema", async () => {
  await complete("src/db.ts", DB.replace("  $types:", "  comments: { id: Col<\"int4\">; body: Col<\"text\"> };\n  $types:") + "|");
  expect(await items(`sql("SELECT c.| FROM comments c");`, "src/unsaved.ts")).toEqual(["id: int4", "body: text"]);
  await complete("src/db.ts", `${DB}|`);
});

test("adapter schemas: Kysely, Drizzle, Prisma (its generator's DB)", async () => {
  const pre = `import { kysely, drizzleSql, prisma } from "./adapters.js";\n`;
  const run = async (code: string): Promise<string[]> => {
    const { result } = await complete("src/adapter-q.ts", `${pre}${code}\n`);
    return result ? result.items.map((i) => i.label) : ["(not in a sql literal)"];
  };
  expect(await run(`kysely("SELECT * FROM |");`)).toEqual(expect.arrayContaining(["users", "posts", "auth"]));
  expect(await run(`kysely("SELECT * FROM auth.|");`)).toEqual(expect.arrayContaining(["sessions", "users"]));
  expect(await run(`drizzleSql("SELECT u.| FROM users u");`)).toEqual(expect.arrayContaining(["id", "email", "display_name", "created_at"]));
  expect(await run(`prisma('SELECT u.| FROM "User" u');`)).toEqual(expect.arrayContaining(["id", "email", "display_name"]));
});

test("TypeScript's own items inside the literal only echo the statement", async () => {
  const { result, server } = await complete("src/echo.ts", `import { sql } from "./db.js";\nsql("SELECT id FROM users WHERE |");\n`);
  const list = server as { items?: { textEdit?: { range: { start: { line: number; character: number } } } }[] } | null;
  for (const item of list?.items ?? []) {
    // every item TypeScript offers replaces the whole literal: the middleware drops them
    expect(item.textEdit?.range.start).toEqual({ line: 1, character: 5 });
  }
  expect(result!.literalRange.start).toEqual({ line: 1, character: 5 });
});

