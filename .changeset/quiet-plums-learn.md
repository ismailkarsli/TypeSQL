---
"@typesql/core": patch
---

A declared PostgreSQL function returning a table's row, declared `nullable: false`, keeps that table's column nullability in `FROM`, for a function that raises rather than returning NULL. Without the flag, its columns are nullable as before.
