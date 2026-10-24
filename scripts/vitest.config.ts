import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "scripts",
    include: ["**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/fixture/**"],
  },
});
