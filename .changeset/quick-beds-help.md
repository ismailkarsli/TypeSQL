---
"@typesql/core": patch
---

A row compared with a subquery (`(a, b) = (SELECT x, y …)`) is a nullable boolean and needs a subquery of the same width, as in PostgreSQL; it was rejected as a scalar subquery with more than one column.
