import { defineConfig } from "vitest/config";

// Type cache tests: their fixtures augment `QueryCache`, so they get their own program
// (test/cache/tsconfig.json) and stay out of the main type tests.
export default defineConfig({
  test: {
    name: "core-cache",
    include: ["test/cache/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["test/cache/**/*.test-d.ts"],
      tsconfig: "./test/cache/tsconfig.json",
    },
  },
});
