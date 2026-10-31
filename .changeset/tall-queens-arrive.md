---
"@typesql/core": minor
---

Add `sql.and([...])` and `sql.or([...])`, which combine conditions with `AND` or `OR` in parentheses, skip `sql.empty` items, give `true` or `false` when no condition is left, and keep the statement type-checked like `sql.combine`; editors no longer suggest `" AND "` and `" OR "` as `sql.combine` separators.
