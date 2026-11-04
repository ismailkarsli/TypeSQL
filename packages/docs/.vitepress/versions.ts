import { readFileSync } from "node:fs";
import type { DefaultTheme, UserConfig } from "vitepress";

export interface DocsVersion {
	version: string;
	base: string;
	pages: string[];
}

export interface VersionTheme {
	docsVersion: string;
	docsVersions: DocsVersion[];
}

const { version }: { version: string } = JSON.parse(
	readFileSync(new URL("../../core/package.json", import.meta.url), "utf8"),
);
export const latestVersion = version.split(".").slice(0, 2).join(".");

export function withVersions(
	config: UserConfig<DefaultTheme.Config>,
): UserConfig<DefaultTheme.Config> {
	const archive = process.env.TYPESQL_DOCS_VERSION;
	const versions: DocsVersion[] = process.env.TYPESQL_DOCS_VERSIONS
		? JSON.parse(process.env.TYPESQL_DOCS_VERSIONS)
		: [{ version: latestVersion, base: "/", pages: [] }];
	const head = [...(config.head ?? [])];
	const themeConfig = {
		...config.themeConfig,
		nav: [
			...(config.themeConfig?.nav ?? []).filter(
				(item) =>
					!("component" in item && item.component === "VersionSelector"),
			),
			{ component: "VersionSelector" },
		],
		docsVersion: archive ?? "latest",
		docsVersions: versions,
	};
	if (archive) {
		head.push(["meta", { name: "robots", content: "noindex" }]);
		delete themeConfig.editLink;
	}
	// Archived versions are not indexed, so only the latest site has a sitemap.
	const { sitemap, ...rest } = config;
	const site: UserConfig<DefaultTheme.Config> = {
		...rest,
		base: archive ? `/versions/${archive}/` : "/",
		head,
		themeConfig,
	};
	if (sitemap && !archive) site.sitemap = sitemap;
	return site;
}
