---
"@typesql/core": patch
---

A `GROUPING SETS (…)` whose parenthesis is never closed is a syntax error, as in PostgreSQL (it was accepted).
