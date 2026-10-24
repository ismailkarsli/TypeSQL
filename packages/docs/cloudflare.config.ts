import { defineConfig } from "cf/config";

// The docs site is a static-assets-only Worker: `pnpm docs:deploy` builds it with VitePress and
// serves it at typesql.karsli.net.
export default defineConfig({
	accountId: "311e83470c16e6f5c0171447330e007c",
	worker: {
		name: "typesql-docs",
		compatibilityDate: "2026-10-22",
		assets: {
			// cleanUrls: /guide/queries is served from guide/queries.html.
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "404-page",
		},
		domains: ["typesql.karsli.net"],
		workersDev: false,
		previewUrls: false,
	},
});
