---
"@typesql/prisma": patch
---

On PostgreSQL, send every `sql.json()` value to Prisma as a `JSON.stringify` string, so arrays and strings (`sql.json([1, 2])`, `sql.json("hello")`, also in `sql.set` and `sql.values`) no longer fail with `invalid input syntax for type json`.
