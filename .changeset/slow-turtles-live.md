---
"@typesql/core": patch
---

`x NOT IN (SELECT …)`, `x <> ALL (…)` and SQLite's `x NOT IN ()` no longer make `x` non-null: they are true for a NULL `x` when the subquery or list is empty.
