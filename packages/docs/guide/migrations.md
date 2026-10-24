# From migrations

If you already write DDL to create your database, TypeSQL can read the schema from it. This happens entirely in the type checker: no database, no generated file.

## The migrations builder

`migrations()` collects your DDL statements, checks each one as you add it, and carries the resulting schema as a type:

<<< @/snippets/migrations.ts#builder

- `SchemaOf<typeof m>` is the schema. Pass it to `createSql`.
- `m.statements` is the list of statements at runtime, in order.
- A wrong statement is a compile error on its string, worded like Postgres: `relation "users" already exists`, `column "age" of relation "users" does not exist`, and so on.

## Running migrations

`@typesql/pg` and `@typesql/postgres` both export `migrate(db, m)`. It runs `m.statements` in order inside one transaction, so either all of them apply or none:

::: code-group

```ts [node-postgres]
import { createSql, migrate } from "@typesql/pg";

await migrate(pool, m); // a Pool is fine: it runs on one client from the pool
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

<<< @/snippets/migrations.ts#applyddl

## What is supported

Tables, views, enums, schemas and `CREATE FUNCTION` change the schema. Indexes, triggers, grants and similar statements are accepted and leave it as it is. The [DDL reference](../reference/ddl) has the full list, how each column definition maps to `Col`, `Nullable` and `Generated`, and the known gaps.
