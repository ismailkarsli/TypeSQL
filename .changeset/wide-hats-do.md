---
"@typesql/core": patch
---

Queries have `execute`, `executeTakeFirst` and `executeTakeFirstOrThrow` (throws `NoResultError`), running on an `Executor` passed to `createSql(executor)` or to the call.
