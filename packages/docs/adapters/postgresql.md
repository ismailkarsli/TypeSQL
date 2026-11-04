---
description: "Run TypeSQL queries on PostgreSQL with node-postgres (@typesql/pg) or postgres.js (@typesql/postgres): create sql, run queries and transactions, type parsing and migrations."
---

# PostgreSQL

Two adapters run your queries on PostgreSQL:

| Package | Driver |
|---|---|
| `@typesql/pg` | node-postgres (`pg` 8.x) |
| `@typesql/postgres` | postgres.js (`postgres` 3.x or 4.x) |

Both give you the same `sql` function, `execute*` methods and `sql.transaction`. They differ in the clients they accept, how transactions run, how rows are typed, and how migrations get a connection. Pick a driver in any example and the page follows.

::: code-group

```sh [node-postgres]
pnpm add @typesql/core @typesql/pg pg
```

```sh [postgres.js]
pnpm add @typesql/core @typesql/postgres postgres
```

:::

## Create `sql`

Pass your client to `createSql`. Every query you build with it runs on that client:

::: code-group

```ts [node-postgres]
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const pool = new Pool();
const sql = createSql<DB>(pool);

const users = await sql("SELECT id, email FROM users").execute();
```

```ts [postgres.js]
import postgres from "postgres";
import { createSql } from "@typesql/postgres";

const db = postgres(process.env["DATABASE_URL"]!);
const sql = createSql<DB>(db);

const users = await sql("SELECT id, email FROM users").execute();
```

:::

- **node-postgres** takes a `Pool`, a `Client` or a `PoolClient`: anything with `query(text, values?)` that resolves to `{ rows, rowCount }`, so a fake client works in tests.
- **postgres.js** takes the `Sql` instance, the `TransactionSql` that `begin` passes, or a `ReservedSql`. Queries run with `unsafe(text, values)`, so the text reaches the server as written.

### postgres.js with `bigint`

If your postgres.js connection parses `int8` to `bigint`, pass `{ bigint: true }` so rows are typed to match:

```ts
const dbBig = postgres(process.env["DATABASE_URL"]!, {
	types: { bigint: postgres.BigInt },
});
const big = createSql<DB>(dbBig, { bigint: true });
const counts = await big(
	"SELECT author_id, count(*) AS n FROM posts GROUP BY author_id",
).execute();
```

## Run queries

| Method | Returns |
|---|---|
| `q.execute()` | `Promise<Row[]>` |
| `q.executeTakeFirst()` | `Promise<Row \| undefined>` |
| `q.executeTakeFirstOrThrow()` | `Promise<Row>`, or rejects with `NoResultError` when there is no row |
| `q.executeCount()` | `Promise<number>`: the rows changed or returned, 0 for DDL |

```ts
const maybe = await sql(
	`SELECT id FROM users WHERE email = ${sql.param("x")}`,
).executeTakeFirst();
const user = await sql(
	`SELECT id, email FROM users WHERE id = ${sql.param(7)}`,
).executeTakeFirstOrThrow();
const changed = await sql(
	"UPDATE users SET display_name = NULL",
).executeCount();
```

With postgres.js, `execute()` returns a plain array, without postgres.js' result metadata (`count`, `command`, `columns`).

Attach `.withPlugin(new CasePlugin())` (imported from `@typesql/core`) for [camelCase row keys](../guide/queries#camelcase-row-keys). With postgres.js, leave its own `transform: postgres.camel` off. To run a query on another client, see [Custom executor](./custom-executor).

## Transactions

`sql.transaction(fn)` runs `fn(tx)` in a transaction; see [Transactions](../guide/transactions).

```ts
const id = await sql.transaction(async (tx) => {
	const { id } = await tx(
		`INSERT INTO users (email) VALUES (${tx.param("a@b.c")}) RETURNING id`,
	).executeTakeFirstOrThrow();
	await tx(
		`INSERT INTO posts (author_id, title) VALUES (${tx.param(id)}, ${tx.param("Hello")})`,
	).execute();
	return id;
});
```

- **node-postgres:** on a `Pool` it checks out one client for the transaction and releases it afterwards. If the `ROLLBACK` itself fails, the client is released with the error, so the pool drops that connection. On a `Client` or `PoolClient` it runs on that connection, and releasing it is up to you.
- **postgres.js:** it is postgres.js' `begin(fn)`, and on a `TransactionSql` it is `savepoint(fn)`. A `ReservedSql` has neither, so there it sends `BEGIN`/`COMMIT` (and `SAVEPOINT` when nested) on the reserved connection.

## Types

- **node-postgres:** rows are typed with `PgTypeMap`, which matches what `pg` returns by default. `int8` (so `count(*)`), `numeric` and `money` are strings, dates are `Date`, `json` / `jsonb` are parsed, and most other types are the text Postgres sent. The full table, including two array types that differ at runtime, is in [Type mapping](../reference/type-mapping#node-postgres).
- **postgres.js:** rows are typed with `PostgresJsTypeMap`, which matches postgres.js' default parsers, or `PostgresJsBigIntTypeMap` with `{ bigint: true }`. Numbers, booleans, dates, JSON and `bytea` are parsed; everything else, including `int8` and `numeric`, is the text Postgres sent. Arrays are parsed element by element. Versions 3.x and 4.x parse a few date values differently ([Dates](../reference/type-mapping#dates)). The full table is in [Type mapping](../reference/type-mapping#postgres-js).

## Migrations

The [migrator](../guide/migrations#the-migrator) connects by itself from a `url`, with `pg`. To run it on a connection you manage, pass the adapter's `executor` as `execute`, with one connection for the whole call, not the pool:

::: code-group

```ts [node-postgres]
import { createMigrator } from "@typesql/core/migration";
import { executor } from "@typesql/pg";

const client = await pool.connect();
try {
	await createMigrator({
		dialect: "postgres",
		execute: executor(client),
		migrations: [createUsers, addBio],
	}).latest();
} finally {
	client.release();
}
```

```ts [postgres.js]
import { createMigrator } from "@typesql/core/migration";
import { executor } from "@typesql/postgres";

const reserved = await db.reserve();
try {
	await createMigrator({
		dialect: "postgres",
		execute: executor(reserved),
		migrations: [createUsers, addBio],
	}).latest();
} finally {
	reserved.release();
}
```

:::

The `typesql introspect` command of `@typesql/cli` reads a database through `@typesql/pg`; see [From a live database](../guide/introspect).
