---
description: "Store Better Auth's users and sessions through your TypeSQL sql with @typesql/better-auth, on PostgreSQL or SQLite."
---

# Better Auth

`@typesql/better-auth` is a [Better Auth](https://better-auth.com) database adapter that runs on your TypeSQL `sql`. Better Auth keeps its users, sessions and accounts in the same database, through the same client, as the rest of your queries.

```sh
pnpm add @typesql/core @typesql/better-auth better-auth
```

## Use the adapter

Create `sql` with `@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite` or `@typesql/kysely` (on PostgreSQL or SQLite; the adapter doesn't support MySQL and MariaDB yet), and pass it to `typesqlAdapter`:

::: code-group

```ts [PostgreSQL]
import { typesqlAdapter } from "@typesql/better-auth";
import { createSql } from "@typesql/pg";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import type { DB } from "./schema.js";

const sql = createSql<DB>(new Pool());

export const auth = betterAuth({
	database: typesqlAdapter(sql),
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
	database: typesqlAdapter(sql),
	emailAndPassword: { enabled: true },
});
```

:::

The adapter reads the database from [`sql.dialect`](../reference/api#sql-dialect), so there is nothing to keep in sync. An `sql` with a plugin, such as [`CasePlugin`](./case-plugin), is a compile error, because Better Auth reads and writes its own column names. Keep a plugin-free `sql` for the adapter, and call `sql.withPlugin()` for your own queries.

| Option | Description |
|---|---|
| `transaction` | Run Better Auth's multi-step writes, such as creating a user and its account, in one `sql.transaction()`. Default `false`. On one connection, such as a SQLite database, requests that overlap are [rejected](./using-sql#transactions). |
| `usePlural` | Use plural table names, like `users`. Default `false`. |
| `debugLogs` | Log each adapter call Better Auth makes, with its input and result. `true` for every method, or an object such as `{ findOne: true }`. Default `false`. |
| `casing` | The case of table and column names. `"snake_case"` converts model names, core fields, `additionalFields` and plugin schemas the way [`CasePlugin`](./case-plugin) does: `twoFactor` is `two_factor` and `requirePKCE` is `require_pkce`. Your application still uses Better Auth's names. Default: Better Auth's own names. |

The adapter supports Better Auth's [joins](https://www.better-auth.com/docs/concepts/database#joins): with `advanced: { database: { joins: true } }`, reading a session and its user is one query. Single-use tokens, such as a password reset, are consumed in one statement, and database rate limits are counted in one statement, so two concurrent requests can't both use the same token or slip under the limit.

## Create the tables

The adapter doesn't create or migrate tables, and Better Auth's CLI can't generate a schema for it. Create Better Auth's tables with the migrations you already use. The [core schema](https://www.better-auth.com/docs/concepts/database#core-schema) lists the `user`, `session`, `account` and `verification` tables, and each plugin's page lists the tables and columns it adds. With `rateLimit: { storage: "database" }`, Better Auth also needs a `rateLimit` table.

The column names are the field names (`"emailVerified"`, `"userId"`), so quote them in PostgreSQL, or use snake_case names (`email_verified`, `user_id`) with the `casing: "snake_case"` option:

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
	`SELECT name, email, "emailVerified", image FROM "user" WHERE email = ${sql.param("ada@example.com")}`,
).execute();
// ({ name: string; email: string; emailVerified: boolean; image: string | null })[]
```

On SQLite, raw SQL sees what is stored, so `emailVerified` is a `number` there.
