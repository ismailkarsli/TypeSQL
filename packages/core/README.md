# @typesql/core

Write SQL in TypeScript and get exact types for rows and parameters. TypeSQL parses your SQL inside the type checker: no codegen, no database connection, no build step.

It supports PostgreSQL, SQLite, MySQL and MariaDB. The runtime is tiny (under 3 kB minified and gzipped) and has no dependencies.

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
   WHERE u.id = ${sql.param(7)}`,
);

sql("SELECT emial FROM users");
```

For SQLite, import `sqlite` and the schema markers from `@typesql/core/sqlite` and use SQLite's type names (`integer`, `text`, `real`, `blob`). See [SQLite](https://typesql.karsli.net/adapters/sqlite).

For MySQL and MariaDB, import `mysql` or `mariadb` and the schema markers from `@typesql/core/mysql` and use MySQL's type names (`int`, `bigint unsigned`, `varchar`, `datetime`). See [MySQL and MariaDB](https://typesql.karsli.net/adapters/mysql).

## Run queries

`@typesql/core` types your queries. To run them, add the package for your driver or ORM:

| Package | Runs queries on |
|---|---|
| [`@typesql/pg`](https://www.npmjs.com/package/@typesql/pg) | node-postgres |
| [`@typesql/postgres`](https://www.npmjs.com/package/@typesql/postgres) | postgres.js |
| [`@typesql/sqlite`](https://www.npmjs.com/package/@typesql/sqlite) | node:sqlite, better-sqlite3, bun:sqlite |
| [`@typesql/mysql`](https://www.npmjs.com/package/@typesql/mysql) | mysql2, the mariadb connector, PlanetScale and TiDB Cloud serverless |
| [`@typesql/kysely`](https://www.npmjs.com/package/@typesql/kysely) | Kysely, with its `DB` interface as the schema |
| [`@typesql/drizzle`](https://www.npmjs.com/package/@typesql/drizzle) | Drizzle, with its schema |
| [`@typesql/prisma`](https://www.npmjs.com/package/@typesql/prisma) | Prisma Client, with its schema |

## Reusable queries

Compile a query once and bind different values with the same inferred types:

```ts
const findUser = sql.prepare("SELECT id, email FROM users WHERE id = $1");
const query = findUser(7);
```

Named parameters and fixed fragments work too. The `pg`, `postgres` and `mysql` adapters also request server-side preparation when these queries execute. See the [prepared query API](https://typesql.karsli.net/reference/api#sql-prepare-text).

## Migrations

`@typesql/core/migration` defines migrations whose DDL is checked as you write it, and runs them with a history table. `migration(from, { up, down })` starts from `"postgres"`, `"sqlite"`, `"mysql"` or `"mariadb"`, or from the previous migration:

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

`createMigrator(config)` takes the migrations as an array or as a directory of files (`migrationsDir`, one default export per file, in filename order), and connects with `url` (PostgreSQL through the optional peer dependency `pg`; MySQL and MariaDB through `mysql2`), `db` (a SQLite file, through node:sqlite) or your own `execute`. `latest()`, `up()` and `down()` run each migration and its history row in one transaction, under a lock for that migration (MySQL and MariaDB commit DDL implicitly, so a failed migration keeps the DDL that already ran), and each database command checks that the applied migrations, recorded by name (a migration's `name` in an array, its file name in a directory), are the first ones, in order. Array mode with `execute` loads no Node built-ins, so it runs in Cloudflare Workers, Bun and Deno; set `transaction: false` for Cloudflare D1. In directory mode, the migrator also writes the schema to `db.ts`, and [`@typesql/cli`](https://www.npmjs.com/package/@typesql/cli) runs it as `typesql migrate`.

See the [migration guide](https://typesql.karsli.net/guide/migrations).

## Plugins

Use `sql.withPlugin(new CasePlugin())` to accept camelCase write keys and return camelCase rows. Import `CasePlugin` from `@typesql/core/plugins`. The inferred input and output types follow the runtime conversion; JSON keys stay unchanged. SQL text and `sql.id()` use database identifiers. Use the original SQL instance for snake_case write objects.

```ts
import { CasePlugin } from "@typesql/core/plugins";

const appSql = sql.withPlugin(new CasePlugin());
const changes = appSql.set("users", { displayName: "Ada" });
const query = appSql(`UPDATE users SET ${changes} RETURNING display_name`);
// query.execute() returns rows with displayName.
```

`withPlugin()` returns a new SQL instance and preserves transactions. Custom plugins implement `SqlPlugin<Types>` with `transformInput(value, context)` and/or `transformOutput(row)`. Their `PluginTypes` describe the accepted input, encoded database input, and returned row using `this["value"]`. Inputs encode in reverse registration order; outputs transform in registration order. Positional and named arguments, prepared queries, write helpers, and `mapRows()` use the same pipeline. See [plugins](https://typesql.karsli.net/guide/plugins) and the [custom plugin example](https://github.com/ismailkarsli/TypeSQL/blob/main/packages/core/examples/plugins.ts).

## Documentation

The full guide is at **[typesql.karsli.net](https://typesql.karsli.net)**. It covers the [schema](https://typesql.karsli.net/guide/schema), [writing queries](https://typesql.karsli.net/guide/using-sql), [migrations](https://typesql.karsli.net/guide/migrations) and [known limits](https://typesql.karsli.net/guide/limits).

Upgrading from an earlier version? The [upgrade guide](https://typesql.karsli.net/guide/upgrading) lists every breaking change with the code to change, and the [changelog](https://typesql.karsli.net/changelog) every release since 1.0.0.

## License

[MIT](LICENSE)
