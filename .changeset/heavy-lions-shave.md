---
"@typesql/core": patch
---

Declare typed JSON columns with `Json<T>`: rows read `T`, `->` / `#>` index into it, parameters take `T`, and `sql.json(value)` sends JSON the same way with pg and postgres.js, inline or as a `sql.set` / `sql.values` value; a raw array for a json / jsonb parameter (through `sql.param()`, `sql.set` or `sql.values`) is now a compile error.
