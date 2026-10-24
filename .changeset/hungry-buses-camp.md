---
"@typesql/core": patch
---

A column of `CREATE TABLE … AS SELECT NULL AS x` or of a view over `SELECT NULL` is `text`, as in PostgreSQL, instead of a column that only takes `null`.
