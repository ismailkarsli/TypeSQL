# Installation

## Requirements

- **TypeScript 7.1 or later.** This is the native compiler; `7.1.0-beta` works. You can also use [tsrs](https://github.com/oxc-project/tsrs) (a Rust port of TypeScript 7.1). Older versions are not supported.
- **A supported database.** TypeSQL supports PostgreSQL today. MySQL and SQLite support is planned.

## Install TypeSQL

Install the core package, the adapter for your driver, and the driver itself.

### node-postgres

::: code-group

```sh [npm]
npm install @typesql/core @typesql/pg pg
```

```sh [pnpm]
pnpm add @typesql/core @typesql/pg pg
```

```sh [yarn]
yarn add @typesql/core @typesql/pg pg
```

:::

### postgres.js

::: code-group

```sh [npm]
npm install @typesql/core @typesql/postgres postgres
```

```sh [pnpm]
pnpm add @typesql/core @typesql/postgres postgres
```

```sh [yarn]
yarn add @typesql/core @typesql/postgres postgres
```

:::

`@typesql/core` has no runtime dependencies. The adapter types rows the way your driver returns them and runs queries on your client.

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
| `@typesql/kysely` | `kysely` 0.27 or later |
| `@typesql/drizzle` | `drizzle-orm` 0.45 or later |
| `@typesql/prisma` | `@prisma/client` 7 or later |

See [From Kysely, Drizzle or Prisma](./orms).

## Editor extension (optional)

The [VS Code extension](./vscode), and `@typesql/language-server` in [Neovim](./neovim), complete table and column names inside your SQL strings and highlight the SQL. Types and errors work without them.

## Next

Continue with the [Quick start](./quick-start).
