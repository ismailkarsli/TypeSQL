# node-postgres

`@typesql/pg` runs your queries on node-postgres (`pg` 8.x).

```sh
npm install @typesql/core @typesql/pg pg
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagHYD2AJrALTSEDOWA5gE6xWgAUAAljEwI4A2w0WgEoAdKEQBXWPQxNQ9CflCElkQhPqgACoUK8ANKACG+YvMJpmRxqE5wzAI0jocRrACgQoQQHJmpADMjCV4sb2sqaWZGLA18AC5QDHwsAA5jUwIJAFtpDABjY2YaGXxaKkMsDFyaI2zoK2YAETdYMQAJQgA3aVscWHkmEKwqEXd3asp6MLsBgG9QAGE9QwBxWHxpVuJDADkQ3iMHXgGAX1AA+kJs0AAiDi4qPmB8wkZbgG4J+rewhfzGK14HxQOdLtc7g84E9+IJPt8pn9tLpeKCLlcbrc4V9PGAAOoyLADXAYZhOUCuUyGN6gWgbLZEpJhcE3NQaUDENxHIyRRIAA1mMKSKSuVDg+TCZDIGlRgDICUBS9RhKj5frZIwiEZ8iYpaRBfIDJoAIVAc3cAEgJJF6FREmbzeaMMREutNvRtgAeW7JLAAFluAD4vg7YOqMLxEsteF6iQAPLCB4Pm4ik6CHSAAfXwdVgiX2vEOx1gMdg8cTFvNDiMh3wBsjei9+ByeXy5YdANg2wzbhd9PdROIMeqTCwdWgWAAXm3TsHKDRbaaK07e27Pd6Uqk2+bgrg3hnl0sG+u-VuqlgTvXo7c4wmgxXoBJjqT+sRu1g8wcjichzVR-VJ9OXynOMrz4DQ3goqAAC8BCwGgyJ6Cw-wqJsEoYCo8BYKUtCJFi1B0IwtogLwhD5NWOD4cARjQNAtygkIXygeBQowR2QJ8B6xoBiwlB6AxIEqOBTgAIISLumgwTCLAWny8AAKLIHJizgN4IhOoY0CatgJwaSID5PlQL5voYEgiKGRjhu4oDWTZtl2fZoAAGIAEoAPIALIQfO3igAAUq5ACSuygFaUQhaArnBaZTrQapO4UfQ+7EFZDmpfZeLtHJzlyXFYkJUlsUACQAIx8voFoAOzlfxTFhHOIyxUYaAWWEIl5W8ZmxrA+RibALD8V4NkAHoAPwCWBYShRJxjNdgoBSTJ8mKcpSQ7KAVY1gahhsQOb5OW5nlTcwGVZTl5nhkVpXleatxGJybClmOJwiK82S3NVnXdb14BGAA1rAjkYDaWCufQ4A4FcaD9V8g3WaN43ga8igNTBTUtfNfDSeaskKUpKnxXu6mgEjKQsAAVEIoDCfABD7R5XkNasbkAKpaKARoAJrGO1iVOmV7iiKWX1EtDuK2fDYtYLGSTFCCDjqJkWCEMomy2O6YFGGhKiRh57kBSpaD9EouADAEiha0ohF6D0FSgG5yDIEawmLAA0i4GxMn0kOjO4tUMwFZio7Nyp8Jq6tUJrVQqCwPKQLWrBS5TUEBou5qDfD5p+wsMXnEH6NS1j2NBfJzkqUF4CuSF1rMCw50GOt1YmAalMAGrCcgzNyTTLAlYYhUAEyU9l4DM85uxBasq38w6twMJrsAPbGT1tK970VgADNdgtdT1RI-f9gPA6D4OQ6LmeCXV+GNcHtixoXfLF1lZe7BXDM1wTvNrWeJyt+3nfd73UAA8h5yRHmPCeU9rqOh2BWW47RYAFkIGvc029hawH3gDIGNBj4QwsGfGIcQGZqWIEBfiYstDWBzESG0xgbCqm6v9MwRhaAWQmn0WAQNiZ6ByAkbm4kCqkmFH6MYaM5pST5E0XG4AcouXpvVY6mVsp8PyjFGCJUyp3AqrcVBu8+oMVAF4aQVx6CJCMPNLCyRaAywIIQMIJghG+ncEAA) <!-- playground:pg --> to hover the types and edit the SQL, with nothing to install.

## Create `sql`

Pass your pool or client to `createSql`. Every query you build with it runs on that client:

<<< @/snippets/adapters.ts#pg

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
