import { coverageFiles } from "./scripts/coverage-files.mjs";

const mutate = process.env.TYPESQL_MUTATE?.split("\n").filter(Boolean) ?? coverageFiles();
const files = [...new Set(mutate.map((m) => m.replace(/:\d+(-\d+)?$/, "")))];

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  // `related: false`: the runner's related-files lookup finds no tests across vitest projects.
  vitest: { configFile: "vitest.stryker.config.ts", related: false },
  coverageAnalysis: "perTest",
  // In place: a sandbox copy would keep the pnpm workspace links pointing at the real sources.
  inPlace: true,
  tempDirName: ".stryker-tmp",
  mutate,
  // `// @ts-nocheck` in the mutated files only: tests that run tsc must not see the instrumented
  // code's type errors, and tests that compare generated files byte for byte must not see the comment.
  disableTypeChecks: files.length === 1 ? files[0] : `{${files.join(",")}}`,
  concurrency: 2,
  timeoutMS: 10000,
  dryRunTimeoutMinutes: 20,
  reporters: ["clear-text", "progress", "json", "html"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  clearTextReporter: { allowColor: false, logTests: false, reportScoreTable: true },
};
