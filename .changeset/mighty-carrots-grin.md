---
"@typesql/core": patch
---

An ORDER BY / GROUP BY position written with leading zeros (`ORDER BY 01`) is that position, and one past the int4 range is a non-integer constant, as in PostgreSQL.
