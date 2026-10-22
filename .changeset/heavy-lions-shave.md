---
"@typesql/core": patch
---

Declare typed JSON columns with `Json<T>`: rows read `T`, `->` / `#>` index into it, parameters take `T`, and `${sql.json(value)}` sends JSON the same way with pg and postgres.js; a raw array passed to a json / jsonb parameter with `sql.param()` is now a compile error.
