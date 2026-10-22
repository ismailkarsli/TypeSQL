---
"@typesql/pg": minor
"@typesql/postgres": minor
"@typesql/kysely": minor
"@typesql/prisma": minor
---

Queries run from the `sql` bound to your client: `createSql<DB>(client)` then `sql("…").execute()` (or `executeTakeFirst`, `executeTakeFirstOrThrow`, `executeCount`), and `sql.transaction(async (tx) => …)` for transactions, nested with savepoints; the `query`, `one`, `maybeOne`, `many`, `execute`, `transaction` and `RowCountError` exports of `@typesql/pg` and `@typesql/postgres`, `query` and `execute` of `@typesql/kysely`, and `queryRaw` and `executeRaw` of `@typesql/prisma` are removed.
