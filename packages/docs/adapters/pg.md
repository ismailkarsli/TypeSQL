---
description: "Run TypeSQL queries on node-postgres (pg) with @typesql/pg: create sql, run queries and transactions, type parsing and migrations."
---

# node-postgres

`@typesql/pg` runs your queries on node-postgres (`pg` 8.x).

```sh
pnpm add @typesql/core @typesql/pg pg
```

## Create `sql`

Pass your pool or client to `createSql`. Every query you build with it runs on that client:

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const pool = new Pool();
const sql = createSql<DB>(pool);

const users = await sql("SELECT id, email FROM users").execute();
const maybe = await sql(
	"SELECT id FROM users WHERE email = $1",
	"x",
).executeTakeFirst();
const user = await sql(
	"SELECT id, email FROM users WHERE id = $1",
	7,
).executeTakeFirstOrThrow();
const changed = await sql(
	"UPDATE users SET display_name = NULL",
).executeCount();

const id = await sql.transaction(async (tx) => {
	const { id } = await tx(
		"INSERT INTO users (email) VALUES ($1) RETURNING id",
		"a@b.c",
	).executeTakeFirstOrThrow();
	await tx(
		"INSERT INTO posts (author_id, title) VALUES ($1, $2)",
		id,
		"Hello",
	).execute();
	return id;
});
```

It takes a `Pool`, a `Client` or a `PoolClient`: anything with `query(text, values?)` that resolves to `{ rows, rowCount }`, so a fake client works in tests.

## Run queries

| Method | Returns |
|---|---|
| `q.execute()` | `Promise<Row[]>` |
| `q.executeTakeFirst()` | `Promise<Row \| undefined>` |
| `q.executeTakeFirstOrThrow()` | `Promise<Row>`, or rejects with `NoResultError` when there is no row |
| `q.executeCount()` | `Promise<number>`: the rows changed or returned, 0 for DDL |

Attach `.withPlugin(new CasePlugin())` (imported from `@typesql/core`) for [camelCase row keys](../guide/queries#camelcase-row-keys). To run a query on another client, see [Custom executor](./custom-executor).

## Transactions

`sql.transaction(fn)` runs `fn(tx)` in a transaction; see [Transactions](../guide/transactions). On a `Pool` it checks out one client for the transaction and releases it afterwards. If the `ROLLBACK` itself fails, the client is released with the error, so the pool drops that connection. On a `Client` or `PoolClient` it runs on that connection, and releasing it is up to you.

## Types

Rows are typed with `PgTypeMap`, which matches what `pg` returns by default. `int8` (so `count(*)`), `numeric` and `money` are strings, dates are `Date`, `json` / `jsonb` are parsed, and most other types are the text Postgres sent. The full table, including two array types that differ at runtime, is in [Type mapping](../reference/type-mapping#node-postgres).

## Migrations

The [migrator](../guide/migrations#the-migrator) connects by itself from a `url`, with `pg`. To run it on a connection you manage, pass `executor(client)` as `execute`, with one `Client` or `PoolClient` for the whole call, not the pool:

```ts
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

The `typesql introspect` command of `@typesql/cli` reads a database through this package; see [From a live database](../guide/introspect).
