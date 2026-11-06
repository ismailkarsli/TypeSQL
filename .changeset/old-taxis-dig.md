---
"@typesql/core": patch
---

PostgreSQL: `CASE`, `COALESCE`, `UNION`, `JOIN … USING` and the other constructs that find a common type follow PostgreSQL's implicit casts: of two types that convert to each other the first is kept (`coalesce(oid_col, regclass_col)` is `oid`), and `"char"` with `text` or `time` with `interval` are reported as types that cannot be matched.
