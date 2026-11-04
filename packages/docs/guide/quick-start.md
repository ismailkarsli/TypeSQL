---
description: "Go from an empty project to a typed SQL query in a few minutes with TypeSQL and PostgreSQL or SQLite."
---

# Quick start

This page takes you from an empty project to a typed query in a few minutes.

::: tip Try it first
[Open the example in the TypeSQL Playground](https://typesql.karsli.net/playground#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixEpNnADCEYnEiMYAc3SM4I8ZJny2SgqvXKrt+1u1dADtsKFEMZCoAEQAhRG0ASABXRjQoRgAueISE4AATLLMCAB5pYBCAFmkSJAALDEYotHCkghgsmCgkqiEAPh0ctBAMYAJC81LsAA8YaX7EhLzgRjACDDIAfSCGNHGS6WnZmrgg1rWAIwJd0i6e+ZzUTGw8jaw9ydBFGAYwGAAvaqGeqNZoYVrtG7dRz3IQDXyZbK5AqmCZlEIADkBdQaTRabQ6t2hAwSYJgtWgG3y7zRMCq9wSMGAMCu1MOc2J5wgeTIrLQMyxJzOGEu106UL6A1h2iEgTUQWscA8cAAvCh0FhcIRirFegAKXx2RQASh02mUyjgAFEpvpnnA8N0oMBFIryXxSLU0MAoHAJO6MEE8pY6DtQkZKA4koG0nBBC7dQA6PIJmCMI0J7R820oCDy+B4FWKwi6xIAAxwloAMpaTMw4EkE-kSA2hiMLGAU0yrto4L2+-2BwAxbgAeQAsvXUul63Bq4O6wApEcASQAcpYINYHGA4CP1x3SeSoJSg6qG-kewOr32AOoACUt3Et9cbp7gABIAIyloiJADsv4mpmNrQPACg8Pwha8AIbDFAoECiPa8xZqB4ZULQ9BMIWGEMCwsHwYheDzMB2Zygq1hYA4qoeCWCTllWNZ1oeFJNjmUYwLqABURokMMUy6oyzJoEacAAII4HAazYAqw7jhuW5wAA4qOACq1BwDEACacDMce+Q-toQEoQY4E4N8qZQfwcZwWwCGKuZjDEWR8CtqMhbSBgeQYLIfI-FcCZqCAATGfAzlqk8aBvjRZZrhW3B1muzAjpOaQOLqrkECJABqomViploSbq74IB4CZgCGIDpcMoxGkIIlPswKncKua6KXArGPBqLxYAZRkgSZxgmOqdqqtB1kEeFXXEeaVpQBI6RZBgcAgMsKxoAQVxBmoBBJCAQQkAGQYBu18ppPAfBMuSSRgZ6cCriOdariplaVjp11HieGY0fR1a1icIBULJE4pKlpZAd9sWPglq5JfJFkCV2wlwDleUFXARWfkaP4yHe60EBA0hAUAA) <span data-playground="core"></span> to edit the SQL and see its errors and row types, checked by TypeScript 7.1 in your browser, with nothing to install.
:::

## 1. Install

The examples come in two variants: PostgreSQL with node-postgres, and SQLite with node:sqlite. Pick one in any example and the page follows. [Installation](./installation) covers postgres.js, better-sqlite3, bun:sqlite, other package managers and the requirements.

::: code-group

```sh [PostgreSQL]
pnpm add @typesql/core @typesql/pg pg
pnpm add -D typescript@7.1.0-beta
```

```sh [SQLite]
pnpm add @typesql/core @typesql/sqlite
pnpm add -D typescript@7.1.0-beta
```

:::

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

:::

- `Col` is a `NOT NULL` column.
- `{ nullable: true }` allows `NULL`.
- `{ hasDefault: true }` means it has a default (`serial`, identity, SQLite's `INTEGER PRIMARY KEY`, `DEFAULT …`), so `INSERT` can leave it out.

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

:::

## 4. Write a query

::: code-group

```ts [PostgreSQL]
const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > $1`,
	new Date("2026-01-01"),
);
```

```ts [SQLite]
const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > $1`,
	"2026-01-01",
);
```

:::

The `LEFT JOIN` makes `title` nullable, because a user may have no posts. `$1` takes the type of `created_at`: a `Date` on PostgreSQL, and a string on SQLite, which has no date type.

## 5. Run it

```ts
const rows = await recent.execute();

const user = await sql(
	"SELECT email, display_name FROM users WHERE id = $1",
	7,
).executeTakeFirstOrThrow();
```

`executeTakeFirstOrThrow()` throws a `NoResultError` when there is no row. [node-postgres](../adapters/pg#run-queries) lists all the `execute*` methods, which work the same on [SQLite](../adapters/sqlite#run-queries).

The text goes to the database as you wrote it, and the values go as parameters:

```ts
recent.text;
recent.values;
```

## 6. Mistakes are compile errors

When the SQL is wrong, the error appears on the string, worded like the database's error:

```ts
sql("SELECT emial FROM users");

sql("SELECT id FROM users WHERE id = $1", "7");
```

The number after the message is the position of the wrong token. [Errors and troubleshooting](./errors) explains how to read these.

## Next steps

- [Selecting data](./queries): joins, nullability, aggregates and JSON.
- [Parameters](./parameters): `$1`, `:name` and inline `${sql.param(value)}`.
- [Inserting and updating](./writing-data): `INSERT`, `UPDATE`, `DELETE` and `RETURNING`.
- [Dynamic SQL](./dynamic-sql): build statements from pieces.
- Editor support for [VS Code](./vscode) and [Neovim](./neovim): completions and highlighting inside your SQL strings.
