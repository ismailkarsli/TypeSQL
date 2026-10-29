# Quick start

This page takes you from an empty project to a typed query in a few minutes.

::: tip Try it first
[Open the example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbwFAEgYE8wFM4GEIA2ANKgMZRYCGMWAygI7GobZwDiWAdllNVgCYk0mHADkArgQKUARgSxCWOAAqVeIAM4AVEYpFwAShADuO7CQC+cAGZQIIOACIAAko2MA9KWhZHAbiQkYE4aKGtKUhwAEQAhRFRxDR4NAC54lBRgfjSObl4afgAeR2CYABZHAD4AjKwQSmACNPwCYpoADxgqmpR+YA0waXQAfU5KECw0iSlZeTasTu7UFHIqAuHqHK4ePiLHGFAsDRhxsBgALyWUCxrIY9T0zOz2bfyBYtKADiuUSnEYAAW0GGWWahA+IQq1WWBxg8jBrX2Cy60IyMgg-HQU0k0jkWHmi1RNyQFkC3k4xzg7gIcAAvHBVnwGK1YpUABQASgCSHJlPodKpjDZqAABrQAKIAGXFuC0cHEADoskR5Qq6g1iHAwArYfIkHADYajcaAGIGADyAFl5UkoBp5XBpSa5QApc0ASVEWog9y1cHNXu1f0BwKyAsVWX1xujhoA6gAJcUGcWqsP0gAkAEYRUIAOwkLlIJSGEwCoymESFJQQaxwejQ4uqdT2+lN8baSvV2v17m8+DHagtwUEYUoMVSmVy4NAqAgwQMiDiEJsgBUHJV9XabN1WA5cAAgrQ4NIaJSzVbvb62BaAKrKOAxACacGnof4OaQheLtBOMCH5bMfEuypX8NGhHkIApeB1UaAVHEofhKGcBZTnkBVvBAfwIKghkKF2AVqVHEVPQlAw5U9LRzRtZI4DZGCCD3AA1fdJRvcUjzZdMEGpBUwDUcY6PqRoOQsPdky0G8DFET02DgZVcLWAQNhgD8v30XA8IKMsTEAqsRBrBTdnAwjx2lWU4E4CY4HPa1EmSEVCxMkik3I0RKMvP9aJ3JiWLYjisw5HMnHjLApAgRxCyAA) <span data-playground="core"></span> to edit the SQL and hover the types, with nothing to install. The Playground runs TypeScript 6, which TypeSQL does not support, so treat it as a demo.
:::

## 1. Install

This page uses node-postgres. [Installation](./installation) covers postgres.js, other package managers and the requirements.

```sh
npm install @typesql/core @typesql/pg pg
npm install -D typescript@7.1.0-beta
```

## 2. Describe your tables

A schema is a TypeScript interface. Each key is a table, and each column has a Postgres type name.

```ts
import type { Col, Generated, Nullable } from "@typesql/core";

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

The text goes to Postgres as you wrote it, and the values go as parameters:

```ts
recent.text;
recent.values;
```

## 6. Mistakes are compile errors

When the SQL is wrong, the error appears on the string, worded like the Postgres error:

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
