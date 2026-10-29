# node-postgres

`@typesql/pg` runs your queries on node-postgres (`pg` 8.x).

```sh
npm install @typesql/core @typesql/pg pg
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQU8yFJgBzKCikiA3AChQkWBjiKd1FAGU5cXgKGiJyXXLWaDx8NHiYABQg8B35BYREwLyNjUhooPkpFNAARACEMQwBIJikKKQAuTKys4FoiknIqGloAHhFgOIAWEQA+IxKUEEpgXCKcXHqaAA8YNo6s2mApMDZEAH1SShAUIuZWDi4hlFHx7Kz2SjZSZP68etImFahgRT2SyxRrWnnqCrIKZ6HQXRhlsBgAC97twOuoYIViqVysQPtU6PVGjAABz3LKUJgwAAW0HmZTOgwazTRMGAMC4BO2u3a+zATE40yxdFeMDWLDYnBQ3xWGn+QJBRm4hkMylIGjgkBCAF44OQAO5wIJ4AAUmFF5EUpIgpBsMBupE0RUiEA02l0BXk8lwEEURxxGnklDAYBEDgAlEZReLZLg4DLHtY7IN0q1lZLcB7hV74OxEABBTE4qB+uA+5XZAAGNgAogAZbNYAAqEoAdGVCGAS6TySgKyW6QypEyXtRCEwS10erhDHBe33+wPB3AAGIAJQA8gBZCUmiESuAAKXHAEkGHBcvl13Bx2v22UU5WMdjcWUe0Pz4OAOoACWzo+zpaPSbxtBTABIAIwZ-DZADsP8jaMZw0KQU0oOUehjeNE2gDthhQRRMRQZVIxFbVxQ3ZMZXAyDUzkdMsizPMC2Lcs4EOY5kkIAMahZEcJ2nTDQJvO8H07Xp3y-H8shEShaEoMQdn+LgS2UEARAAuCEKQwtKAAaxQYdgCgDRxygQssUEOUUJiIDlCYOJQOwiCyTw3ACKI-MizgJ8T3oCwIAMmBlQAKjdOA4xsWV6KnYC5yICcAFUAjgNIAE0bJgqAX2-Qw3SkxCaB0qN0PgcFl1fYzcJ9KsqDFJItVIZVKCkRATjgZUYGGdypVaYogMwfdeCy0yqoIwjVxzUdi1XQtx3XPIVIq9iCHIo5KBOFB3IANTjXNAuzLzlU-Qg3wAJnc+9C0C0cGFXIg4DKWKShEbQkhQQThmElBRKECT9gABm4+KdmkmhZIUpSVJgNSNK05KsiA8EwJM+A2v2DNOrvHqGD6vzQOKqKX0IasuBmuaFqWla4HWzbs223b9sO2hjuhbieOvFBWAge6she+DEpQD7FOU1T1M0iBtMjLIdBgJgoFIPyy1oQVUJw0y0wzFJiMLB8x188FmNve9IuPaL9xlT9v1EX8RHpt7kMjIA) <span data-playground="pg"></span> to hover the types and edit the SQL, with nothing to install.

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

Pass `{ rowKeys: "camelCase" }` as the second argument for [camelCase row keys](../guide/queries#camelcase-row-keys). To run a query on another client, see [Custom executor](./custom-executor).

## Transactions

`sql.transaction(fn)` runs `fn(tx)` in a transaction; see [Transactions](../guide/transactions). On a `Pool` it checks out one client for the transaction and releases it afterwards. If the `ROLLBACK` itself fails, the client is released with the error, so the pool drops that connection. On a `Client` or `PoolClient` it runs on that connection, and releasing it is up to you.

## Types

Rows are typed with `PgTypeMap`, which matches what `pg` returns by default. `int8` (so `count(*)`), `numeric` and `money` are strings, dates are `Date`, `json` / `jsonb` are parsed, and most other types are the text Postgres sent. The full table, including two array types that differ at runtime, is in [Type mapping](../reference/type-mapping#node-postgres).

## Migrations

`migrate(pool, m)` runs a [`migrations()`](../guide/migrations) builder's statements in one transaction, on one client from the pool. See [From migrations](../guide/migrations#running-migrations).

`@typesql/pg` also ships the `typesql introspect` command; see [From a live database](../guide/introspect).
