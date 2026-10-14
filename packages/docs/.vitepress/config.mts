import { defineConfig } from "vitepress";

export default defineConfig({
  title: "typesql",
  description: "Type-level Postgres SQL for TypeScript: row and parameter types inferred from SQL string literals, with no codegen.",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      { text: "Reference", link: "/reference/api", activeMatch: "/reference/" },
      { text: "Internals", link: "/internals/engine", activeMatch: "/internals/" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Schema and type maps", link: "/guide/schema" },
          { text: "Queries", link: "/guide/queries" },
          { text: "Parameters", link: "/guide/parameters" },
          { text: "Fragments", link: "/guide/fragments" },
          { text: "Writing data", link: "/guide/writing-data" },
          { text: "Migrations", link: "/guide/migrations" },
          { text: "Adapters", link: "/guide/adapters" },
          { text: "ORM schemas", link: "/guide/orm-schemas" },
          { text: "Errors and limits", link: "/guide/errors-and-limits" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "API", link: "/reference/api" },
          { text: "DDL support", link: "/reference/ddl" },
        ],
      },
      {
        text: "Internals",
        items: [
          { text: "Type engine", link: "/internals/engine" },
          { text: "Development", link: "/internals/development" },
        ],
      },
    ],
    search: { provider: "local" },
    outline: { level: [2, 3] },
  },
});
