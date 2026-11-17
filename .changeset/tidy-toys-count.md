---
"@typesql/effect": major
---

Statement methods are renamed like those of `@typesql/core`: `execute()` to `exec()`, `executeTakeFirstOrThrow()` to `execTakeFirst()` (still failing with the tagged `NoResultError`), `executeTakeFirst()` to `execTakeFirstOrNone()` and `executeCount()` to `execCount()`. `execTakeFirstOrNone()` still succeeds with `undefined` when there is no row.
