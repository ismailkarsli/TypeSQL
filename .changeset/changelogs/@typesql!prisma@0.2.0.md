## 0.2.0

### Minor Changes

- `@typesql/prisma/generator` exports only `generateSource` (with its `EmitOptions` and `DmmfDatamodel` types); the generator's protocol and handler pieces are internal.

- `NoResultError`, `Executor` and `TransactionalSql` are no longer re-exported (from `@typesql/drizzle` also `Sql`, `Query`, `RowType`, `ParamsType`, `DefaultTypeMap` and `TypeMap`); import them from `@typesql/core`.

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.5.0
