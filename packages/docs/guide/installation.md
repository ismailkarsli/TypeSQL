# Installation

## Requirements

- **TypeScript 7.1 or later.** This is the native compiler; `7.1.0-beta` works. You can also use [tsrs](https://github.com/oxc-project/tsrs) (a Rust port of TypeScript 7.1). Older versions are not supported: TypeScript 7.0, 6 and 5.9 may still type-check queries, but they are not tested and the peer dependency rejects them. TypeScript 6 and 5.9 are several times slower, and editor completions need 7.1.
- **A supported database.** TypeSQL supports PostgreSQL and SQLite. MySQL support is planned.

## Install TypeSQL

Install `@typesql/core` and the adapter for your driver:

| Package | Runs queries on |
|---|---|
| [`@typesql/pg`](../adapters/pg) | node-postgres (`pg`) |
| [`@typesql/postgres`](../adapters/postgres) | postgres.js (`postgres`) |
| [`@typesql/sqlite`](../adapters/sqlite) | node:sqlite, bun:sqlite or better-sqlite3 |

`@typesql/core` has no runtime dependencies (only `typesql migrate` needs `typescript` at runtime; see [tracked migration files](./migrations#tracked-migration-files)). The packages are ESM-only. `import` and Node's `require()` of ES modules both work, but TypeScript rejects imports from `.cts` files under `node16`/`nodenext` resolution (TS1479). The adapter types rows the way your driver returns them and runs queries on your client.

## Install TypeScript 7.1

If your project is on an older TypeScript, add 7.1 as a dev dependency:

::: code-group

```sh [npm]
npm install -D typescript@7.1.0-beta
```

```sh [pnpm]
pnpm add -D typescript@7.1.0-beta
```

```sh [yarn]
yarn add -D typescript@7.1.0-beta
```

:::

Your editor should check the project with TypeScript 7.1 as well. [VS Code extension](./vscode#setup) shows how to point VS Code at it. You can also use [tsrs](https://github.com/oxc-project/tsrs), a Rust port of TypeScript 7.1. See [Performance](./performance) for benchmark results.

## Using Kysely, Drizzle or Prisma

If your schema is already described for one of them, install its TypeSQL package instead of writing it again:

| Package | Peer dependency |
|---|---|
| `@typesql/kysely` | `kysely` 0.28 or later |
| `@typesql/drizzle` | `drizzle-orm` 0.45 or later, before 1.0 |
| `@typesql/prisma` | `@prisma/client` 7 or later |

See [From Kysely, Drizzle or Prisma](./orms).

## The `typesql` command (optional)

`@typesql/cli` provides `typesql introspect`, which writes your schema from a PostgreSQL or SQLite database. See [From a live database](./introspect).

## Editor extension (optional)

The [VS Code extension](./vscode), and `@typesql/language-server` in [Neovim](./neovim), complete table and column names inside your SQL strings and highlight the SQL. Types and errors work without them.

## Next

Continue with the [Quick start](./quick-start).
