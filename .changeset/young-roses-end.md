---
"@typesql/kysely": patch
---

`stream()` reads rows with Kysely's query streaming; on PostgreSQL, `PostgresDialect` needs its `cursor` option for it.
