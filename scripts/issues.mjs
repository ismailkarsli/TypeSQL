#!/usr/bin/env node
// One issue per bug, not per night: open issues are matched by their hidden `typesql-signature` marker.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const [command, ...rest] = process.argv.slice(2);
const flags = { dryRun: rest.includes("--dry-run"), cap: 5, report: null, out: null, files: [] };
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === "--dry-run") continue;
  if (a === "--cap") flags.cap = Number(rest[++i]);
  else if (a === "--report") flags.report = rest[++i];
  else if (a === "--out") flags.out = rest[++i];
  else if (!a.startsWith("--")) flags.files.push(a);
  else usage(`unknown option ${a}`);
}

const LABELS = {
  fuzz: { color: "d93f0b", description: "Found by the nightly fuzzer" },
  mutation: { color: "fbca04", description: "A type-level mutant no test kills" },
  unsound: { color: "b60205", description: "TypeSQL's types disagree with PostgreSQL in the unsafe direction" },
};

const marker = (signature) => `<!-- typesql-signature: ${signature.replace(/--/g, "- -")} -->`;
const signatureOf = (body) => /<!-- typesql-signature: (.*?) -->/.exec(body ?? "")?.[1] ?? null;
const statementOf = (body) => /<!-- typesql-statement -->\s*```sql\n([\s\S]*?)\n```/.exec(body ?? "")?.[1] ?? null;
const fence = (lang, text) => `\`\`\`${lang}\n${text}\n\`\`\``;

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "inherit"] });
}

function openIssues(label) {
  if (flags.dryRun) return [];
  const list = JSON.parse(gh(["issue", "list", "--label", label, "--state", "open", "--limit", "500", "--json", "number,title,body"]));
  return list.map((i) => ({ ...i, signature: signatureOf(i.body) }));
}

const summary = [];
function say(line) {
  console.log(line);
  summary.push(line);
}

function create(title, body, labels) {
  if (flags.dryRun) {
    say(`would open: ${title} [${labels.join(", ")}]`);
    console.log(`${body}\n${"─".repeat(72)}`);
    return null;
  }
  const url = gh(["issue", "create", "--title", title, "--label", labels.join(","), "--body-file", "-"], body).trim();
  say(`opened ${url}: ${title}`);
  return Number(/\/(\d+)$/.exec(url)?.[1]);
}

function comment(number, body) {
  if (flags.dryRun) {
    say(`would comment on #${number}`);
    console.log(`${body}\n${"─".repeat(72)}`);
    return;
  }
  gh(["issue", "comment", String(number), "--body-file", "-"], body);
  say(`commented on #${number}`);
}

function file(items, label) {
  const open = openIssues(label);
  let opened = 0;
  const left = [];
  for (const it of items) {
    const existing = open.find((i) => i.signature === it.signature);
    if (existing) {
      const old = statementOf(existing.body);
      if (old === null || it.size < old.length) comment(existing.number, it.comment);
      continue;
    }
    if (opened >= flags.cap) {
      left.push(it);
      continue;
    }
    create(it.title, `${it.body}\n\n${marker(it.signature)}\n`, it.labels);
    opened++;
  }
  if (left.length) say(`${left.length} more not opened (cap ${flags.cap}): ${left.map((i) => i.title).join("; ")}`);
}

const replayCommand = (sql) => `Replay it locally with \`pnpm fuzz --replay <file>\`, the file being the statement below (\`.sql\`).`;

function fuzz() {
  if (!flags.report) usage("fuzz needs --report");
  const report = JSON.parse(readFileSync(flags.report, "utf8"));
  const items = report.failures.map((f) => ({
    signature: f.signature,
    title: `fuzz: ${f.property} ${f.sql.length > 70 ? `${f.sql.slice(0, 67)}...` : f.sql}`,
    size: f.sql.length,
    labels: ["fuzz", ...(f.property === "nulls" || f.property === "types" ? ["unsound"] : [])],
    body: [
      `The nightly fuzzer found a statement that breaks property **${f.property}** (${PROPERTIES[f.property] ?? f.property}).`,
      "",
      "<!-- typesql-statement -->",
      fence("sql", f.sql),
      "",
      `**What differs:** ${f.detail}`,
      "",
      "**Our analysis:**",
      fence("ts", f.ours),
      "",
      `Shrunk from \`${f.source}\` (seed ${report.seed}); the generated statement was:`,
      fence("sql", f.original),
      "",
      `It runs over the fuzz schema and data in \`packages/core/test/fuzz/schema.ts\`. ${replayCommand(f.sql)}`,
      "The fixing commit adds it as a `test-d` case and closes this issue.",
    ].join("\n"),
    comment: [`A shorter counterexample from the nightly run (seed ${report.seed}):`, "", fence("sql", f.sql), "", `**What differs:** ${f.detail}`].join("\n"),
  }));
  file(items, "fuzz");
  for (const r of report.replayed ?? []) {
    const n = /^issue#(\d+)$/.exec(r.key)?.[1];
    if (n && !r.failing) comment(Number(n), `This statement no longer fails in the nightly run (seed ${report.seed}). The fixing commit should close this issue with its regression test.`);
  }
}

const PROPERTIES = {
  rejects: "Postgres accepts it, we return an error",
  types: "a column name or type, or a parameter type, differs from what Postgres describes",
  nulls: "Postgres returned NULL in a column we type non-null",
  accepts: "Postgres rejects it, we infer a type",
  crash: "the compiler gave up",
};

function fuzzOpen() {
  if (!flags.out) usage("fuzz-open needs --out");
  const statements = openIssues("fuzz").flatMap((i) => {
    const sql = statementOf(i.body);
    return sql ? [{ sql, key: `issue#${i.number}` }] : [];
  });
  writeFileSync(flags.out, `${JSON.stringify(statements)}\n`);
  console.log(`${statements.length} open fuzz issue statement(s) written to ${flags.out}`);
}

function mutation() {
  if (!flags.report) usage("mutation needs --report");
  const report = JSON.parse(readFileSync(flags.report, "utf8"));
  const survivors = report.survivors ?? [];
  const items = survivors.map((s) => {
    const site = `${s.file}:${s.line}:${s.column ?? 0}`;
    return {
      // type-mutate's ids stay the same when other lines of the file change
      signature: s.id ? `mutation ${s.id}` : `mutation ${s.file} ${s.mutator} ${s.line}:${s.column ?? 0}`,
      title: `mutation: ${s.mutator} survives at ${site}`,
      size: 0,
      labels: ["mutation"],
      body: [
        `No type test fails when this type-level mutation is applied (nightly \`pnpm mutate:types\`).`,
        "",
        `**Site:** \`${site}\` (${s.mutator})`,
        "",
        "Original:",
        fence("ts", s.original ?? ""),
        "Mutated:",
        fence("ts", s.mutated ?? ""),
        "",
        "Add a test that fails with the mutation applied, or mark the line `// type-mutate: equivalent – <reason>` if the mutant is equivalent.",
      ].join("\n"),
      comment: "",
    };
  });
  file(items, "mutation");
}

function baseline() {
  if (!flags.files.length) usage("baseline needs baseline files");
  let opened = 0;
  for (const path of flags.files) {
    const text = readFileSync(path, "utf8");
    const json = JSON.parse(text);
    const key = Object.keys(json).find((k) => typeof json[k] === "object" && json[k] !== null && !Array.isArray(json[k]));
    let out = text;
    for (const [group, list] of Object.entries(json[key])) {
      for (const e of list) {
        if (e.issue !== "pending") continue;
        if (opened >= flags.cap) {
          say(`cap reached: ${group} ${e.kind} ${e.hash} not opened`);
          continue;
        }
        const body = [
          `The type oracle (\`${path}\`) lists a disagreement with PostgreSQL in the unsafe direction (**${e.kind}**).`,
          "",
          "<!-- typesql-statement -->",
          fence("sql", e.sql ?? ""),
          "",
          `**Where:** ${group}${e.line ? `, line ${e.line}` : ""}`,
          "",
          `**What differs:** ${e.detail ?? ""}`,
          "",
          "The fixing commit removes the baseline entry (the oracle fails until it does) and closes this issue.",
          "",
          marker(`baseline ${group} ${e.kind} ${e.hash}`),
        ].join("\n");
        const n = create(`${e.kind}: ${String(e.sql ?? "").slice(0, 70)}`, body, ["unsound"]);
        opened++;
        if (n !== null) out = out.replace(JSON.stringify(e), JSON.stringify({ ...e, issue: n }));
      }
    }
    if (!flags.dryRun && out !== text) writeFileSync(path, out);
  }
}

function labels() {
  for (const [name, l] of Object.entries(LABELS)) {
    if (flags.dryRun) say(`would create label ${name}`);
    else gh(["label", "create", name, "--color", l.color, "--description", l.description, "--force"]);
  }
}

function usage(message) {
  console.error(`${message}\nusage: issues.mjs fuzz|mutation --report <file> | baseline <file…> | fuzz-open --out <file> | labels  [--dry-run] [--cap n]`);
  process.exit(2);
}

const commands = { fuzz, mutation, baseline, "fuzz-open": fuzzOpen, labels };
if (!commands[command]) usage(`unknown command ${command ?? ""}`);
commands[command]();
if (process.env.GITHUB_STEP_SUMMARY && summary.length) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Issues (${command})\n\n${summary.map((l) => `- ${l}`).join("\n")}\n`);
