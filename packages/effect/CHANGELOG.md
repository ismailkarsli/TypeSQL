# @typesql/effect

## 9.0.0

### Major Changes

- Statement methods are renamed like those of `@typesql/core`: `execute()` to `exec()`, `executeTakeFirstOrThrow()` to `execTakeFirst()` (still failing with the tagged `NoResultError`), `executeTakeFirst()` to `execTakeFirstOrNone()` and `executeCount()` to `execCount()`. `execTakeFirstOrNone()` still succeeds with `undefined` when there is no row.

### Patch Changes

- An `sql` with a plugin, such as `createSql<DB>(dialect, client).withPlugin(new CasePlugin())`, can be named by its type: annotated as `EffectSqliteSql<DB, DefaultTypeMap, [CasePlugin], never>` (or `EffectSql`, `EffectMysqlSql`, `EffectMariaDbSql`), or as `ReturnType<typeof makeSql>` in a callback. Before, these failed with `TS2589: Type instantiation is excessively deep and possibly infinite` (`TS5114` on PostgreSQL). The four types are now interfaces; `EffectSqlOf<Dialect, …>` names the one for a dialect, as before.

- Updated dependencies:
  - @typesql/core@9.0.0

## 8.2.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@8.2.0

## 8.1.0

### Minor Changes

- New package: `createSql(dialect, client?)` gives an `sql` whose statements are Effects on an Effect `SqlClient` (`@effect/sql-pg`, `@effect/sql-sqlite-node`, `@effect/sql-mysql2`). `yield*` a statement for its rows, or call `execute()`, `executeTakeFirst()`, `executeTakeFirstOrThrow()` (which fails with the tagged `NoResultError`), `executeCount()` or `stream()`; `sql.withTransaction(effect)` runs a transaction, and `${query}` splices a statement as a subquery. Rows are typed with `EffectPgTypeMap`, SQLite's `DefaultTypeMap` or `EffectMysqlTypeMap`.

### Patch Changes

- Updated dependencies:
  - @typesql/core@8.1.0
