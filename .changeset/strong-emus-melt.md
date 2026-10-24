---
"@typesql/core": patch
---

`INSERT INTO t AS excluded … ON CONFLICT DO UPDATE SET c = excluded.c` is an error (`table reference "excluded" is ambiguous`), as in PostgreSQL.
