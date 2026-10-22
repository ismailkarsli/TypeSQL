---
"@typesql/core": patch
"@typesql/pg": patch
"@typesql/postgres": patch
"@typesql/kysely": patch
---

Queries have `executeCount()`, which resolves to the affected row count: an `Executor` may resolve to `{ rows, rowCount }` instead of the rows, as the `executor()` of `@typesql/pg`, `@typesql/postgres` and `@typesql/kysely` now do.
