---
"@typesql/drizzle": patch
---

`executor(db)` works on a Drizzle SQLite database too, as `sqliteExecutor(db)` does, instead of failing because the database has no PostgreSQL client.
