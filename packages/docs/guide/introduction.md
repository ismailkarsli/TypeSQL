---
description: "What TypeSQL is: describe your tables once, write SQL as a string, and the TypeScript compiler infers the exact row and parameter types."
---

# Introduction

TypeSQL gives you exact TypeScript types for the SQL you write. You describe your tables once, write SQL as a string, and the compiler tells you what comes back:

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
   WHERE u.created_at > $1`,
	new Date("2026-01-01"),
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
   WHERE u.created_at > $1`,
	"2026-01-01",
);

const rows = await recent.execute();
```

:::

## How it works

TypeSQL is written in TypeScript's type system. When you call `sql("…")` with a string literal, the compiler parses the SQL and looks up its tables and columns in your schema type, in your editor and in `tsc`. There is no generated file and no build step. At runtime, `sql("…")` only builds `{ text, values }`, and your driver sends it to the database unchanged.

## What you get

- **Row types.** Column names and types follow your database, including nullability from outer joins, aggregates, `COALESCE` and `WHERE … IS NOT NULL`.
- **Parameter types.** `$1`, `:name` and inline `${sql.param(value)}` each take their type from where they are used.
- **Compile errors.** An unknown column, a missing `NOT NULL` value or a syntax error shows up on the string, worded like the database's error.
- **The whole statement language.** From joins and CTEs to `MERGE` and SQL/JSON.
- **A thin runtime.** `@typesql/core` has no dependencies. Adapters run queries on node-postgres, postgres.js, SQLite (node:sqlite, better-sqlite3, bun:sqlite), Kysely, Drizzle or Prisma.
- **Editor support.** The optional editor support for [VS Code](./vscode) and [Neovim](./neovim) completes table and column names and highlights the SQL.

## Dialects

The core is dialect-neutral: each SQL dialect brings its own parser, type rules and type names. PostgreSQL and [SQLite](./sqlite) are supported. MySQL is planned.

## Next

- [Quick start](./quick-start): requirements, installation and your first typed query.
- [Compared to other tools](../compared-to/kysely): Kysely, Drizzle, Prisma and Reylo.
- [Upgrading](./upgrading): moving from an earlier version, with the [changelog](/changelog).
