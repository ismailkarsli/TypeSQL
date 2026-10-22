import { defineWranglerConfig } from "wrangler/experimental-config";

// Where `cf deploy` finds the VitePress build; the deploy script runs `vitepress build` first.
export default defineWranglerConfig({
  assetsDirectory: ".vitepress/dist",
});
