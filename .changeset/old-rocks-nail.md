---
"@typesql/core": patch
---

An assignment target with `.*` (`SET col.* = …`, `INSERT INTO t (col.*)`) reports PostgreSQL's `row expansion via "*" is not supported here` at the column.
