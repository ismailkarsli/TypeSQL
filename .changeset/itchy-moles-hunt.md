---
"@typesql/core": patch
---

A window function inside the array of `x = ANY (ARRAY[…])` is checked like any other (`window "w" does not exist`).
