# postgres.js

`@typesql/postgres` runs your queries on postgres.js (`postgres` 3.x).

```sh
npm install @typesql/core @typesql/postgres postgres
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBamgPYDOWA5gE6xEB0AVkaABQACWMVAjgDbCEkVUAlNVCIArrHIYqocmIB26bHiLdqCogEMAZrEZZYADywAaUADdNXCUUFnN8gCayCaIgCgQoTZVBs4zgBGkOg4mlj4xGSUNPT4PkRUAFygGPJYABypDJqgJFLypGYE5N6ggRikaRGYuKAAQpUAkunx5ERppKAE8tTu7hgAtoTkEf6woADeoADCBFxmAOKw8pLhsI5mAHJiXFyagVwTAL6g2uQEg6AARKzsqjwAxiWw1wDcA8MlEdOPlOuNUgtLDwbhmP6wdagrigU7nS43O5wB68KICIjvT4jMbsKagaGws4XK7XPjRKiYgbpSTaTSPCYAEXqU3cAEgxIl2ilJmzWRhHCllqtyOtHAAea7VAAs1wAfB9WazYINNBguCk5lwJQZjHKFazHBgiNB9pAAPryTSDWApHZ7A5HbVGLB63kQ0Vm8KClZrAzi65YIZULBW6BYABertZxwVZKI3N5-O9wtFEuqGSjrM0YlwJTNSdm8zT6Rl8t5gawRw1RYDzszIdI8cLWtrxgA2gBdKMx9zHfqOWCPfa+Z7yEigRyBFLQt6gLxk9GMUlomJJEBcAiPKw4KLATTQaDXQTuUfjh6gAC8oHdBmhYqZssYk8EHxPPXHccv3jQqoiD0YbIAAbwAAosgIEzOAqSbH42BHGYDYMAAYgASgA8gAspEJAMAA6gAEiBKEgaAAAkACMX4AIJbAAmkwiGCIBJhstcDzXCxwhGIOOZ6C+nhgKAQkAHoAPz9F4aGKLko6rI8gY9EodSAeMTbTBUVTpCkC4xNQgLArCzGpOkWQOM4zwKFgjAAFSCNelwTIEdIANbeAwGnVH0A5Dj4EynhEk6AtO3BiuplTVCkHmtMcZb+eUlRfjesD6ekd4Pk+gSAvxcUWekDBXpoP7YPFpAAaywFgRBUHZrm5D5jBuVWbZoBUfAoCKKhmHYVgDCLOhACqAAKDT0TVO51fyzHuFxhg8QYjD8V4QmgGJElgA81BYCKY50gpihGnkaiBLAmmzlghibdtWjyRgikHbkWjmLAhCee4hW-odXCXQ4117YwmhEJA8iPAxhh2ResoslmRVjIYZXlUNDJUeAJGfqBUEVkcX5iAekj6HBsB2QRREkWNeb8l+FFTYqADsLGsjNc18QqcWKAVMN+HDvKAQylUo6AnVYZ+xPEdePiGpaXDYJA+iaI24OgAADNTjOPLxcyWQtCpLSJ4nHPx7j-hV4GQdBAvoULUR4YRouIaAzCQ1TZhsdwR6zl4kgXOQKR2w7fiaM5Mi5DqWCdu4QA) <!-- playground:postgres --> to hover the types and edit the SQL, with nothing to install.

## Create `sql`

Pass your postgres.js connection to `createSql`. If the connection parses `int8` to `bigint`, pass `{ bigint: true }`:

<<< @/snippets/adapters.ts#postgresjs

It takes the `Sql` instance, the `TransactionSql` that `begin` passes, or a `ReservedSql`. Queries run with `unsafe(text, values)`, so the text reaches the server as written.

## Run queries

The `execute*` methods are the same as with [node-postgres](./pg#run-queries). `execute()` returns a plain array, without postgres.js' result metadata (`count`, `command`, `columns`).

Pass `{ rowKeys: "camelCase" }` as the second argument for [camelCase row keys](../guide/queries#camelcase-row-keys), and leave postgres.js' own `transform: postgres.camel` off.

## Transactions

`sql.transaction(fn)` is postgres.js' `begin(fn)`, and on a `TransactionSql` it is `savepoint(fn)`. See [Transactions](../guide/transactions).

## Types

Rows are typed with `PostgresJsTypeMap`, which matches postgres.js' default parsers. Numbers, booleans, dates, JSON and `bytea` are parsed; everything else, including `int8` and `numeric`, is the text Postgres sent. Arrays are parsed element by element. The full table is in [Type mapping](../reference/type-mapping#postgres-js).

## Migrations

`migrate(db, m)` runs a [`migrations()`](../guide/migrations) builder's statements in one transaction. See [From migrations](../guide/migrations#running-migrations).
