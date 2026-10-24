---
"@typesql/core": patch
---

A call decoration the function does not take is an error, as in PostgreSQL: `*`, `DISTINCT`, `FILTER` or `OVER` on a plain function (`lower(x) FILTER (…)`), a window function without `OVER`, and `count()` without `*`.
