import { appendFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Database } from "../conformance/db.js";
import { compareBaseline, missingIssues, readBaseline, scoped, showEntries, sortedEntries, withIssues, writeBaseline, type Entries } from "./baseline.js";
import { functionsOracle } from "./functions.js";
import { NEEDS_ISSUE } from "./kinds.js";
import { Connection } from "./replay.js";
import { acquireOracleServer } from "./server.js";
import { checkedTests, regressOracle, schedule } from "./regress.js";
import type { OracleResult } from "./result.js";
import { typesOracle } from "./types.js";

const parts = (process.env["TYPESQL_ORACLE_PARTS"] ?? "types,functions").split(",").filter(Boolean);
const update = process.env["TYPESQL_ORACLE_UPDATE"] === "1";
const only = (process.env["TYPESQL_ORACLE_TESTS"] ?? "").split(",").filter(Boolean);
const root = join(import.meta.dirname, "../../../..");

let server: Database | null = null;
let version = "";

beforeAll(async () => {
  server = await acquireOracleServer();
  if (!server) return;
  const c = new Connection(server.url);
  try {
    version = (await c.sql.unsafe<{ v: string }[]>("SELECT current_setting('server_version') AS v"))[0]!.v.split(/\s/)[0]!;
  } finally {
    await c.close();
  }
});

afterAll(async () => {
  await server?.close();
});

const log = (m: string): void => console.log(m);

function settle(part: string, r: OracleResult, keep: (group: string) => boolean = () => true): string[] {
  const path = join(import.meta.dirname, "baselines", `${part}.json`);
  const baseline = readBaseline(path, "disagreements");
  const previous = baseline?.entries ?? {};
  const current = withIssues(r.entries, previous, NEEDS_ISSUE);
  const { added, fixed } = compareBaseline(current, scoped(previous, keep));
  const tally = Object.entries(r.tally).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}: ${n}`).join(", ");
  const summary = `${part} oracle on PostgreSQL ${version}: ${tally}`;
  log(summary + (r.notes.length ? `\n  ${r.notes.join("\n  ")}` : ""));
  if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `## ${part} oracle\n\n${summary}\n`);
  if (update) {
    const merged: Entries = Object.fromEntries(Object.entries(previous).filter(([g]) => !keep(g)));
    Object.assign(merged, current);
    writeBaseline(path, { postgres: version }, "disagreements", sortedEntries(merged));
    log(`Wrote ${relative(root, path)}: ${added.length} added, ${fixed.length} removed.`);
    return [];
  }
  const failures: string[] = [];
  const flag = part === "ddl" ? "--regress" : part === "views-types" ? "--views" : part === "views-regress" ? "--regress --views" : part === "types" || part === "functions" ? "" : `--${part}`;
  const cmd = `pnpm test:oracle ${flag} --update`.replace(/\s+/g, " ");
  if (!baseline) return [`No baseline for the ${part} oracle. Run \`${cmd}\` to create ${relative(root, path)}.`];
  if (String(baseline.pins.postgres).split(".")[0] !== version.split(".")[0]) failures.push(`${relative(root, path)} is for PostgreSQL ${String(baseline.pins.postgres)}, the server is ${version}. Run \`${cmd}\` and review the diff.`);
  const show = (list: Parameters<typeof showEntries>[0]) => showEntries(list, (e) => `  ${e.group}  [${e.kind}]  ${String(e.sql)}\n      ${String(e.detail)}`);
  if (added.length) failures.push(`${added.length} new ${part} disagreement(s) with Postgres:\n${show(added)}`);
  if (fixed.length) failures.push(`${fixed.length} ${part} disagreement(s) in the baseline no longer occur (nice). Run \`${cmd}\` to remove them:\n${show(fixed)}`);
  const noIssue = missingIssues(previous, NEEDS_ISSUE);
  if (noIssue.length) failures.push(`${noIssue.length} unsound entr(y/ies) in ${relative(root, path)} without an issue:\n${show(noIssue)}`);
  return failures;
}

test.runIf(parts.includes("types"))("4a (and part 3 over them): the type tests' statements against Postgres", async (ctx) => {
  if (!server) return ctx.skip("TYPESQL_ORACLE=skip");
  const r = await typesOracle(server.url, log, { views: parts.includes("views") });
  const failures = [...settle("types", r.types), ...(parts.includes("views") ? settle("views-types", r.views) : [])];
  if (update && parts.includes("views")) {
    const path = join(import.meta.dirname, "../fuzz/corpus/candidates.json");
    writeFileSync(path, `${JSON.stringify(r.candidates.sort((a, b) => a.source.localeCompare(b.source) || a.sql.localeCompare(b.sql)))}\n`);
    log(`Wrote ${relative(root, path)}: ${r.candidates.length} statements`);
  }
  expect(failures.join("\n\n")).toBe("");
});

test.runIf(parts.includes("regress") || parts.includes("ddl"))("4b, 4d: PostgreSQL's regression suite replayed", async (ctx) => {
  if (!server) return ctx.skip("TYPESQL_ORACLE=skip");
  const withViews = parts.includes("views");
  const shardEnv = /^(\d+)\/(\d+)$/.exec(process.env["TYPESQL_ORACLE_SHARD"] ?? "");
  const shard = shardEnv ? { index: Number(shardEnv[1]), count: Number(shardEnv[2]) } : undefined;
  const r = await regressOracle(server.url, only, log, { views: withViews, ...(shard ? { shard } : {}) });
  const checked = checkedTests(only.length ? only : schedule(), shard);
  const keep = (group: string): boolean => checked.includes(group);
  const failures = [
    ...(parts.includes("regress") ? settle("regress", r.regress, keep) : []),
    ...(parts.includes("ddl") ? settle("ddl", r.ddl, keep) : []),
    ...(withViews ? settle("views-regress", r.views, keep) : []),
  ];
  expect(failures.join("\n\n")).toBe("");
});

test.runIf(parts.includes("functions"))("4c: the function catalog against pg_proc", async (ctx) => {
  if (!server) return ctx.skip("TYPESQL_ORACLE=skip");
  const r = await functionsOracle(server.url, log);
  const failures = settle("functions", r);
  expect(failures.join("\n\n")).toBe("");
});
