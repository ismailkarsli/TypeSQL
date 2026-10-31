# @typesql/core

Write SQL in TypeScript and get exact types for rows and parameters. TypeSQL parses your SQL inside the type checker: no codegen, no database connection, no build step.

## Install

```sh
npm install @typesql/core
```

Requires TypeScript 7.1 or later.

## Usage

Describe your tables with your database's type names, then write queries:

```ts
import { createSql } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";

interface DB {
  users: {
    id: Col<"int4", { hasDefault: true }>;
    email: Col<"text">;
    display_name: Col<"text", { nullable: true }>;
  };
  posts: {
    id: Col<"int8", { hasDefault: true }>;
    author_id: Col<"int4">;
    title: Col<"text">;
  };
}

const sql = createSql<DB>(postgres);

const query = sql(
  `SELECT u.email, p.title
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
  7,
);

sql("SELECT emial FROM users");
```

[Open the example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixEpNnADCEYnEiMYAc3SM4I8ZJny2SgqvXKrt+1u1dADtsKFEMZCoAEQAhRG0ASABXRjQoRgAueISE4AATLLMCAB5pYBCAFmkSJAALDEYotHCkghgsmCgkqiEAPh0ctBAMYAJC81LsAA8YaX7EhLzgRjACDDIAfSCGNHGS6WnZmrgg1rWAIwJd0i6e+ZzUTGw8jaw9ydBFGAYwGAAvaqGeqNZoYVrtG7dRz3IQDXyZbK5AqmCZlEIADkBdQaTRabQ6t2hAwSYJgtWgG3y7zRMCq9wSMGAMCu1MOc2J5wgeTIrLQMyxJzOGEu106UL6A1h2iEgTUQWscA8cAAvCh0FhcIRirFegAKXx2RQASh02jlCrwKsVhF1iQABjgAKIAGUdJmYcCSADp8iRvUMRhYwF7Gcy0No4JGo9GYwAxbgAeQAsp7UulPXBXbGPQApBMASQAcpYINYHGA4Ani8HSeSoJS8lbvfkIzG21GAOoACUd3Ednp9jdVABIAIx2oiJADsk5N2gUPH4Vt4AjYxQUEFEcDw8wXtHoTCt+4YLDXG63O9N5vg1iwDlVHltCQdLrdHtrFN9KAgSRCuoAVEaJDDFMuqhlcRpwAAgjgcBrNgCrxsmJZlnAADiiYAKrUHAMQAJpwB+9b5BO2hzguODfDA96LqulDrmwm6KlRjDzGaEDyvAAajFa0gYHkGCyHyPxXF6aggAE15qk8aBDtaBBPnaRZOtwHpFswCapmkDi6txBCQQAalBzqYY6sG6sOCAeF6YB0AwunDKMRpCJBfbMJh3CFkWaFwF+jwai8WCkeRxgmOqzzLvwghoAxlBMf5zxsY+L6uu6JwgFQSEpik2l2nOyXKb2amFhpKHUXAYFMhBcBGSZZkVWORoTjIXZoAQBAQNIc5AA) <span data-playground="core"></span>: edit the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, so treat it as a demo.

For SQLite, import `sqlite` and the schema markers from `@typesql/core/sqlite` and use SQLite's type names (`integer`, `text`, `real`, `blob`). See [SQLite](https://typesql.karsli.net/guide/sqlite).

## Run queries

`@typesql/core` types your queries. To run them, add the package for your driver or ORM:

| Package | Runs queries on |
|---|---|
| [`@typesql/pg`](https://www.npmjs.com/package/@typesql/pg) | node-postgres |
| [`@typesql/postgres`](https://www.npmjs.com/package/@typesql/postgres) | postgres.js |
| [`@typesql/sqlite`](https://www.npmjs.com/package/@typesql/sqlite) | node:sqlite, better-sqlite3, bun:sqlite |
| [`@typesql/kysely`](https://www.npmjs.com/package/@typesql/kysely) | Kysely, with its `DB` interface as the schema |
| [`@typesql/drizzle`](https://www.npmjs.com/package/@typesql/drizzle) | Drizzle, with its schema |
| [`@typesql/prisma`](https://www.npmjs.com/package/@typesql/prisma) | Prisma Client, with its schema |

## Reusable queries

Compile a query once and bind different values with the same inferred types:

```ts
const findUser = sql.prepare("SELECT id, email FROM users WHERE id = $1");
const query = findUser(7);
```

Named parameters and fixed fragments work too. The `pg` and `postgres` adapters also request server-side preparation when these queries execute. See the [prepared query API](https://typesql.karsli.net/reference/api#sql-prepare-text-slots).

## Tracked migrations

The separate `@typesql/core/migration` entry point loads TypeScript migration files and runs them against PostgreSQL or SQLite on Node 26. Each file exports `up` and `down`:

```ts
import type { PostgresMigration } from "@typesql/core/migration";

export async function up(db: PostgresMigration) {
  const next = await db.add("CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL)");
  await next("INSERT INTO users (id, name) VALUES ($1, $2)", 1, "Ada").execute();
  return next;
}

export async function down(db: PostgresMigration) {
  await db.raw("DROP TABLE users");
}
```

Use `SqliteMigration` for SQLite. Later files can declare their starting schema as
`PostgresMigration<MigrationSchema<typeof previousUp>>` by importing the previous
`up` as a type. Await `.add()` or `.raw<NewSchema>()` into a new constant to retain
the updated schema; return that context from `up`, including for a no-op migration.
`down` may return nothing.

`migrateUp`, `migrateDown`, and `migrateLatest` accept `{ dialect, migrationsDir,
execute, migrationTable? }`. `execute` is a TypeSQL executor bound to one dedicated
database connection for the entire call. Files run in filename order, each in its
own transaction, with SHA-256 history checks and concurrency protection. A failed
file rolls back while earlier committed files remain applied. Migration code must
await every database operation and leave transaction management to the runner.
The default tracking table is `schema_migrations`. Hashes cover each migration
file's runtime code; imported runtime helpers are not tracked.

For configuration, file generation, and command-line execution, install
`@typesql/cli` and use `typesql migrate make <name>`, `up`, `down`, `latest`, or `generate`.
See the [migration guide](https://typesql.karsli.net/guide/migrations).

## Documentation

The full guide is at **[typesql.karsli.net](https://typesql.karsli.net)**. It covers the [schema](https://typesql.karsli.net/guide/schema), [parameters](https://typesql.karsli.net/guide/parameters), [writing data](https://typesql.karsli.net/guide/writing-data), [dynamic SQL](https://typesql.karsli.net/guide/dynamic-sql), [migrations](https://typesql.karsli.net/guide/migrations), [performance](https://typesql.karsli.net/guide/performance) and [known limits](https://typesql.karsli.net/guide/limits).

## License

[MIT](LICENSE)

Use `sql.withPlugin(new CasePlugin())` to accept camelCase write keys and return camelCase rows. Import `CasePlugin` from `@typesql/core`. The inferred input and output types follow the runtime conversion; JSON keys stay unchanged. SQL text and `sql.id()` use database identifiers. Use the original SQL instance for snake_case write objects.

```ts
import { CasePlugin } from "@typesql/core";

const appSql = sql.withPlugin(new CasePlugin());
const query = appSql("UPDATE users SET {changes} RETURNING display_name", {
  changes: appSql.set("users", { displayName: "Ada" }),
});
// query.execute() returns rows with displayName.
```

`withPlugin()` returns a new SQL instance and preserves transactions. Custom plugins implement `SqlPlugin<Types>` with `transformInput(value, context)` and/or `transformOutput(row)`. Their `PluginTypes` describe the accepted input, encoded database input, and returned row using `this["value"]`. Inputs encode in reverse registration order; outputs transform in registration order. Positional and named arguments, prepared queries, write helpers, and `mapRows()` use the same pipeline. See [plugins](https://typesql.karsli.net/guide/queries#plugins) and the [custom plugin example](./examples/plugins.ts).
