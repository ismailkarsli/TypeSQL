# node-postgres

`@typesql/pg` runs your queries on node-postgres (`pg` 8.x).

```sh
npm install @typesql/core @typesql/pg pg
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBDAnmApnA3nAwhANnAXzgDMoIQ4AiAASVQGcBHXAegGNoUXJ6YBzKCnqUA3AChQkWBjhtBAQxgoAys0IkyFGnSHNufURPDR4mAAoQ860uSpgD4iQDslUYvLZoAIgCEMYgEgAV3oUKHoALn8AgOAAEyicXAAeSmAXABZKABoZAAt5ei8UdyDcGCiYKCC0AgA+cRiUEHlgXES8VKUADxhKBsCAuOB6MFx5RAB9J3kQFA6Uyh6+3MwnMvGAI1x5hGragZjN+XGnTwXU9bmoYDZ+xoC5FEUUOMnFC6XQIRhZsBgAF45fKFYqlcqVfaEQ4ERo8GCRaKxBLYTppFwADmBmAKRRK8jKFT2NWhDwJMDy0Em8U+6RgWUOARgwBgO0+y3ugzAQW2Izyr3eRKSXW+vD+gOxcHWuC2bOJB0asLEBDEYg4Tl4cEgVgAvFKUAB3OAWPAACkw6qcKDYzIgTmUVXSfCilHhAiEERYLFwEDYJ0pvBY8jAYEohAAlOJ1ZqmPg9U8XqoUr46qbtbhI6ro-BNogAIJBCnQOB62OmwIAA2UAFEADLVrAAFS1ADp4rkwC3mayUB2W9zefR+W9FLkgi3mq1cGI4LO5-OF4u4AAxABKAHkALJaiC8ehauAAKXXAEkAHJwEJhfdBODri-j+Il1vkylQalxGdL7+LgDqAAlq1XasX0LN8P2fAASABGCtskCAB2eDM2zHc92feQDVaHN8zA6AJ26a1CxQU1MzVO1NSvKAMKwlk4DLSsa3rJs4HbOBjlOTxcgTJQR3gNct0vUJwjgACgJAyc2ig2D4ICSh5DieRqBQbo-h2FsOBAHIxHDAiiKURt5AAaxQZdgHCGB1ygRs8jIA1SMcVCOCCFx9z1TDsPo5hywCKs6wbZtXypNjnJcU0ACpwzgPNlClFcN23eF9wAcQ3ABVMw4B8ABNOAgvfeI4J0vS2GIhyswo+B4RPOIaM82MuygeQNQ8W0nFNQpEDOOBTRgboop1OpolQzAnyIdzaPgPqfN888a1XZtz0bdchOvHrJNwXIOOazwooANTzWs0urWLTRg3JIIAJii4DGzS1cz3PZLWLiIqYkoAQPBQZTVPAdTNO0mIAAZZN0lT9JQQyTLMiyrJsuzyseSq0PgCbPOmwYKzmoDFrPZaUf3Dq8IKuJcm7HZ9sO47TvOuArpu6s7oep6Xre5FZLk-8UBlCBAbBwjSoM4zTPM3g4dsiB7MzAJBBgIIoCcFG2zicQCDIjy6LLCsvH8xsQIExLdwRUTAOAvLiYgvUYLgqgEMofmIfKoA) <span data-playground="pg"></span> to hover the types and edit the SQL, with nothing to install.

## Create `sql`

Pass your pool or client to `createSql`. Every query you build with it runs on that client:

```ts
import { Pool } from "pg";
import { createSql, migrate } from "@typesql/pg";

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

`migrate(pool, m)` runs a [`migrations()`](../guide/migrations) builder's statements in one transaction, on one client from the pool. See [From migrations](../guide/migrations#running-migrations).

The `typesql introspect` command of `@typesql/cli` reads a database through this package; see [From a live database](../guide/introspect).
