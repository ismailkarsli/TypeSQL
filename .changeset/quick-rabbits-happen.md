---
"@typesql/core": major
---

Query methods are renamed: `execute()` to `exec()`, `executeTakeFirstOrThrow()` to `execTakeFirst()`, `executeTakeFirst()` to `execTakeFirstOrNone()` and `executeCount()` to `execCount()`. `execTakeFirstOrNone()` still resolves to `undefined` when there is no row, and `execTakeFirst()` still rejects with `NoResultError`.
