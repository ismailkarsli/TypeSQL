---
"@typesql/core": patch
---

A sort order in an `ON CONFLICT` target (`ON CONFLICT (email DESC)`, `NULLS FIRST`) is an error, as in PostgreSQL.
