---
"@typesql/core": patch
---

MySQL, MariaDB and SQLite: `INSERT INTO t VALUES (…)` without a column list no longer types its parameters against the wrong columns when the schema has no `position` flags; it checks the number of values and types the parameters as `unknown`. The columns of an `ON DUPLICATE KEY UPDATE` row alias with a column list (`AS new(a, b)`) now follow the table's positions, and `FIRST` / `AFTER` in a migration's `ALTER TABLE` no longer invent positions for a table without them.
