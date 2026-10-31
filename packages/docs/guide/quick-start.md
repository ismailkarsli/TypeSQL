# Quick start

This page takes you from an empty project to a typed query in a few minutes.

::: tip Try it first
[Open the example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixEpNnADCEYnEiMYAc3SM4I8ZJny2SgqvXKrt+1u1dADtsKFEMZCoAEQAhRG0ASABXRjQoRgAueISE4AATLLMCAB5pYBCAFmkSJAALDEYotHCkghgsmCgkqiEAPh0ctBAMYAJC81LsAA8YaX7EhLzgRjACDDIAfSCGNHGS6WnZmrgg1rWAIwJd0i6e+ZzUTGw8jaw9ydBFGAYwGAAvaqGeqNZoYVrtG7dRz3IQDXyZbK5AqmCZlEIADkBdQaTRabQ6t2hAwSYJgtWgG3y7zRMCq9wSMGAMCu1MOc2J5wgeTIrLQMyxJzOGEu106UL6A1h2iEgTUQWscA8cAAvCh0FhcIRirFegAKXx2RQASh02jlCrwKsVhF1iQABjgAKIAGUdJmYcCSADp8iRvUMRhYwF7Gcy0No4JGo9GYwAxbgAeQAsp7UulPXBXbGPQApBMASQAcpYINYHGA4Ani8HSeSoJS8lbvfkIzG21GAOoACUd3Ednp9jdVABIAIx2oiJADsk5N2gUPH4Vt4AjYxQUEFEcDw8wXtHoTCt+4YLDXG63O9N5vg1iwDlVHltCQdLrdHtrFN9KAgSRCuoAVEaJDDFMuqhlcRpwAAgjgcBrNgCrxsmJZlnAADiiYAKrUHAMQAJpwB+9b5BO2hzguODfDA96LqulDrmwm6KlRjDzGaEDyvAAajFa0gYHkGCyHyPxXF6aggAE15qk8aBDtaBBPnaRZOtwHpFswCapmkDi6txBCQQAalBzqYY6sG6sOCAeF6YB0AwunDKMRpCJBfbMJh3CFkWaFwF+jwai8WCkeRxgmOqzzLvwghoAxlBMf5zxsY+L6uu6JwgFQSEpik2l2nOyXKb2amFhpKHUXAYFMhBcBGSZZkVWORoTjIXZoAQBAQNIc5AA) <span data-playground="core"></span> to edit the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, which TypeSQL does not support, so treat it as a demo.
:::

## 1. Install

This page uses node-postgres. [Installation](./installation) covers postgres.js, other package managers and the requirements.

```sh
npm install @typesql/core @typesql/pg pg
npm install -D typescript@7.1.0-beta
```

## 2. Describe your tables

A schema is a TypeScript interface. Each key is a table, and each column has a type name from your database.

```ts
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

- `Col` is a `NOT NULL` column.
- `{ nullable: true }` allows `NULL`.
- `{ hasDefault: true }` means it has a default (`serial`, identity, `DEFAULT …`), so `INSERT` can leave it out.

You can also generate it [from a live database](./introspect), derive it [from your migrations](./migrations), or take it [from Kysely, Drizzle or Prisma](./orms). [Declaring tables](./schema) lists every column helper.

## 3. Create `sql`

Pass the schema and your driver's client to `createSql`:

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const sql = createSql<DB>(pool);
```

## 4. Write a query

```ts
const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > $1`,
	new Date("2026-01-01"),
);
```

The `LEFT JOIN` makes `title` nullable, because a user may have no posts. `$1` takes the type of `created_at`, so it accepts a `Date`.

## 5. Run it

```ts
const rows = await recent.execute();

const user = await sql(
	"SELECT email, display_name FROM users WHERE id = $1",
	7,
).executeTakeFirstOrThrow();
```

`executeTakeFirstOrThrow()` throws a `NoResultError` when there is no row. [node-postgres](../adapters/pg) lists all the `execute*` methods.

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
