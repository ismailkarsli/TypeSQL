---
"@typesql/core": minor
"@typesql/pg": minor
"@typesql/mysql": minor
"@typesql/postgres": minor
"@typesql/sqlite": minor
"@typesql/drizzle": minor
---

`sql.transaction()` rejects while a transaction is open on the same connection (a pg `Client` or `PoolClient`, a mysql2 or mariadb connection, a postgres.js `ReservedSql`, a SQLite database), including one on the outer `sql` inside a transaction. Before, overlapping calls on PostgreSQL and MySQL shared one transaction, so the first `COMMIT` also committed the second one's writes, and on SQLite they waited in a queue, where one on the outer `sql` never ended. Use `tx` inside a transaction, wait for the other to end, or use a pool. mysql2 and mariadb connections now use their own `beginTransaction()`, `commit()` and `rollback()`. In `@typesql/core/adapter`, `exclusiveTransaction` replaces `serialTransaction`.
