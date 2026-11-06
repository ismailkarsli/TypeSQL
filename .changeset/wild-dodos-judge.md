---
"@typesql/core": patch
---

PostgreSQL: a window name used inside `POSITION`, `SUBSTRING`, `TRIM` or `OVERLAY` must be defined, and a built-in function called with a number of arguments none of its overloads takes is an error (`function upper(text, text) does not exist`) instead of an `unknown` column.
