## 0.2.0

### Minor Changes

- `@typesql/pg/introspect` no longer exports `main`, `ViewNullability` and `parseNodeTree`.

- `NoResultError`, `Executor` and `TransactionalSql` are no longer re-exported (from `@typesql/drizzle` also `Sql`, `Query`, `RowType`, `ParamsType`, `DefaultTypeMap` and `TypeMap`); import them from `@typesql/core`.

### Patch Changes

- `typesql introspect` no longer hangs on views that read each other (`CREATE OR REPLACE VIEW` allows the cycle); their columns are nullable.

- Updated dependencies:
  - @typesql/core@0.5.0
