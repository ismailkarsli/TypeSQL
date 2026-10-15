---
"@typesql/pg": patch
"@typesql/postgres": patch
"@typesql/kysely": patch
"@typesql/drizzle": patch
"@typesql/prisma": patch
---

Export `executor(client)` for `q.execute()`, and `createSql` accepts the client so queries run on it by default.
