# postgres.js

`@typesql/postgres` runs your queries on postgres.js (`postgres` 3.x).

```sh
npm install @typesql/core @typesql/postgres postgres
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBamgPYDOWA5gE6xEB0AVkaABQACWMVAjgDbCEkVUAlNVCIArrHIYqocmIB26bHiLdqCogEMAZrEZZYADywAaUADdNXCUUFnN8gCayCaIgCgQoTZVBs4zgBGkOg4mlj4xGSUNPT4PkRUAFygGPJYABypDJqgJFLypGYE5N6ggRikaRGYuKAAQpUAkunx5ERppKAE8tTu7hgAtoTkEf6woADeoADCBFxmAOKw8pLhsI5mAHJiXFyagVwTAL6g2uQEg6AARKzsqjwAxiWw1wDcA8MlEdOPlOvwbigU7nS43O5wB68KICIjvT4jMbsKagQFcYFnC5Xa58aJUeEDdKSbSaR4TAAi9Sm7gAkGJEu0UpNaTSMI4UstVuR1o4ADzXaoAFmuAD4PjSabBBpoMFwUnMuPyDMZReKaY4MERoPtIAB9eSaQawFI7PYHI5KoxYVUsv6wHm68IclZrAx865YIZULCG6BYABeNppx3FuKITJZbOdXJ5-OqGSDNM0YlwJV1Udm8zj6WFYpZnqwR3lWY9VsTPtI4czitLxgA2gBdIMh9zHfqOWCPfa+Z7yEigRyBFJot6gLy42GMHEwmJJEBcAiPKw4KLATTQaDXQTuXv9h6gAC8oDtAO4vMpIsYg8EHx3PX7YcP3jQMoiD0YtIABvAAKLIH8zOAqSbH42BHGYFYMAAYgASgA8gAspEJAMAA6gAEj+ME-qAAAkACMT4AIJbAAmkwkGCJ+Ji0tcDzXDRwhGJ2KZ6DenhgKAXEAHoAPz9F4cGKLkvarI8no9EodSfuMVbTBUVTpCkE4xNQjSkC0ETHNRqTpFkDjOM8ChYIwABUgjHpcEyBKSADW3gMAp1R9B2XY+BMu4RIO6nDme8mVNUKROa0xx5p55SVE+J4GGi571Je3mVGY-mKVgKRYHIJzseFRnpAwR6aC+2ARaQH40t+f4AUByapuQ6YgblJnmaARHwKAiiwYhyFYAwizwQAqgACg05E1SudVstR7hMYYLEGIw7FeFxoB8QJYAPNQGUOFo4kYJJmp5GogSwIpo5YIYm3cn2pISYoB25Fo5iwIQznuIVr6HVwl3bTde3yIwmhEJA8iPBRhgWQeIrUkmRVjIYZXlUN5JEeAOGPr+QEFkcT5iBukj6GBsAWRhWE4WNaZsk+BFTRKADsNE0jNc1seK4WKAVsN+PDLKfuSlWo6AnVIY+JPYcePgagaXDYJA+iaJWEOgAADDTTOPKxczGQt4pLTx-HHOx7jvhV-6AcBgvwcLURoZhYuQaAzBQ9TZh0dwW6jl4kgXOQ6Xywwjt+JotkyLkypYI27hAA) <!-- playground:postgres --> to hover the types and edit the SQL, with nothing to install.

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
