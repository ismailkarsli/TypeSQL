# Quick start

This page takes you from an empty project to a typed query in a few minutes.

::: tip Try it first
[Open the example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2ANHDAJ5hpwAKGUGIAzgCoVonmVwBKEA7qy4BfOADMoEEHABEAAU5pGhAPTJoaaQG4AUKEixE2gJAK4AYQjFjpgOJoAdmnrYAJkWts4AOQCuBAhgARgTsxpCMMADm6IzuIuKSMvJsSgSq6srhUTFa2rr22FCiGMhUACIAQoZGPoxOjABc1UbALk12js5oLgA80sAFACzSAHw6RkZoIBjABE0WBH3YAB4wo+NGLsCMYAFkAPr2DGhNvv5BIUtoq+vGRqiYrvtY7Q5OWN1LoIowDGAwAC9bkYhOMso1mq1Xp0Pr1+gUABzAowYHwwAAW0H2UPMlj6AxgwzGdxgwBgIXmeOkKzWxImgQgLjIpz8AWCaCuNzpoO0QjyansETgqTgAF4UOgPvhFpURgAKLLRRQASh02gFQrwYuFhDlxgABjgAKIAGSNZmYcB8ADpWiQbVMZsQ4GBraTyWhtHBvT7fX6AGLcADyAFkrXUoIwrXAzf7LQApIMASS8LogESjYDgQdTrtRGKxrW1NtaXr95Z9AHUABJG7hGq22lzagAkAEZ9e4jAB2dyq7SmXh8bVDwQchQQURwPDE0y0ehMbXzhgsNg9CdTmdqjXwCJYKPi1J6oyG03my35zFQbFuFAQHwFOUAKmVJGmyzl7pCyrgAEEcHAATYEKgahmmGZwDYwYAKrUHAFQAJpwJehYuJ22j9qYOC-DAB48PwY7rmwk7CjhjDEuqECCvAjqzNq0gYC4GCyNcfwhNaaggLkO4So83TakeBopsa3CWimzBBuG9RwHKtEED+ABqv4mtBRoAXKLYIKk1pgHQDCydMszKkIP71sw0HcF4KY2HAdq8bCzwwOhmGeGYkquCOBFrhu9muBRR6nmaFpwPYIBUKBYa1PU+r9gFwl1mJXgSeBuEyV+aCKcpqnqe2yqdjI1ZoP4EDSP2QA) <span data-playground="core"></span> to edit the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, which TypeSQL does not support, so treat it as a demo.
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
import type { Col, Generated, Nullable } from "@typesql/core/postgres";

export interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		display_name: Nullable<"text">;
		created_at: Generated<"timestamptz">;
	};
	posts: {
		id: Generated<"int8">;
		author_id: Col<"int4">;
		title: Col<"text">;
	};
}
```

- `Col` is a `NOT NULL` column.
- `Nullable` allows `NULL`.
- `Generated` has a default (`serial`, identity, `DEFAULT …`), so `INSERT` can leave it out.

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
