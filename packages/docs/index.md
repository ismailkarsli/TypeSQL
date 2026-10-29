---
layout: home

hero:
  name: "TypeSQL"
  text: "Typed SQL for TypeScript"
  tagline: "Write plain SQL and get exact types for rows and parameters. No codegen, no database connection, no build step."
  actions:
    - theme: brand
      text: "Get started"
      link: /guide/quick-start
    - theme: alt
      text: "Try it in the Playground"
      link: https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixE2gJAK4AYQjFjpgOJoAdmnrYAJkWts4AOQCuBAhgARgTsxpCMMADm6IzuIuKSMvJsSgSq6srhUTFa2rr22FCiGMhUACIAQoZGPoxOjABc1UbALk12js5oLgA80sAFACzSAHw6RkZoIBjABE0WBH3YAB4wo+NGLsCMYAFkAPr2DGhNvv5BIUtoq+vGRqiYrvtY7Q5OWN1LoIowDGAwAC9bkYhOMso1mq1Xp0Pr1+gUABzAowYHwwAAW0H2UPMlj6AxgwzGdxgwBgIXmeOkKzWxImgQgLjIpz8AWCaCuNzpoO0QjyansETgqTgAF4UOgPvhFpURgAKLLRRQASh02gFQrwYuFhDlxgABjgAKIAGSNZmYcB8ADpWiQbVMZsQ4GBraTyWhtHBvT7fX6AGLcADyAFkrXUoIwrXAzf7LQApIMASS8LogESjYDgQdTrtRGKxrW1NtaXr95Z9AHUABJG7hGq22lzagAkAEZ9e4jAB2dyq7SmXh8bVDwQchQQURwPDE0y0ehMbXzhgsNg9CdTmdqjXwCJYKPi1J6oyG03my35zFQbFuFAQHwFOUAKmVJGmyzl7pCyrgAEEcHAATYEKgahmmGZwDYwYAKrUHAFQAJpwJehYuJ22j9qYOC-DAB48PwY7rmwk7CjhjDEuqECCvAjqzNq0gYC4GCyNcfwhNaaggLkO4So83TakeBopsa3CWimzBBuG9RwHKtEED+ABqv4mtBRoAXKLYIKk1pgHQDCydMszKkIP71sw0HcF4KY2HAdq8bCzwwOhmGeGYkquCOBFrhu9muBRR6nmaFpwPYIBUKBYa1PU+r9gFwl1mJXgSeBuEyV+aCKcpqnqe2yqdjI1ZoP4EDSP2QA
      playground: core
    - theme: alt
      text: "View on GitHub"
      link: https://github.com/ismailkarsli/TypeSQL

features:
  - title: "Plain SQL, exact types"
    details: "Write the SQL your database runs. Row and parameter types follow its rules, including nullability from joins. PostgreSQL today; MySQL and SQLite are planned."
  - title: "No codegen"
    details: "The TypeScript compiler reads your SQL. There is no generate step and no database to connect to."
  - title: "Mistakes are compile errors"
    details: "A misspelled column, an unknown table or a wrong parameter is caught in your editor, worded like your database's errors."
  - title: "Editor support"
    details: "VS Code and Neovim complete tables and columns and highlight the SQL inside your strings."
    link: /guide/vscode
    linkText: "Set it up"
---

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./schema.js";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const sql = createSql<DB>(pool);

const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > $1`,
	new Date("2026-01-01"),
);

const rows = await recent.execute();
```