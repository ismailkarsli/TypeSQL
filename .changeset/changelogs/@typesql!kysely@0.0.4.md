## 0.0.4

### Patch Changes

- Queries have `executeCount()`, which resolves to the affected row count: an `Executor` may resolve to `{ rows, rowCount }` instead of the rows, as the `executor()` of `@typesql/pg`, `@typesql/postgres` and `@typesql/kysely` now do.

- `createSql(executor, { rowKeys: "camelCase" })` (and the adapters' `createSql(client, { rowKeys: "camelCase" })`) camelCases the top-level row keys the way Kysely's `CamelCasePlugin` does, in the row types and in the rows `execute*` and the `query`/`one`/`maybeOne`/`many` helpers return, leaving JSON values untouched.

- `execute(db, q)` returns the number of rows for statements Kysely reports no `numAffectedRows` for (`SELECT`), as `@typesql/pg` does, instead of 0.

- Parameters accept `null` wherever Postgres does: comparisons (`col = $1`, `IN`, `ANY`, `LIKE`), `LIMIT`/`OFFSET`, casts in comparisons and function arguments (`coalesce($1::text, 'x')`), and array elements (`(number | null)[]`); assigning `null` to a `NOT NULL` column is still an error.

- Updated dependencies:
  - @typesql/core@0.0.4
