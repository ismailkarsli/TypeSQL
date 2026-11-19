---
"@typesql/core": minor
"@typesql/effect": minor
---

Statements have `execOne()` and `execOneOrNone()`, which reject with the new `TooManyRowsError` (carrying `text` and `count`) when the query returns more than one row; `execOne()`, like `execTakeFirst()`, rejects with `NoResultError` when there is no row. `execTakeFirst()` and `execTakeFirstOrNone()` are deprecated, since they silently drop extra rows: switch to the new methods, add `LIMIT 1` for the first of several rows, or take `[0]` of `exec()`. On `@typesql/effect` both are tagged errors.
