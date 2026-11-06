---
"@typesql/core": patch
---

On SQLite, which has no `DEFAULT` in a `VALUES` row, `sql.values` rows that give different columns, or a value that can be `undefined` where another row sends one, are a type error instead of a runtime error.
