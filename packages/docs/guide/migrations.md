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

`migrations` comes from your dialect: `@typesql/core/postgres` for PostgreSQL DDL, `@typesql/core/sqlite` for [SQLite](./sqlite#schema).

## Running migrations

`@typesql/pg`, `@typesql/postgres` and `@typesql/sqlite` export `migrate(db, m)`. It runs `m.statements` in order inside one transaction, so either all of them apply or none:

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

```ts [SQLite]
import { createSql, migrate } from "@typesql/sqlite";

await migrate(db, m);
const sql = createSql<SchemaOf<typeof m>>(db);
```

:::

Statements are sent without parameters, so `$$`-quoted function bodies and multi-statement scripts work. For other clients, `@typesql/core` exports `runMigrations(client, m)`; see the [DDL reference](../reference/ddl).

The adapter `migrate` helper executes an untracked batch. For versioned migration files with history, use the tracked migration API below.

## Tracked migration files

Install `@typesql/cli` and use Node.js 26 or newer. PostgreSQL also requires `pg`. Running migration files needs `typescript` 7.1 or later wherever `typesql migrate` runs, because it hashes each file with TypeScript's parser. Keep `typescript` as a regular dependency if you run migrations from a production install (`npm install --omit=dev`).

```ts
// typesql.config.ts
import type { MigrationConfig } from "@typesql/cli";

export default {
  dialect: "postgres",
  migrationsDir: "./migrations",
} satisfies MigrationConfig;
```

PostgreSQL uses `url` from config or `DATABASE_URL`. For SQLite use `{ dialect: "sqlite", db: "./app.db" }`. The default migrations directory is `migrations` beside the config. `--config` selects another file, while `--dialect`, `--url`, `--db`, and `--dir` override config. Complete command-line flags work without a config file.

```sh
npx typesql migrate make "create users"
npx typesql migrate latest
npx typesql migrate down
```

`make` creates a timestamped `.ts` file and links its starting schema to the preceding file's `up` export. `up` applies one file, `down` reverts one, and `latest` applies all pending files. Manually named `.ts` files are also accepted, in filename order.

```ts
import type { PostgresMigration, MigrationSchema } from "@typesql/core/migration";

export async function up(db: PostgresMigration) {
  const users = await db.add(`CREATE TABLE users (
    id serial PRIMARY KEY,
    name text NOT NULL
  )`);
  await users("INSERT INTO users (name) VALUES ($1)", "Ada").execute();
  return users;
}

export async function down(db: PostgresMigration<MigrationSchema<typeof up>>) {
  await db.add("DROP TABLE users");
}
```

Use `SqliteMigration` for SQLite. The migration parameter declares its dialect at compile time; config selects the runtime connection. `up` must return its final context; a no-op `up` returns `db`. `down` is mandatory, may be empty, and need not restore the previous schema type. The first migration may accept an existing starting schema. For subsequent migrations the generated signature is:

```ts
import type { PostgresMigration, MigrationSchema } from "@typesql/core/migration";
import type { up as previousUp } from "./1793356800_create-users.ts";

export async function up(db: PostgresMigration<MigrationSchema<typeof previousUp>>) {
  return await db.add("ALTER TABLE users ADD COLUMN email text");
}
```

Await `.add(ddl)` to execute checked DDL and carry the updated schema to a new `const`. Query calls return the usual checked queries with `.execute()` and inferred result rows. `.raw<NewSchema>(sql)` executes dynamic or unsupported SQL with an explicit schema assertion. Reassigning the original variable does not update its TypeScript type.

Each file and its history record commit together. The history table has `name`, `hash`, and `applied_at` columns; `migrationTable` changes its default name, `schema_migrations`. Applied migration runtime code is hashed after removing types, comments, and formatting. Runtime token spelling is preserved. Hashes cover each migration file itself; imported runtime helpers are not recursively tracked. Missing or edited applied files and newly inserted files before applied migrations cause an error.

PostgreSQL holds a session advisory lock for the entire command. SQLite locks each file with `BEGIN IMMEDIATE` and rereads history before choosing the next file. Concurrent SQLite `latest` commands may interleave. A later failure leaves earlier successful files committed. SQL that cannot run inside a transaction fails; there is no transaction opt-out. An empty `down` succeeds and removes its history record.

### Programmatic execution

`@typesql/core/migration` also owns file discovery and execution through `migrateUp`, `migrateDown`, and `migrateLatest`. Supply an executor using one dedicated connection throughout the call:

```ts
import { Client } from "pg";
import { migrateLatest } from "@typesql/core/migration";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await migrateLatest({
    dialect: "postgres",
    migrationsDir: "./migrations",
    execute: (sql, values) => client.query(sql, [...values]),
  });
  console.log(result.migrations);
} finally {
  await client.end();
}
```

The runtime entry point is separate from the type-only schema and builder APIs. CLI success and no-op commands return exit code 0; runtime or config errors return 1; invalid command syntax returns 2.

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
