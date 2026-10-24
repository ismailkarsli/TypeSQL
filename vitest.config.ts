import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { coverageExclude, coverageFiles, coverageInclude } from "./scripts/coverage-files.mjs";

// A runtime file missing from coverage-thresholds.json (a new one) must be fully covered.
const uncovered: Record<string, Partial<Record<"lines" | "branches" | "functions" | "statements", number>>> = JSON.parse(
  readFileSync(new URL("./coverage-thresholds.json", import.meta.url), "utf8"),
).uncovered;
const ratchet = process.env.TYPESQL_COVERAGE_RATCHET === "1";

export default defineConfig({
  test: {
    reporters: ["default", "./packages/core/test/conformance/skip-reporter.ts"],
    projects: [
      "packages/*/vitest.config.ts",
      "packages/vscode/vitest.config.mts",
      "packages/core/vitest.cache.config.ts",
      "packages/core/vitest.types-cached.config.ts",
      "scripts/vitest.config.ts",
    ],
    coverage: {
      provider: "v8",
      include: coverageInclude,
      exclude: coverageExclude,
      reporter: [["text", { skipFull: true }], "json-summary", "json"],
      // A negative threshold is a count (at most that many uncovered); none uncovered is 100%.
      thresholds: ratchet
        ? {}
        : Object.fromEntries(
            coverageFiles().map((file) => {
              const max = uncovered[file] ?? {};
              const limit = (n = 0) => (n === 0 ? 100 : -n);
              return [file, { lines: limit(max.lines), branches: limit(max.branches), functions: limit(max.functions), statements: limit(max.statements) }];
            }),
          ),
    },
  },
});
