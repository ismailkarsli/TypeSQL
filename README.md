<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img src=".github/assets/logo-light.svg" alt="TypeSQL" height="56">
  </picture>
</h1>

Write SQL in TypeScript and get exact types for rows and parameters. TypeSQL parses your SQL inside the type checker: no codegen, no database connection, no build step.

TypeSQL supports PostgreSQL, SQLite, MySQL and MariaDB. The `@typesql/core` runtime is tiny (under 3 kB minified and gzipped) and has no dependencies.

<a href="https://www.npmjs.com/package/@typesql/core"><img src="https://img.shields.io/npm/v/@typesql/core" alt="npm version" height="20"></a>
<a href="https://www.npmjs.com/package/@typesql/core"><img src="https://img.shields.io/npm/dm/@typesql/core" alt="npm downloads" height="20"></a>
<a href="https://bundlephobia.com/package/@typesql/core"><img src="https://img.shields.io/bundlejs/size/@typesql/core?label=bundle%20size" alt="bundle size" height="20"></a>
<a href="https://github.com/ismailkarsli/TypeSQL"><img src="https://img.shields.io/github/stars/ismailkarsli/TypeSQL" alt="GitHub stars" height="20"></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/ismailkarsli/TypeSQL" alt="License" height="20"></a>

[![TypeSQL migrations and typed queries](.github/assets/demo.gif)](https://cdn.jsdelivr.net/gh/ismailkarsli/TypeSQL@main/.github/assets/demo.mp4)

## Get started

### Get your schema

TypeSQL checks queries against a `DB` type that describes your tables. Derive it [from your migrations](https://typesql.karsli.net/guide/migrations), generate it [from a live database](https://typesql.karsli.net/guide/introspect), or take it [from Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms).

You can also [write it by hand](https://typesql.karsli.net/guide/schema) with your database's type names.

### Write typed queries

Create `sql` from your driver's client, import the schema and run SQL against it:

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./db/schema";

const sql = createSql<DB>(new Pool());

// rows is { email: string; title: string | null }[]: the LEFT JOIN makes title nullable.
// sql.param() sends userId as a parameter, typed like u.id, so it must be a number.
const rows = await sql(
  `SELECT u.email, p.title
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.id = ${sql.param(userId)}`,
).execute();

// Compile error: column "emial" does not exist. Perhaps you meant the column "email"?
sql("SELECT emial FROM users");
```

`@typesql/postgres` works the same way with postgres.js, `@typesql/sqlite` with node:sqlite, better-sqlite3 and bun:sqlite, and `@typesql/mysql` with mysql2, the mariadb connector, PlanetScale and TiDB Cloud; see [SQLite](https://typesql.karsli.net/adapters/sqlite) and [MySQL and MariaDB](https://typesql.karsli.net/adapters/mysql).

## Editor support

Every TypeScript editor shows a query's row type on hover and underlines mistakes in the SQL. The TypeSQL extension for VS Code ([Marketplace](https://marketplace.visualstudio.com/items?itemName=typesql.typesql), [Open VSX](https://open-vsx.org/extension/typesql/typesql)) adds table and column completions and syntax highlighting inside `sql()` strings. See [VS Code](https://typesql.karsli.net/guide/vscode) and [Neovim](https://typesql.karsli.net/guide/neovim).

## Documentation

The full guide is at **[typesql.karsli.net](https://typesql.karsli.net)**. It covers the SQL TypeSQL supports, parameters and fragments, writing data, and known limits. Upgrading? See the [upgrade guide](https://typesql.karsli.net/guide/upgrading) and the [changelog](https://typesql.karsli.net/changelog).

## License

[MIT](LICENSE)
