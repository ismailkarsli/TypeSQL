---
"@typesql/core": patch
---

`SELECT DISTINCT *` checks its ORDER BY too: an expression that is not in the select list (`ORDER BY id + 1`) is an error, as in PostgreSQL.
