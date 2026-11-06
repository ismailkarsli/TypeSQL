---
"@typesql/core": patch
---

PostgreSQL: arrays with NULL elements keep `(T | null)[]` through `VALUES` and recursive CTEs, and a parameter combined with an aggregate under `GROUP BY ROLLUP`, `CUBE` or `GROUPING SETS` accepts `null`, since the total row's aggregate can be NULL.
