import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsc = resolve(here, "../../../node_modules/.bin/tsc");
const project = resolve(here, "errors/tsconfig.json");

/**
 * Compile the error fixture and snapshot the diagnostics (one per line, path-relative).
 * Run `vitest run -u` after an intentional message change and review the diff.
 */
test("compile errors read like Postgres errors", async () => {
  let out = "";
  try {
    execFileSync(tsc, ["-p", project, "--pretty", "false"], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = String((e as { stdout?: string }).stdout ?? "");
  }
  const lines = out
    .split("\n")
    .filter((l) => l.includes("error TS"))
    .map((l) => l.replace(/^.*fixtures\/errors\.ts/, "errors.ts"));
  expect(lines.length).toBeGreaterThan(0);
  await expect(lines.join("\n")).toMatchFileSnapshot("errors/__snapshots__/errors.txt");
}, 60_000);
