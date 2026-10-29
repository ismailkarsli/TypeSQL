# node-postgres

`@typesql/pg` runs your queries on node-postgres (`pg` 8.x).

```sh
npm install @typesql/core @typesql/pg pg
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQUIgNwAoUJFgY4iqCmooAynLi8BQ0ROQpZCsAHN1W8NHiYAChDwX+gsIizq5apDRQfJSKaAAiAEIYGgCQTFIUUgBcScnJwLTZJORUNLQAPCLA4QAsIgB8mrkoIJTAuNk4uBU0AB4w9Y3JtMBSYGyIAPqklCAo2cysHFzdKH0DKcnslGykMR14FaRMs1DAiuu5BkalE9SFZBTG5SIwoPYwM2AwAF4X3I2QKQwLI5PIFYgPEp0CpVGAADguyUoTBgAAtoBN8vsupUaojXjAuNiVmsGhswExOCNUXRbjB5iw2JwUN03kDPj8-ppuBoNMpSEC4JA-ABeODkADucB8eAAFJh+eRFK8IKQTDBTqQnNlghAgU5DFl5PJcBBFNt0UD5JQwGARBYAJSafmChxwMVXYxmLoJOqy4W4J28l3wdiIACCKPRUHdcAcspSAAMTABRAAyKawABUhQA6fKEMC5glcQu5ilUqQ02h0whMXPNVq4DRwVtt9sdztwABiACUAPIAWSFeuBQrgACl+wBJBhwNIZedwftz+v5WNF5FojH5Ftd-edgDqAAkU72U3mt9HMbRYwASACMifwKQA7C+gyGR0CpLHKBLWlDCMo2gBsehQRQURQWUgz5VVBQXGMxX-QC4zkBNkmTdNMxzAs4C2HYYkIT0bmoHsB2HRDfxPM8L0bNp7yfF9khEShaEoMRVk+Lhc2UEARA-MCIKgrNKAAaxQbtgCgIF+ygLNUUECUYM0OCBXgZQmHCX9kIA4B4HjJNUwzbM4CvHd6H0CAtJgWUACoHTgcMTHFcih2-MciAHABVLw4HiABNMyQKgG9nw0B0hMgmgVODeD4EBGBp1vXTUIcYsqAFaIVVIWVKCkRBdjgWUYB6RyRTqHIv0wddeFS-SEB6DDMNnVNexzWcs37ed0hk4r6IIfDtkoXYUEcgA1cM028lMXNlR9CDvAAmRzzyzbzewYWciDgfJwtyEQDWiFBOJ6biUF4oQBI2AAGZjItWYSaFEiSpJkmA5IUpTYuSL9Er-PT4FK5rE1as8OoYLqPN-PKQpvQgSzGuBJum2bioWuBltWlN1s27bdtofawWYljjxQVgIGu5IHvA6KUBeyTpNk+TFIgZSg2SQwYCYKBSA8-NaG5WCUIa+NE1ibCswvPt3MS6jT3PYLt1C9cxUfZ9RFfEQaae6CgyAA) <span data-playground="pg"></span> to hover the types and edit the SQL, with nothing to install.

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
