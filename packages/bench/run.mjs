#!/usr/bin/env node
// Measures `tsc --noEmit --extendedDiagnostics` per generated file, writes results.json, prints
// a table and exits 1 when a file exceeds thresholds.json. `--calibrate` rewrites
// thresholds.json from the measured numbers x2 (check time gets a 1.5 s floor: for sub-second
// files the fixed cost of loading lib.d.ts + core and CPU contention dominate, and instantiation
// counts are the deterministic signal) before checking.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tsc = join(here, "../../node_modules/.bin/tsc");
const names = ["q1", "q50", "q500", "maxlen"];
const calibrate = process.argv.includes("--calibrate");
const thresholdsPath = join(here, "thresholds.json");

for (const name of names) {
  if (!existsSync(join(here, "src", `${name}.ts`))) {
    console.error(`missing src/${name}.ts — run \`node gen.mjs\` first`);
    process.exit(2);
  }
}

function measure(name) {
  const configPath = join(here, `tsconfig.${name}.json`);
  writeFileSync(configPath, JSON.stringify({ extends: "./tsconfig.json", include: [], files: [`src/${name}.ts`] }, null, 2));
  try {
    const started = performance.now();
    const proc = spawnSync(tsc, ["--noEmit", "--extendedDiagnostics", "-p", configPath], { cwd: here, encoding: "utf8" });
    const wallTimeSec = (performance.now() - started) / 1000;
    const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
    const num = (label) => {
      const m = out.match(new RegExp(`^${label}:\\s+([\\d.]+)`, "m"));
      return m ? Number(m[1]) : null;
    };
    const errors = [...out.matchAll(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/gm)].map((m) => ({
      file: m[1],
      line: Number(m[2]),
      code: m[4],
      message: m[5],
    }));
    const file = `src/${name}.ts`;
    const inFile = errors.filter((e) => e.file.replaceAll("\\", "/").endsWith(file));
    const result = {
      name,
      file,
      instantiations: num("Instantiations"),
      types: num("Types"),
      checkTimeSec: num("Check time"),
      totalTimeSec: num("Total time"),
      wallTimeSec: Number(wallTimeSec.toFixed(3)),
      memoryMB: Math.round((num("Memory used") ?? 0) / 1024),
      /** Errors reported in the measured file itself (a probe or query that failed to infer). */
      errorCount: inFile.length,
      /** Errors anywhere else in the program, e.g. typesql itself not compiling. */
      otherErrorCount: errors.length - inFile.length,
      errors,
      exitCode: proc.status,
    };
    if (name === "maxlen") result.probes = probes(inFile);
    return result;
  } finally {
    unlinkSync(configPath);
  }
}

/** Map error lines in src/maxlen.ts back to the `export const lenNk = sql(...)` probe on that line. */
function probes(errors) {
  const lines = readFileSync(join(here, "src", "maxlen.ts"), "utf8").split("\n");
  const found = [];
  lines.forEach((line, index) => {
    const m = line.match(/^export const (\w+) = sql\(.*\); \/\/ (\d+) bytes$/);
    if (m) found.push({ name: m[1], bytes: Number(m[2]), ok: !errors.some((e) => e.line === index + 1) });
  });
  return found;
}

const results = names.map(measure);
writeFileSync(join(here, "results.json"), JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2) + "\n");

if (calibrate) {
  const thresholds = {};
  for (const r of results) {
    thresholds[r.name] = {
      // instantiation counts are deterministic: 30% headroom; check time is noisy: 2x (min 1.5 s)
      instantiations: Math.ceil((r.instantiations ?? 0) * 1.3),
      checkTimeSec: Math.max(1.5, Number(((r.checkTimeSec ?? 0) * 2).toFixed(2))),
      maxErrors: 0,
    };
    if (r.probes) {
      thresholds[r.name].maxErrors = r.probes.filter((p) => !p.ok).length;
      thresholds[r.name].minOkBytes = Math.max(0, ...r.probes.filter((p) => p.ok).map((p) => p.bytes));
    }
  }
  writeFileSync(thresholdsPath, JSON.stringify(thresholds, null, 2) + "\n");
  console.log(`wrote thresholds.json (measured x2)`);
}

const thresholds = existsSync(thresholdsPath) ? JSON.parse(readFileSync(thresholdsPath, "utf8")) : {};
const failures = [];
const rows = results.map((r) => {
  const t = thresholds[r.name];
  const problems = [];
  if (t) {
    if (r.instantiations == null || r.instantiations > t.instantiations) problems.push(`instantiations > ${t.instantiations}`);
    if (r.checkTimeSec == null || r.checkTimeSec > t.checkTimeSec) problems.push(`check time > ${t.checkTimeSec}s`);
    if (r.errorCount > (t.maxErrors ?? 0)) problems.push(`${r.errorCount} error(s) in file`);
    if (r.otherErrorCount > 0) problems.push(`${r.otherErrorCount} error(s) outside the file (core does not compile?)`);
    if (t.minOkBytes != null) {
      const maxOk = Math.max(0, ...(r.probes ?? []).filter((p) => p.ok).map((p) => p.bytes));
      if (maxOk < t.minOkBytes) problems.push(`max OK statement ${maxOk} B < ${t.minOkBytes} B`);
    }
  }
  if (problems.length) failures.push({ name: r.name, problems });
  return {
    file: r.file,
    instantiations: r.instantiations ?? "?",
    types: r.types ?? "?",
    "check s": r.checkTimeSec ?? "?",
    "total s": r.totalTimeSec ?? "?",
    "mem MB": r.memoryMB,
    errors: r.otherErrorCount ? `${r.errorCount}+${r.otherErrorCount}` : r.errorCount,
    status: problems.length ? "FAIL" : t ? "ok" : "no threshold",
  };
});

function table(objects) {
  const keys = Object.keys(objects[0]);
  const width = keys.map((k) => Math.max(k.length, ...objects.map((o) => String(o[k]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(width[i])).join("  ");
  console.log(line(keys));
  console.log(width.map((w) => "-".repeat(w)).join("  "));
  for (const o of objects) console.log(line(keys.map((k) => o[k])));
}
table(rows);
const maxlen = results.find((r) => r.probes);
if (maxlen) console.log(`\nmaxlen probes: ${maxlen.probes.map((p) => `${p.name}=${p.bytes}B:${p.ok ? "ok" : "FAIL"}`).join("  ")}`);
for (const r of results) for (const e of r.errors) console.log(`  [${r.name}] ${e.file}:${e.line} ${e.code} ${e.message.slice(0, 140)}`);

if (failures.length) {
  console.error(`\nthreshold violations:`);
  for (const f of failures) console.error(`  ${f.name}: ${f.problems.join(", ")}`);
  process.exit(1);
}
console.log("\nall files within thresholds");
