---
description: "Install TypeSQL and go from an empty project to a typed SQL query in a few minutes with PostgreSQL, SQLite, MySQL or MariaDB: requirements, packages and a first query."
---

# Quick start

This page takes you from an empty project to a typed query in a few minutes.

## Requirements

- **TypeScript 7.1 or later** (`7.1.0-beta` works), or [tsrs](https://github.com/oxc-project/tsrs).
- **`"strict": true`** (or at least `"strictNullChecks": true`) in `tsconfig.json`.
- **A supported database.** TypeSQL supports PostgreSQL, SQLite, MySQL and MariaDB.

## 1. Install

The examples come in three variants: PostgreSQL with node-postgres, SQLite with node:sqlite, and MySQL with mysql2 (MariaDB uses the same adapter with `{ dialect: "mariadb" }`). Pick one in any example and the page follows.

::: code-group

```sh [PostgreSQL]
pnpm add @typesql/core @typesql/pg pg
pnpm add -D typescript@7.1.0-beta
```

```sh [SQLite]
pnpm add @typesql/core @typesql/sqlite
pnpm add -D typescript@7.1.0-beta
```

```sh [MySQL]
pnpm add @typesql/core @typesql/mysql mysql2
pnpm add -D typescript@7.1.0-beta
```

:::

Install `@typesql/core` and the adapter for your driver:

| Package | Runs queries on |
|---|---|
| [`@typesql/pg`](../adapters/postgresql) | node-postgres (`pg`) |
| [`@typesql/postgres`](../adapters/postgresql) | postgres.js (`postgres`) |
| [`@typesql/sqlite`](../adapters/sqlite) | node:sqlite, bun:sqlite or better-sqlite3 |
| [`@typesql/mysql`](../adapters/mysql) | mysql2, the mariadb connector, PlanetScale or TiDB Cloud serverless |

`@typesql/core` has no runtime dependencies. Its [migrator](./migrations#the-migrator) connects from a `url` with `pg` or `mysql2`, optional peer dependencies, and writes `db.ts` with `typescript`. The packages are ESM-only. `import` and Node's `require()` of ES modules both work, but TypeScript rejects imports from `.cts` files under `node16`/`nodenext` resolution (TS1479).

If your schema is already described for Kysely, Drizzle or Prisma, install its TypeSQL package instead of writing it again:

| Package | Peer dependency |
|---|---|
| `@typesql/kysely` | `kysely` 0.28 or later |
| `@typesql/drizzle` | `drizzle-orm` 0.45 or later, before 1.0 |
| `@typesql/prisma` | `@prisma/client` 7 or later |

See [From Kysely, Drizzle or Prisma](./orms).

Optional extras:

- **The `typesql` command** (`@typesql/cli`, Node.js 26+): [`typesql introspect`](./introspect) and [`typesql migrate`](./migrations#the-typesql-migrate-command). Keep `@typesql/core` in your own dependencies too.
- **Editor support.** The [VS Code extension](./vscode), and `@typesql/language-server` in [Neovim](./neovim), complete table and column names inside your SQL strings and highlight the SQL. Types and errors work without them.

Upgrading from an earlier version? See [Upgrading](./upgrading).

## 2. Describe your tables

A schema is a TypeScript interface. Each key is a table, and each column has a type name from your database.

::: code-group

```ts [PostgreSQL]
import type { Col } from "@typesql/core/postgres";

export interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
		created_at: Col<"timestamptz", { hasDefault: true }>;
	};
	posts: {
		id: Col<"int8", { hasDefault: true }>;
		author_id: Col<"int4">;
		title: Col<"text">;
	};
}
```

```ts [SQLite]
import type { Col } from "@typesql/core/sqlite";

export interface DB {
	users: {
		id: Col<"integer", { hasDefault: true }>;
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
		created_at: Col<"datetime", { hasDefault: true }>;
	};
	posts: {
		id: Col<"integer", { hasDefault: true }>;
		author_id: Col<"integer">;
		title: Col<"text">;
	};
}
```

```ts [MySQL]
import type { Col } from "@typesql/core/mysql";

export interface DB {
	users: {
		id: Col<"int unsigned", { autoIncrement: true }>;
		email: Col<"varchar">;
		display_name: Col<"varchar", { nullable: true }>;
		created_at: Col<"datetime", { hasDefault: true }>;
	};
	posts: {
		id: Col<"bigint unsigned", { autoIncrement: true }>;
		author_id: Col<"int unsigned">;
		title: Col<"varchar">;
	};
}
```

:::

- `Col` is a `NOT NULL` column.
- `{ nullable: true }` allows `NULL`.
- `{ hasDefault: true }` means it has a default (`serial`, identity, SQLite's `INTEGER PRIMARY KEY`, `DEFAULT …`), so `INSERT` can leave it out. On MySQL and MariaDB, `{ autoIncrement: true }` marks an `AUTO_INCREMENT` column and implies it.

You can also generate it [from a live database](./introspect), derive it [from your migrations](./migrations), or take it [from Kysely, Drizzle or Prisma](./orms). [Declaring tables](./schema) lists every column helper.

## 3. Create `sql`

Pass the schema and your driver's client to `createSql`:

::: code-group

```ts [PostgreSQL]
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const sql = createSql<DB>(pool);
```

```ts [SQLite]
import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";

const sql = createSql<DB>(new DatabaseSync("app.db"));
```

```ts [MySQL]
import { createPool } from "mysql2/promise";
import { createSql } from "@typesql/mysql";

const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));
```

:::

## 4. Write a query

::: code-group

```ts [PostgreSQL]
const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param(new Date("2026-01-01"))}`,
);
```

```ts [SQLite]
const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param("2026-01-01")}`,
);
```

```ts [MySQL]
const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > ${sql.param(new Date("2026-01-01"))}`,
);
```

:::

The `LEFT JOIN` makes `title` nullable, because a user may have no posts. `sql.param()` sends the date as a parameter, typed like `created_at`: a `Date` on PostgreSQL, a `Date` or a string on MySQL and MariaDB, and a string on SQLite, which has no date type.

## 5. Run it

```ts
const rows = await recent.execute();

const user = await sql(
	`SELECT email, display_name FROM users WHERE id = ${sql.param(7)}`,
).executeTakeFirstOrThrow();
```

`executeTakeFirstOrThrow()` throws a `NoResultError` when there is no row. [PostgreSQL](../adapters/postgresql#run-queries) lists all the `execute*` methods, which work the same on [SQLite](../adapters/sqlite#run-queries) and on [MySQL and MariaDB](../adapters/mysql#run-queries).

Each `sql.param()` becomes a `$n` in the text, and its value goes to the database as a parameter, never into the SQL:

```ts
recent.text;
recent.values;
```

## 6. Mistakes are compile errors

When the SQL is wrong, the error appears on the string, worded like the database's error:

```ts
sql("SELECT emial FROM users");

sql(`SELECT id FROM users WHERE id = ${sql.param("7")}`);
```

The number after the message is the position of the wrong token. [Errors and troubleshooting](./errors) explains how to read these.

## Next steps

- [Using `sql`](./using-sql): joins, parameters, inserts, dynamic SQL and transactions.
- Editor support for [VS Code](./vscode) and [Neovim](./neovim): completions and highlighting inside your SQL strings.
