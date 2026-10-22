---
"@typesql/postgres": patch
---

`execute(db, q)` resolves to 0 instead of `null` for statements without a count, such as DDL, and `PostgresJsRows["count"]` is `number | null`.
