import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "packages/vscode/vitest.config.mts", "packages/core/vitest.cache.config.ts", "packages/core/vitest.types-cached.config.ts"],
  },
});
