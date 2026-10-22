---
"@typesql/pg": patch
"@typesql/postgres": patch
---

The type maps declare what parameters accept (`PgParamTypeMap`, `PostgresJsParamTypeMap`), so `int8`/`numeric` parameters take numbers and bigints and timestamp parameters take strings; postgres.js timestamp parameters also take epoch milliseconds.
