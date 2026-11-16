---
"@typesql/effect": minor
---

New package: `createSql(dialect, client?)` gives an `sql` whose statements are Effects on an Effect `SqlClient` (`@effect/sql-pg`, `@effect/sql-sqlite-node`, `@effect/sql-mysql2`). `yield*` a statement for its rows, or call `execute()`, `executeTakeFirst()`, `executeTakeFirstOrThrow()` (which fails with the tagged `NoResultError`), `executeCount()` or `stream()`; `sql.withTransaction(effect)` runs a transaction, and `${query}` splices a statement as a subquery. Rows are typed with `EffectPgTypeMap`, SQLite's `DefaultTypeMap` or `EffectMysqlTypeMap`.
