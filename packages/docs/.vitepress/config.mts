import { sqlHighlighting } from "./sql-highlighting.ts";
import { withVersions } from "./versions.ts";

const github = "https://github.com/ismailkarsli/TypeSQL";
const hostname = "https://typesql.karsli.net";

export default withVersions({
	lang: "en-US",
	title: "TypeSQL",
	description:
		"Write SQL in TypeScript and get exact types for rows and parameters. No codegen, no database connection, no build step.",
	cleanUrls: true,
	sitemap: { hostname },
	markdown: sqlHighlighting,
	head: [
		["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
		[
			"style",
			{},
			`.VPSidebarItem code, .VPNavBarMenuLink code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--vp-code-bg);
  color: var(--vp-code-color);
  font-weight: 500;
}
.VPSidebarItem.is-active code,
.VPSidebarItem .link:hover code {
  color: var(--vp-c-brand-1);
}`,
		],
		["meta", { property: "og:type", content: "website" }],
		["meta", { property: "og:site_name", content: "TypeSQL" }],
		["meta", { property: "og:image", content: `${hostname}/og-image.png` }],
		["meta", { property: "og:image:width", content: "1200" }],
		["meta", { property: "og:image:height", content: "630" }],
		[
			"meta",
			{
				property: "og:image:alt",
				content:
					"TypeSQL: Type-safe SQL for TypeScript, with no code generation or database connection.",
			},
		],
		["meta", { name: "twitter:card", content: "summary_large_image" }],
		["meta", { name: "twitter:image", content: `${hostname}/og-image.png` }],
	],
	transformHead({ pageData, siteConfig, title, description }) {
		if (pageData.isNotFound) return;
		const path = pageData.relativePath
			.replace(/(^|\/)index\.md$/, "$1")
			.replace(/\.md$/, "");
		const url = new URL(siteConfig.site.base + path, hostname).href;
		return [
			["link", { rel: "canonical", href: url }],
			["meta", { property: "og:url", content: url }],
			["meta", { property: "og:title", content: title }],
			["meta", { property: "og:description", content: description }],
			["meta", { name: "twitter:title", content: title }],
			["meta", { name: "twitter:description", content: description }],
		];
	},
	// CHANGELOG.md is this private package's own; `/changelog` is generated
	// from the published packages' changelogs by `[page].paths.ts`.
	srcExclude: ["internals/**", "CHANGELOG.md"],
	themeConfig: {
		logo: { light: "/logo-light.svg", dark: "/logo-dark.svg", alt: "TypeSQL" },
		siteTitle: false,
		nav: [
			{
				text: "Guide",
				link: "/guide/introduction",
				activeMatch: "/(guide|adapters|compared-to)/",
			},
			{ text: "Reference", link: "/reference/api", activeMatch: "/reference/" },
			{ text: "Changelog", link: "/changelog" },
		],
		socialLinks: [{ icon: "github", link: github }],
		editLink: {
			pattern: `${github}/edit/main/packages/docs/:path`,
			text: "Edit this page on GitHub",
		},
		sidebar: [
			{
				text: "Get started",
				items: [
					{ text: "Introduction", link: "/guide/introduction" },
					{ text: "Quick start", link: "/guide/quick-start" },
					{ text: "Upgrading", link: "/guide/upgrading" },
				],
			},
			{
				text: "Your schema",
				items: [
					{ text: "Declaring tables", link: "/guide/schema" },
					{ text: "From a live database", link: "/guide/introspect" },
					{ text: "From migrations", link: "/guide/migrations" },
					{ text: "From Kysely, Drizzle or Prisma", link: "/guide/orms" },
				],
			},
			{
				text: "Writing queries",
				items: [
					{ text: "Selecting data", link: "/guide/queries" },
					{ text: "Parameters", link: "/guide/parameters" },
					{ text: "Inserting and updating", link: "/guide/writing-data" },
					{ text: "Dynamic SQL", link: "/guide/dynamic-sql" },
					{ text: "Transactions", link: "/guide/transactions" },
				],
			},
			{
				text: "Running queries",
				items: [
					{ text: "PostgreSQL", link: "/adapters/postgresql" },
					{ text: "SQLite", link: "/adapters/sqlite" },
					{ text: "Custom executor", link: "/adapters/custom-executor" },
					{
						text: "Plugins",
						link: "/guide/plugins",
						items: [{ text: "CasePlugin", link: "/guide/case-plugin" }],
					},
				],
			},
			{
				text: "Integrations",
				items: [{ text: "Better Auth", link: "/guide/better-auth" }],
			},
			{
				text: "Editor",
				items: [
					{ text: "VS Code", link: "/guide/vscode" },
					{ text: "Neovim", link: "/guide/neovim" },
				],
			},
			{
				text: "Going further",
				items: [
					{ text: "Errors and troubleshooting", link: "/guide/errors" },
					{ text: "Limits", link: "/guide/limits" },
					{ text: "SQLite", link: "/guide/sqlite" },
					{
						text: "Compared to",
						collapsed: true,
						items: [
							{ text: "Kysely", link: "/compared-to/kysely" },
							{ text: "Drizzle", link: "/compared-to/drizzle" },
							{ text: "Prisma ORM", link: "/compared-to/prisma" },
							{ text: "Prisma TypedSQL", link: "/compared-to/prisma-typedsql" },
							{ text: "Reylo", link: "/compared-to/reylo" },
						],
					},
				],
			},
			{
				text: "Reference",
				items: [
					{ text: "API", link: "/reference/api" },
					{ text: "DDL support", link: "/reference/ddl" },
					{ text: "Type mapping", link: "/reference/type-mapping" },
					{ text: "Changelog", link: "/changelog" },
				],
			},
		],
		footer: {
			message: `Released under the MIT License. <a href="${github}">Source on GitHub</a>.`,
		},
		search: { provider: "local" },
		outline: { level: [2, 3] },
	},
});
