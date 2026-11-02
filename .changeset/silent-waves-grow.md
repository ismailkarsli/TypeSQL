---
"@typesql/core": patch
---

Type-check SQLite schemas built by many statements much faster: a history of 300 `CREATE TABLE` migrations checks in about 5 seconds instead of 42, and 300 `ALTER TABLE … ADD COLUMN` migrations on one table no longer run out of memory, because each column type is built from plain values and a table's column order is read in one pass.
