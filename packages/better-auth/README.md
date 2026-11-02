# @typesql/better-auth

Use [Better Auth](https://better-auth.com) with [TypeSQL](https://www.npmjs.com/package/@typesql/core). Better Auth stores its users and sessions through your TypeSQL `sql`, on PostgreSQL or SQLite.

## Install

```sh
pnpm add @typesql/core @typesql/better-auth better-auth
```

## Usage

Create `sql` with `@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite` or `@typesql/kysely`, and pass it to `typesqlAdapter`:

```ts
import { betterAuth } from "better-auth";
import { typesqlAdapter } from "@typesql/better-auth";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";
import type { DB } from "./db";

const sql = createSql<DB>(new Pool());

export const auth = betterAuth({
  database: typesqlAdapter(sql, { dialect: "postgres" }),
  emailAndPassword: { enabled: true },
});
```

## Options

| Option | Description |
|---|---|
| `dialect` | `"postgres"` or `"sqlite"`. It must match your `sql`. |
| `transaction` | Run related writes in one transaction. Default `false`. |
| `usePlural` | Use plural table names, like `users`. Default `false`. |
| `debugLogs` | Log the adapter's queries. Default `false`. |

Pass `sql` without plugins such as `CasePlugin`.

## Create the tables

Better Auth's CLI can't create tables through this adapter. Use its migrator with the same database instead:

```ts
import { getMigrations } from "better-auth/db/migration";

const { runMigrations, compileMigrations } = await getMigrations({
  ...authOptions,
  database: pool,
});

await runMigrations(); // create the tables
console.log(await compileMigrations()); // or print the SQL
```

To check your own queries on these tables, add the printed SQL to a TypeSQL migration.

## License

[MIT](LICENSE)
