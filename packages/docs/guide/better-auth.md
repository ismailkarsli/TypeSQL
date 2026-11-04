---
description: "Store Better Auth's users and sessions through your TypeSQL sql with @typesql/better-auth, on PostgreSQL or SQLite."
---

# Better Auth

`@typesql/better-auth` is a [Better Auth](https://better-auth.com) database adapter that runs on your TypeSQL `sql`. Better Auth keeps its users, sessions and accounts in the same database, through the same client, as the rest of your queries.

```sh
pnpm add @typesql/core @typesql/better-auth better-auth
```

## Use the adapter

Create `sql` with `@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite` or `@typesql/kysely`, and pass it to `typesqlAdapter` with its dialect:

::: code-group

```ts [PostgreSQL]
import { typesqlAdapter } from "@typesql/better-auth";
import { createSql } from "@typesql/pg";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import type { DB } from "./schema.js";

const sql = createSql<DB>(new Pool());

export const auth = betterAuth({
	database: typesqlAdapter(sql, { dialect: "postgres" }),
	emailAndPassword: { enabled: true },
});
```

```ts [SQLite]
import { DatabaseSync } from "node:sqlite";
import { typesqlAdapter } from "@typesql/better-auth";
import { createSql } from "@typesql/sqlite";
import { betterAuth } from "better-auth";
import type { DB } from "./schema.js";

const sql = createSql<DB>(new DatabaseSync("app.db"));

export const auth = betterAuth({
	database: typesqlAdapter(sql, { dialect: "sqlite" }),
	emailAndPassword: { enabled: true },
});
```

:::

`dialect` must match the `sql`: a PostgreSQL `sql` with `dialect: "sqlite"`, or the other way round, is a compile error. So is an `sql` with a plugin, such as [`CasePlugin`](./queries#camelcase-row-keys), because Better Auth reads and writes its own column names. Keep a plugin-free `sql` for the adapter, and call `sql.withPlugin()` for your own queries.

| Option | Description |
|---|---|
| `dialect` | `"postgres"` or `"sqlite"`. |
| `transaction` | Run Better Auth's multi-step writes, such as creating a user and its account, in one `sql.transaction()`. Default `false`. |
| `usePlural` | Use plural table names, like `users`. Default `false`. |
| `debugLogs` | Log each adapter call Better Auth makes, with its input and result. `true` for every method, or an object such as `{ findOne: true }`. Default `false`. |

The adapter supports Better Auth's [joins](https://www.better-auth.com/docs/concepts/database#joins): with `advanced: { database: { joins: true } }`, reading a session and its user is one query. Single-use tokens, such as a password reset, are consumed in one statement, and database rate limits are counted in one statement, so two concurrent requests can't both use the same token or slip under the limit.

## Create the tables

The adapter doesn't create or migrate tables, and Better Auth's CLI can't generate a schema for it. Create Better Auth's tables with the migrations you already use. The [core schema](https://www.better-auth.com/docs/concepts/database#core-schema) lists the `user`, `session`, `account` and `verification` tables, and each plugin's page lists the tables and columns it adds. With `rateLimit: { storage: "database" }`, Better Auth also needs a `rateLimit` table.

The column names are the field names (`"emailVerified"`, `"userId"`), so quote them in PostgreSQL:

::: code-group

```sql [PostgreSQL]
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

```sql [SQLite]
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"emailVerified" integer NOT NULL,
	"image" text,
	"createdAt" date NOT NULL,
	"updatedAt" date NOT NULL
);
```

:::

SQLite has no boolean or date type: store booleans as `integer` and dates as `text` or `date`. The adapter converts them both ways, so Better Auth still sees `true` and `Date`.

## Query the tables yourself

Better Auth's tables are ordinary tables in your schema. Write their DDL as a [migration](./migrations), or [introspect](./introspect) the database after you create them, and your own queries on them are checked like any other:

```ts
const users = await sql(
	'SELECT name, email, "emailVerified", image FROM "user" WHERE email = $1',
	"ada@example.com",
).execute();
// ({ name: string; email: string; emailVerified: boolean; image: string | null })[]
```

On SQLite, raw SQL sees what is stored, so `emailVerified` is a `number` there.
