---
"@typesql/core": patch
"@typesql/pg": patch
"@typesql/postgres": patch
"@typesql/sqlite": patch
"@typesql/kysely": patch
"@typesql/drizzle": patch
"@typesql/prisma": patch
---

The README examples pass values inline with `${sql.param(value)}` (and `tx.param(value)` in transactions) instead of positional arguments.
