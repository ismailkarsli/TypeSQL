import { defineConfig } from "vitepress";

const github = "https://github.com/ismailkarsli/TypeSQL";

export default defineConfig({
	title: "TypeSQL",
	description:
		"Write Postgres SQL in TypeScript and get exact types for rows and parameters. No codegen, no database connection, no build step.",
	cleanUrls: true,
	head: [
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
	],
	srcExclude: ["internals/**"],
	themeConfig: {
		nav: [
			{
				text: "Guide",
				link: "/guide/introduction",
				activeMatch: "/(guide|adapters)/",
			},
			{ text: "Reference", link: "/reference/api", activeMatch: "/reference/" },
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
					{ text: "Installation", link: "/guide/installation" },
					{ text: "Quick start", link: "/guide/quick-start" },
					{ text: "Comparison", link: "/guide/comparison" },
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
					{ text: "Using <code>sql</code>", link: "/guide/using-sql" },
					{ text: "Selecting data", link: "/guide/queries" },
					{ text: "Parameters", link: "/guide/parameters" },
					{ text: "Inserting and updating", link: "/guide/writing-data" },
					{ text: "Dynamic SQL", link: "/guide/dynamic-sql" },
					{ text: "Transactions", link: "/guide/transactions" },
					{ text: "Recipes", link: "/guide/recipes" },
				],
			},
			{
				text: "Running queries",
				items: [
					{ text: "node-postgres", link: "/adapters/pg" },
					{ text: "postgres.js", link: "/adapters/postgres" },
					{ text: "Custom executor", link: "/adapters/custom-executor" },
				],
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
					{ text: "Performance and type cache", link: "/guide/performance" },
					{ text: "Limits", link: "/guide/limits" },
					{
						text: "Postgres compatibility",
						link: "/guide/postgres-compatibility",
					},
					{ text: "Type engine", link: "/guide/type-engine" },
					{ text: "FAQ", link: "/guide/faq" },
				],
			},
			{
				text: "Reference",
				items: [
					{ text: "API", link: "/reference/api" },
					{ text: "DDL support", link: "/reference/ddl" },
					{ text: "Type mapping", link: "/reference/type-mapping" },
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
