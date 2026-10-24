---
"@typesql/core": patch
---

A window function in the operand of `IN (SELECT …)` is checked like any other (`window "w" does not exist`).
