## 0.0.4

### Patch Changes

- Queries have `executeCount()`, which resolves to the affected row count: an `Executor` may resolve to `{ rows, rowCount }` instead of the rows, as the `executor()` of `@typesql/pg`, `@typesql/postgres` and `@typesql/kysely` now do.

- `execute(db, q)` resolves to 0 instead of `null` for statements without a count, such as DDL, and `PostgresJsRows["count"]` is `number | null`.

- `createSql(executor, { rowKeys: "camelCase" })` (and the adapters' `createSql(client, { rowKeys: "camelCase" })`) camelCases the top-level row keys the way Kysely's `CamelCasePlugin` does, in the row types and in the rows `execute*` and the `query`/`one`/`maybeOne`/`many` helpers return, leaving JSON values untouched.

- The type maps declare what parameters accept (`PgParamTypeMap`, `PostgresJsParamTypeMap`), so `int8`/`numeric` parameters take numbers and bigints and timestamp parameters take strings; postgres.js timestamp parameters also take epoch milliseconds.

- Updated dependencies:
  - @typesql/core@0.0.4
