---
"@typesql/core": patch
---

`SELECT … INTO` without a table name is a syntax error, as in PostgreSQL, instead of being accepted.
