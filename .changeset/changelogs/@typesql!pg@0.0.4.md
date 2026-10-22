## 0.0.4

### Patch Changes

- An opt-in `PgCatalog` slice types queries on `pg_stat_activity`, `pg_stat_database`, `pg_tables`, `pg_class`, `information_schema.columns` and other system catalogs: `createSql<DB & PgCatalog>()`.

- Queries have `executeCount()`, which resolves to the affected row count: an `Executor` may resolve to `{ rows, rowCount }` instead of the rows, as the `executor()` of `@typesql/pg`, `@typesql/postgres` and `@typesql/kysely` now do.

- `createSql(executor, { rowKeys: "camelCase" })` (and the adapters' `createSql(client, { rowKeys: "camelCase" })`) camelCases the top-level row keys the way Kysely's `CamelCasePlugin` does, in the row types and in the rows `execute*` and the `query`/`one`/`maybeOne`/`many` helpers return, leaving JSON values untouched.

- Rows with `interval` columns are plain object types, so a package that exports them no longer needs `@typesql/pg` as a dependency for declaration emit (TS2883); `PgInterval` stays exported.

- The type maps declare what parameters accept (`PgParamTypeMap`, `PostgresJsParamTypeMap`), so `int8`/`numeric` parameters take numbers and bigints and timestamp parameters take strings; postgres.js timestamp parameters also take epoch milliseconds.

- `typesql introspect` (a bin of `@typesql/pg`, also `@typesql/pg/introspect`) writes the schema of a live database: exact column types, domains as their base type, enums, arrays, views with nullability read from their definitions, other schemas nested, and `Json<T>` columns for the TypeScript types `columnTypes` gives json / jsonb columns.

- Updated dependencies:
  - @typesql/core@0.0.4
