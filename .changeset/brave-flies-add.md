---
"@typesql/core": patch
---

Accept readonly arrays for PostgreSQL array parameters, so inline array literals work in sql.set and sql.values and as const arrays work as arguments.
