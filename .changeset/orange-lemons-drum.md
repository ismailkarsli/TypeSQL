---
"@typesql/core": patch
---

Migrations check `CREATE INDEX` against the table: a misspelled column in a key, an expression, `INCLUDE` or the `WHERE` predicate is a compile error, such as `column "emial" does not exist` on PostgreSQL, `Key column 'emial' doesn't exist in table` on MySQL and MariaDB and `no such column: emial` on SQLite. Before, PostgreSQL skipped the statement and MySQL and SQLite checked only the table, so the typo failed when the migration ran.
