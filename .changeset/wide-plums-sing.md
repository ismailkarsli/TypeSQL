---
"@typesql/core": patch
---

A JOIN's `ON` condition can only reference the two sides of its join, `SELECT DISTINCT` needs a target list, and a function in `FROM` cannot have `OVER` / `FILTER` / `WITHIN GROUP`, as in Postgres.
