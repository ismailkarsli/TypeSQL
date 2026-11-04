# @typesql/core

Write SQL in TypeScript and get exact types for rows and parameters. TypeSQL parses your SQL inside the type checker: no codegen, no database connection, no build step.

## Install

```sh
pnpm add @typesql/core
```

Requires TypeScript 7.1 or later, with `strictNullChecks` on (`"strict": true` in `tsconfig.json` turns it on).

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

[Open the example in the TypeSQL Playground](https://typesql.karsli.net/playground#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixEpNnADCEYnEiMYAc3SM4I8ZJny2SgqvXKrt+1u1dADtsKFEMZCoAEQAhRG0ASABXRjQoRgAueISE4AATLLMCAB5pYBCAFmkSJAALDEYotHCkghgsmCgkqiEAPh0ctBAMYAJC81LsAA8YaX7EhLzgRjACDDIAfSCGNHGS6WnZmrgg1rWAIwJd0i6e+ZzUTGw8jaw9ydBFGAYwGAAvaqGeqNZoYVrtG7dRz3IQDXyZbK5AqmCZlEIADkBdQaTRabQ6t2hAwSYJgtWgG3y7zRMCq9wSMGAMCu1MOc2J5wgeTIrLQMyxJzOGEu106UL6A1h2iEgTUQWscA8cAAvCh0FhcIRirFegAKXx2RQASh02mUyjgAFEpvpnnA8N0oMBFIryXxSLU0MAoHAJO6MEE8pY6DtQkZKA4koG0nBBC7dQA6PIJmCMI0J7R820oCDy+B4FWKwi6xIAAxwloAMpaTMw4EkE-kSA2hiMLGAU0yrto4L2+-2BwAxbgAeQAsvXUul63Bq4O6wApEcASQAcpYINYHGA4CP1x3SeSoJSg6qG-kewOr32AOoACUt3Et9cbp7gABIAIyloiJADsv4mpmNrQPACg8Pwha8AIbDFAoECiPa8xZqB4ZULQ9BMIWGEMCwsHwYheDzMB2Zygq1hYA4qoeCWCTllWNZ1oeFJNjmUYwLqABURokMMUy6oyzJoEacAAII4HAazYAqw7jhuW5wAA4qOACq1BwDEACacDMce+Q-toQEoQY4E4N8qZQfwcZwWwCGKuZjDEWR8CtqMhbSBgeQYLIfI-FcCZqCAATGfAzlqk8aBvjRZZrhW3B1muzAjpOaQOLqrkECJABqomViploSbq74IB4CZgCGIDpcMoxGkIIlPswKncKua6KXArGPBqLxYAZRkgSZxgmOqdqqtB1kEeFXXEeaVpQBI6RZBgcAgMsKxoAQVxBmoBBJCAQQkAGQYBu18ppPAfBMuSSRgZ6cCriOdariplaVjp11HieGY0fR1a1icIBULJE4pKlpZAd9sWPglq5JfJFkCV2wlwDleUFXARWfkaP4yHe60EBA0hAUAA) <span data-playground="core"></span>: edit the SQL and see its errors and row types, checked by TypeScript 7.1 in your browser, with nothing to install.

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

Named parameters and fixed fragments work too. The `pg` and `postgres` adapters also request server-side preparation when these queries execute. See the [prepared query API](https://typesql.karsli.net/reference/api#sql-prepare-text).

## Migrations

`@typesql/core/migration` defines migrations whose DDL is checked as you write it, and runs them with a history table. `migration(from, { up, down })` starts from `"postgres"` or `"sqlite"`, or from the previous migration:

```ts
import { createMigrator, migration, type SchemaOf } from "@typesql/core/migration";

export const createUsers = migration("postgres", {
  name: "create-users",
  up: async (db) => {
    const users = await db.ddl("CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL)");
    await users("INSERT INTO users (name) VALUES ($1)", "Ada").execute();
    return users;
  },
  down: async (db) => {
    await db.ddl("DROP TABLE users");
  },
});

export const addBio = migration(createUsers, {
  name: "add-bio",
  up: async (db) => db.ddl("ALTER TABLE users ADD COLUMN bio text"),
  down: async (db) => {
    await db.ddl("ALTER TABLE users DROP COLUMN bio");
  },
});

export type DB = SchemaOf<typeof addBio>;

await createMigrator({
  dialect: "postgres",
  url: process.env.DATABASE_URL,
  migrations: [createUsers, addBio],
}).latest();
```

Await each `.ddl()` and keep the context it returns: it carries the changed schema. `up` returns its final context.

`createMigrator(config)` takes the migrations as an array or as a directory of files (`migrationsDir`, one default export per file, in filename order), and connects with `url` (PostgreSQL, through the optional peer dependency `pg`), `db` (a SQLite file, through node:sqlite) or your own `execute`. `latest()`, `up()` and `down()` run each migration and its history row in one transaction, under a lock for that migration, and each database command checks that the applied migrations, recorded by name (a migration's `name` in an array, its file name in a directory), are the first ones, in order. Array mode with `execute` loads no Node built-ins, so it runs in Cloudflare Workers, Bun and Deno; set `transaction: false` for Cloudflare D1. In directory mode, the migrator also writes the schema to `db.ts`, and [`@typesql/cli`](https://www.npmjs.com/package/@typesql/cli) runs it as `typesql migrate`.

See the [migration guide](https://typesql.karsli.net/guide/migrations).

## Plugins

Use `sql.withPlugin(new CasePlugin())` to accept camelCase write keys and return camelCase rows. Import `CasePlugin` from `@typesql/core`. The inferred input and output types follow the runtime conversion; JSON keys stay unchanged. SQL text and `sql.id()` use database identifiers. Use the original SQL instance for snake_case write objects.

```ts
import { CasePlugin } from "@typesql/core";

const appSql = sql.withPlugin(new CasePlugin());
const changes = appSql.set("users", { displayName: "Ada" });
const query = appSql(`UPDATE users SET ${changes} RETURNING display_name`);
// query.execute() returns rows with displayName.
```

`withPlugin()` returns a new SQL instance and preserves transactions. Custom plugins implement `SqlPlugin<Types>` with `transformInput(value, context)` and/or `transformOutput(row)`. Their `PluginTypes` describe the accepted input, encoded database input, and returned row using `this["value"]`. Inputs encode in reverse registration order; outputs transform in registration order. Positional and named arguments, prepared queries, write helpers, and `mapRows()` use the same pipeline. See [plugins](https://typesql.karsli.net/guide/queries#plugins) and the [custom plugin example](https://github.com/ismailkarsli/TypeSQL/blob/main/packages/core/examples/plugins.ts).

## Documentation

The full guide is at **[typesql.karsli.net](https://typesql.karsli.net)**. It covers the [schema](https://typesql.karsli.net/guide/schema), [parameters](https://typesql.karsli.net/guide/parameters), [writing data](https://typesql.karsli.net/guide/writing-data), [dynamic SQL](https://typesql.karsli.net/guide/dynamic-sql), [migrations](https://typesql.karsli.net/guide/migrations) and [known limits](https://typesql.karsli.net/guide/limits).

Upgrading from an earlier version? The [upgrade guide](https://typesql.karsli.net/guide/upgrading) lists every breaking change with the code to change, and the [changelog](https://typesql.karsli.net/changelog) every release since 1.0.0.

## License

[MIT](LICENSE)
