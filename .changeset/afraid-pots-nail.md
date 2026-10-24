---
"@typesql/core": patch
---

`SELECT … INTO` inside a WITH query is rejected with PostgreSQL's `SELECT ... INTO is not allowed here` (it was read as a data-modifying WITH query), and that error points at the new table's name, as in PostgreSQL.
