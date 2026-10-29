import { defineConfig } from "cf/config";

export default defineConfig({
	accountId: "311e83470c16e6f5c0171447330e007c",
	worker: {
		name: "typesql-docs",
		compatibilityDate: "2026-10-22",
		assets: {
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "404-page",
		},
		domains: ["typesql.karsli.net"],
		workersDev: false,
		previewUrls: false,
	},
});
