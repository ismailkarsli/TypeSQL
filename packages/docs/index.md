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
      link: https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixEpNnADCEYnEiMYAc3SM4I8ZJny2SgqvXKrt+1u1dADtsKFEMZCoAEQAhRG0ASABXRjQoRgAueISE4AATLLMCAB5pYBCAFmkSJAALDEYotHCkghgsmCgkqiEAPh0ctBAMYAJC81LsAA8YaX7EhLzgRjACDDIAfSCGNHGS6WnZmrgg1rWAIwJd0i6e+ZzUTGw8jaw9ydBFGAYwGAAvaqGeqNZoYVrtG7dRz3IQDXyZbK5AqmCZlEIADkBdQaTRabQ6t2hAwSYJgtWgG3y7zRMCq9wSMGAMCu1MOc2J5wgeTIrLQMyxJzOGEu106UL6A1h2iEgTUQWscA8cAAvCh0FhcIRirFegAKXx2RQASh02jlCrwKsVhF1iQABjgAKIAGUdJmYcCSADp8iRvUMRhYwF7Gcy0No4JGo9GYwAxbgAeQAsp7UulPXBXbGPQApBMASQAcpYINYHGA4Ani8HSeSoJS8lbvfkIzG21GAOoACUd3Ednp9jdVABIAIx2oiJADsk5N2gUPH4Vt4AjYxQUEFEcDw8wXtHoTCt+4YLDXG63O9N5vg1iwDlVHltCQdLrdHtrFN9KAgSRCuoAVEaJDDFMuqhlcRpwAAgjgcBrNgCrxsmJZlnAADiiYAKrUHAMQAJpwB+9b5BO2hzguODfDA96LqulDrmwm6KlRjDzGaEDyvAAajFa0gYHkGCyHyPxXF6aggAE15qk8aBDtaBBPnaRZOtwHpFswCapmkDi6txBCQQAalBzqYY6sG6sOCAeF6YB0AwunDKMRpCJBfbMJh3CFkWaFwF+jwai8WCkeRxgmOqzzLvwghoAxlBMf5zxsY+L6uu6JwgFQSEpik2l2nOyXKb2amFhpKHUXAYFMhBcBGSZZkVWORoTjIXZoAQBAQNIc5AA
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