## 0.2.0

### Minor Changes

- `NoResultError`, `Executor` and `TransactionalSql` are no longer re-exported (from `@typesql/drizzle` also `Sql`, `Query`, `RowType`, `ParamsType`, `DefaultTypeMap` and `TypeMap`); import them from `@typesql/core`.

- `createBigIntSql(sql)` is replaced by `createSql(sql, { bigint: true })`, and `PostgresJsBigIntSql<DB, Keys>` by `PostgresJsSql<DB, Keys, PostgresJsBigIntTypeMap>`.

### Patch Changes

- The README's TypeScript Playground example uses `createSql(sql, { bigint: true })` instead of the removed `createBigIntSql`.

- Updated dependencies:
  - @typesql/core@0.5.0
