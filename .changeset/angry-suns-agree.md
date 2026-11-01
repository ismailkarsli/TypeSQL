---
"@typesql/core": patch
---

SQLite: after ALTER TABLE … DROP COLUMN, SELECT *, RETURNING * and INSERT … VALUES keep the columns after the dropped one.
