import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "vscode",
    include: ["test/**/*.test.ts"],
  },
});
