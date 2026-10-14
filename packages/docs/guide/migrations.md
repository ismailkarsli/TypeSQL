# Migrations

The schema interface does not have to be written by hand: typesql can derive it from the DDL
that creates your database, entirely at the type level.

## ApplyDdl

`ApplyDdl<DB, "…">` returns the schema after a DDL statement or a `;`-separated script:

<<< @/snippets/migrations.ts#applyddl

`CREATE TABLE` (including `PRIMARY KEY`, `serial`, identity and generated columns, `LIKE`,
`INHERITS`), `ALTER TABLE`, `DROP TABLE`, views, enums (`CREATE TYPE … AS ENUM`,
`ALTER TYPE … ADD VALUE`) and schemas are supported. Indexes, functions, triggers, grants and
similar statements are accepted and leave the schema unchanged. Errors match Postgres:
`relation "users" already exists`, `column "age" of relation "users" does not exist`, and so on.
The complete list is in the [DDL reference](../reference/ddl).

## The migrations builder

`migrations()` collects DDL statements, checks each one when it is added, and carries the
resulting schema as a type:

<<< @/snippets/migrations.ts#builder

`SchemaOf<typeof m>` is the schema; `m.statements` is the list of statements at runtime.

## Running migrations

Both adapters export `migrate(db, m)`, which runs `m.statements` in order inside one
transaction:

```ts
import { migrate } from "@typesql/pg";

await migrate(pool, m);
```

Statements are sent without parameters, so `$$`-quoted function bodies work. `migrate` does not
record which migrations already ran; keep a migrations table, or use a dedicated migration tool
to run them and `migrations()` for the types.
