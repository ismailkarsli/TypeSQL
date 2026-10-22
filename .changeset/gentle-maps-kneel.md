---
"@typesql/core": minor
---

Adapters build their `sql` with `createTransactionalSql(client, driver)`, typed `TransactionalSql` (core's `Sql` plus `transaction(fn)`), and `runTransaction` sends BEGIN/COMMIT/ROLLBACK or savepoints; an `Executor` may have a `count(text, values)` method, which `executeCount` runs instead.
