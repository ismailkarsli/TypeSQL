import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { buildCache } from "./generate.js";

const here = import.meta.dirname;
const tsc = resolve(here, "../../../../node_modules/.bin/tsc");

/** The diagnostics of `project`, one per line, as test/error-messages.test.ts writes them. */
function diagnostics(project: string, extra: string[] = []): { lines: string[]; instantiations: number } {
  let out = "";
  try {
    out = execFileSync(tsc, ["-p", project, "--pretty", "false", "--extendedDiagnostics", "--checkers", "1", ...extra], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = String((e as { stdout?: string }).stdout ?? "");
  }
  const lines = out.split("\n").filter((l) => l.includes("error TS")).map((l) => l.replace(/^.*fixtures\/errors\.ts/, "errors.ts"));
  return { lines, instantiations: Number(/Instantiations:\s+(\d+)/.exec(out)?.[1]) };
}

test("with a cache, the error fixture reports the same diagnostics, from cached entries", async () => {
  const r = await buildCache(resolve(here, "errors/tsconfig.gen.json"));
  expect(r.computed).toBeGreaterThan(0);
  const cold = diagnostics(resolve(here, "../errors/tsconfig.json"));
  const cached = diagnostics(resolve(here, "errors/tsconfig.json"));
  expect(cached.lines.join("\n")).toBe(readFileSync(resolve(here, "../errors/__snapshots__/errors.txt"), "utf8"));
  expect(cached.lines).toEqual(cold.lines);
  // the cache was used
  expect(cached.instantiations).toBeLessThan(cold.instantiations * 0.8);
}, 300_000);
