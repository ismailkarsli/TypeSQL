# @typesql/better-auth

Use [Better Auth](https://better-auth.com) with [TypeSQL](https://www.npmjs.com/package/@typesql/core). Better Auth stores its users and sessions through your TypeSQL `sql`, on PostgreSQL or SQLite. See the [guide](https://typesql.karsli.net/guide/better-auth).

## Install

```sh
pnpm add @typesql/core @typesql/better-auth better-auth
```

## Usage

Create `sql` with `@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite` or `@typesql/kysely`, and pass it to `typesqlAdapter`. The adapter reads the database from `sql.dialect`:

```ts
import { betterAuth } from "better-auth";
import { typesqlAdapter } from "@typesql/better-auth";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";
import type { DB } from "./db";

const sql = createSql<DB>(new Pool());

export const auth = betterAuth({
  database: typesqlAdapter(sql),
  emailAndPassword: { enabled: true },
});
```

## Options

| Option | Description |
|---|---|
| `transaction` | Run related writes in one transaction. Default `false`. |
| `usePlural` | Use plural table names, like `users`. Default `false`. |
| `debugLogs` | Log each adapter call Better Auth makes, with its input and result. `true` for every method, or an object such as `{ findOne: true }`. Default `false`. |
| `casing` | The case of table and column names. `"snake_case"` converts model names, core fields, `additionalFields` and plugin schemas the way [`CasePlugin`](https://typesql.karsli.net/guide/case-plugin) does: `twoFactor` is `two_factor` and `requirePKCE` is `require_pkce`. Your application still uses Better Auth's names. Default: Better Auth's own names. |

Pass `sql` without plugins such as `CasePlugin`.

## Create the tables

The adapter doesn't create or migrate tables, and Better Auth's CLI can't generate a schema for it. Create Better Auth's tables with the migrations you already use. The [core schema](https://www.better-auth.com/docs/concepts/database#core-schema) lists the `user`, `session`, `account` and `verification` tables, and each plugin's page lists the tables and columns it adds. With `rateLimit: { storage: "database" }`, Better Auth also needs a `rateLimit` table.

The column names are the field names (`"emailVerified"`, `"userId"`), so quote them in PostgreSQL. On SQLite, store booleans as `integer` and dates as `text` or `date`: the adapter converts them.

To check your own queries on these tables, write the DDL as a [TypeSQL migration](https://typesql.karsli.net/guide/migrations), or [introspect](https://typesql.karsli.net/guide/introspect) the database after you create them.

## License

[MIT](LICENSE)
