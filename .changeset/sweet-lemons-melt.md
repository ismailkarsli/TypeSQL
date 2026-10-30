---
"@typesql/core": patch
---

Accept sql.json() values in sql.set, sql.values and inline for SQLite json columns, which were rejected because those columns read as JSON text.
