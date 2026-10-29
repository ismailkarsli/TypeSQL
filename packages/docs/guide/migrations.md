# From migrations

If you already write DDL to create your database, TypeSQL can read the schema from it. This happens entirely in the type checker: no database, no generated file.

## The migrations builder

`migrations()` collects your DDL statements, checks each one as you add it, and carries the resulting schema as a type:

```ts
const m = migrations()
	.add(`CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad')`)
	.add(`CREATE TABLE users (
          id serial PRIMARY KEY,
          email text NOT NULL UNIQUE,
          display_name text,
          mood mood NOT NULL DEFAULT 'neutral'
        )`)
	.add(
		`CREATE VIEW named_users AS SELECT id, display_name FROM users WHERE display_name IS NOT NULL`,
	);

type DB = SchemaOf<typeof m>;
const sql = createSql<DB>();
const q = sql(
	"SELECT id, display_name, mood FROM users WHERE email = $1",
	"a@b.c",
);
```

- `SchemaOf<typeof m>` is the schema. Pass it to `createSql`.
- `m.statements` is the list of statements at runtime, in order.
- A wrong statement is a compile error on its string, worded like the database's error: `relation "users" already exists`, `column "age" of relation "users" does not exist`, and so on.

## Running migrations

`@typesql/pg` and `@typesql/postgres` both export `migrate(db, m)`. It runs `m.statements` in order inside one transaction, so either all of them apply or none:

::: code-group

```ts [node-postgres]
import { createSql, migrate } from "@typesql/pg";

await migrate(pool, m);
const sql = createSql<SchemaOf<typeof m>>(pool);
```

```ts [postgres.js]
import { createSql, migrate } from "@typesql/postgres";

await migrate(db, m);
const sql = createSql<SchemaOf<typeof m>>(db);
```

:::

Statements are sent without parameters, so `$$`-quoted function bodies and multi-statement scripts work. For other clients, `@typesql/core` exports `runMigrations(client, m)`; see the [DDL reference](../reference/ddl).

::: warning
`migrate` does not record which migrations already ran. Keep a `schema_migrations` table yourself, or run migrations with a dedicated tool and use `migrations()` only for the types.
:::

## `ApplyDdl`

`ApplyDdl<DB, "…">` is the type behind the builder. It returns the schema after one DDL statement, or after a `;`-separated script:

```ts
interface Before {
	users: { id: Generated<"int4">; email: Col<"text"> };
}
type After = ApplyDdl<
	Before,
	"ALTER TABLE users ADD COLUMN age int NOT NULL DEFAULT 0; ALTER TABLE users RENAME COLUMN email TO login"
>;
```

## What is supported

Tables, views, enums, schemas and `CREATE FUNCTION` change the schema. Indexes, triggers, grants and similar statements are accepted and leave it as it is. The [DDL reference](../reference/ddl) has the full list, how each column definition maps to `Col`, `Nullable` and `Generated`, and the known gaps.
