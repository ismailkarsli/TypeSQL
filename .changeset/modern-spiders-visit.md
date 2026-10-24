---
"@typesql/core": patch
---

`x IN (SELECT …)` and `x = ANY (SELECT …)` over a subquery without columns report `subquery has too few columns`, as PostgreSQL does.
