---
description: "Write plain SQL in TypeScript and get exact types for rows and parameters. No codegen, no database connection, no build step."
layout: home

hero:
  name: "TypeSQL"
  text: "Typed SQL for TypeScript"
  tagline: "Write plain SQL and get exact types for rows and parameters. No codegen, no database connection, no build step. The runtime is tiny (under 3 kB)."
  image:
    src: /logo.svg
    alt: "TypeSQL logo"
  actions:
    - theme: brand
      text: "Get started"
      link: /guide/quick-start
    - theme: alt
      text: "Introduction"
      link: /guide/introduction

features:
  - title: "Plain SQL, exact types"
    details: "Write the SQL your database runs. Row and parameter types follow its rules, including nullability from joins. PostgreSQL, SQLite, MySQL and MariaDB are supported."
  - title: "No codegen"
    details: "The TypeScript compiler reads your SQL. There is no generate step and no database to connect to."
  - title: "Mistakes are compile errors"
    details: "A misspelled column, an unknown table or a wrong parameter is caught in your editor, worded like your database's errors."
  - title: "Editor support"
    details: "VS Code and Neovim complete tables and columns and highlight the SQL inside your strings."
    link: /guide/vscode
    linkText: "Set it up"
---

::: code-group

```ts [PostgreSQL]
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./schema.js";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const sql = createSql<DB>(pool);

const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param(new Date("2026-01-01"))}`,
);

const rows = await recent.execute();
```

```ts [SQLite]
import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";
import type { DB } from "./schema.js";

const sql = createSql<DB>(new DatabaseSync("app.db"));

const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param("2026-01-01")}`,
);

const rows = await recent.execute();
```

```ts [MySQL]
import { createPool } from "mysql2/promise";
import { createSql } from "@typesql/mysql";
import type { DB } from "./schema.js";

const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));

const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param(new Date("2026-01-01"))}`,
);

const rows = await recent.execute();
```

:::