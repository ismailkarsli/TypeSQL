---
"@typesql/core": patch
---

`x op ANY|ALL (SELECT …)` and `(a, b) op (SELECT …)` compare the operands pairwise, as in PostgreSQL: a row takes any operator, which must yield boolean (`1 + ANY (SELECT 1)` is `row comparison operator must yield type boolean, not type integer`; it was accepted), and a row of several columns needs a comparison operator.
