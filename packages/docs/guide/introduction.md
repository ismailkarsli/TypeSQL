# Introduction

TypeSQL gives you exact TypeScript types for the Postgres SQL you write. You describe your tables once, write SQL as a string, and the compiler tells you what comes back:

<<< @/snippets/getting-started.ts#query

## How it works

TypeSQL is written in TypeScript's type system. When you call `sql("…")` with a string literal, the compiler parses the SQL and looks up its tables and columns in your schema type, in your editor and in `tsc`. There is no generated file and no build step. At runtime, `sql("…")` only builds `{ text, values }`, and your driver sends it to Postgres unchanged.

## What you get

- **Row types.** Column names and types follow Postgres, including nullability from outer joins, aggregates, `COALESCE` and `WHERE … IS NOT NULL`.
- **Parameter types.** `$1`, `:name` and inline `${sql.param(value)}` each take their type from where they are used.
- **Compile errors.** An unknown column, a missing `NOT NULL` value or a syntax error shows up on the string, worded like the Postgres error.
- **The whole statement language.** From joins and CTEs to `MERGE` and SQL/JSON. See [Postgres compatibility](./postgres-compatibility).
- **A thin runtime.** `@typesql/core` has no dependencies. Adapters run queries on node-postgres, postgres.js, Kysely, Drizzle or Prisma.
- **Editor support.** The optional editor support for [VS Code](./vscode) and [Neovim](./neovim) completes table and column names and highlights the SQL.

## Tested against Postgres itself

The parser is checked against PostgreSQL 18's own regression tests, about 50,000 statements. It accepts what Postgres accepts and rejects what Postgres rejects, on every statement that can be checked without running it. See [Postgres compatibility](./postgres-compatibility).

## Next

- [Installation](./installation): requirements and the packages for your driver.
- [Quick start](./quick-start): your first typed query.
- [Comparison](./comparison): how TypeSQL differs from code generators, query builders and ORMs.
